import { useMemo, useRef, useState } from 'react'
import { describeDays, isPaused, scheduleOf } from '@/lib/reminders'
import { isPaidPremium, isPremium, price, TRIAL_DAYS, trialState } from '@/lib/plan'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { formatDate } from '@/lib/dates'
import { describeError } from '@/lib/errors'
import { useNavigate } from 'react-router-dom'
import { exportAllData, loadSamples, resetAllData, setMonthlyBudget, updateProfile, updateSettings } from '@/db/repo'
import { useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { CURRENCIES, currencySymbol, validateBudget } from '@/lib/money'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card, Divider, Row, SectionTitle, Skeleton } from '@/components/ui/Primitives'
import { SelectField, TextField, Toggle } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { Button, TextLink } from '@/components/ui/Button'
import { useAuth } from '@/auth/AuthContext'
import { PasswordField } from '@/pages/auth/AuthLayout'
import { leaveSheet } from '@/lib/navigation'

export default function Settings() {
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useSettings()
  const profile = useProfile()
  const subs = useSubscriptions()
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const scheduleSummary = useMemo(() => {
    const s = scheduleOf(settings)
    return isPaused(s) ? `Paused${s.pausedUntil ? ` until ${formatDate(s.pausedUntil, 'd MMM')}` : ''}` : `${describeDays(s.days)} at ${s.time}`
  }, [settings])
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [reminderDraft, setReminderDraft] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const auth = useAuth()
  const [del, setDel] = useState<{ open: boolean; password: string; show: boolean; error: string; busy: boolean }>({ open: false, password: '', show: false, error: '', busy: false })

  const lock = useRef(false)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  /** Preference changes confirm quietly inline; only bigger actions and errors use a toast. */
  const act = async (label: string, fn: () => Promise<void>, opts: { quiet?: boolean } = {}) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await fn()
      if (opts.quiet) {
        setSavedFlash(label)
        window.setTimeout(() => setSavedFlash(null), 1400)
      } else toast.success(label)
    } catch (e) {
      toast.error(describeError(e, 'save that setting'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const commitBudget = () => {
    if (budgetDraft === null || !settings || !profile) return
    const { error, parsed } = validateBudget(budgetDraft, profile.currency)
    setBudgetError(error)
    if (error) return
    setBudgetDraft(null)
    if (parsed !== settings.monthlyBudget) void act(parsed === null ? 'Limit cleared' : 'Limit saved', () => setMonthlyBudget(parsed), { quiet: true })
  }

  const commitReminder = () => {
    if (reminderDraft === null || !settings) return
    const v = Number(reminderDraft)
    if (!Number.isInteger(v) || v < 0 || v > 90) {
      toast.error('Use a whole number of days up to 90')
      setReminderDraft(null)
      return
    }
    setReminderDraft(null)
    if (v !== settings.defaultReminderDays) void act('Reminder updated', () => updateSettings({ defaultReminderDays: v }), { quiet: true })
  }

  const doExport = async () => {
    setBusy(true)
    try {
      const json = await exportAllData()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `subscription-tracker-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      if (navigator.clipboard) await navigator.clipboard.writeText(json).catch(() => undefined)
      toast.success('Backup downloaded and copied to clipboard')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  if (!settings || !profile) {
    return (
      <div>
        <PageHeader title="Settings" back backTo="/profile" />
        <Page className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </Page>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        back
        backTo="/profile"
        right={
          <span className={`flex items-center gap-1 text-[12px] font-semibold text-mint-700 transition-opacity ${savedFlash ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
            <Icon name="check" size={14} /> {savedFlash ?? 'Saved'}
          </span>
        }
      />
      <Page className="space-y-6">
        <section>
          <SectionTitle>Money</SectionTitle>
          <Card className="space-y-4 p-4">
            <SelectField
              label="Currency"
              value={profile.currency}
              onChange={(e) => act('Currency updated', () => updateProfile({ currency: e.target.value }), { quiet: true })}
              hint="Display only. Existing amounts are not converted."
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Monthly limit"
              inputMode="decimal"
              placeholder="No limit"
              value={budgetDraft ?? (settings.monthlyBudget === null ? '' : String(settings.monthlyBudget))}
              onChange={(e) => {
                setBudgetDraft(e.target.value)
                setBudgetError(null)
              }}
              onBlur={commitBudget}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              leading={<span className="font-semibold">{currencySymbol(profile.currency)}</span>}
              error={budgetError ?? undefined}
              hint="Shown as a progress bar on the dashboard. History and explanation are on the Monthly total screen."
            />
            <TextLink onClick={() => navigate('/total')}>Open Monthly total</TextLink>
            <Toggle label="Compact amounts" description="Drop cents on large numbers" checked={settings.compactAmounts} onChange={(v) => act('Saved', () => updateSettings({ compactAmounts: v }), { quiet: true })} />
          </Card>
        </section>

        <section>
          <SectionTitle>Reminders</SectionTitle>
          <Card className="p-4">
            <TextField
              label="Default reminder (days before renewal)"
              inputMode="numeric"
              value={reminderDraft ?? String(settings.defaultReminderDays)}
              onChange={(e) => setReminderDraft(e.target.value.replace(/\D/g, ''))}
              onBlur={commitReminder}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              hint="Each subscription can override this."
            />
            <Row onClick={() => navigate('/reminders')} className="-mx-4 mt-2 border-t border-line">
              <IconBox name="bell" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">Reminder schedule</span>
                <span className="block text-[13px] text-muted">{scheduleSummary}</span>
              </span>
            </Row>
            <div className="mt-2 divide-y divide-line">
              <Toggle label="Upcoming renewals" description="Show renewals due soon on the dashboard" checked={settings.notifyRenewals} onChange={(v) => act('Saved', () => updateSettings({ notifyRenewals: v }), { quiet: true })} />
              <Toggle label="Price changes" description="Flag recent increases" checked={settings.notifyPriceChanges} onChange={(v) => act('Saved', () => updateSettings({ notifyPriceChanges: v }), { quiet: true })} />
              <Toggle label="Trials ending" description="Warn before a trial converts" checked={settings.notifyTrials} onChange={(v) => act('Saved', () => updateSettings({ notifyTrials: v }), { quiet: true })} />
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Display</SectionTitle>
          <Card className="p-4">
            <div className="divide-y divide-line">
              <Toggle label="Week starts on Monday" checked={settings.weekStartsOn === 1} onChange={(v) => act('Saved', () => updateSettings({ weekStartsOn: v ? 1 : 0 }), { quiet: true })} />
              <Toggle label="Show cancelled in list" description="Keep cancelled plans visible under “All”" checked={settings.showCancelledInList} onChange={(v) => act('Saved', () => updateSettings({ showCancelledInList: v }), { quiet: true })} />
              <Toggle
                label="Spending insights"
                description="Breakdowns, highlights and trends on Home and the Insights tab. Totals and renewals stay on either way."
                checked={settings.insightsEnabled !== false}
                onChange={(v) => act(v ? 'Insights on' : 'Insights off', () => updateSettings({ insightsEnabled: v }), { quiet: true })}
              />
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Data</SectionTitle>
          <Card className="overflow-hidden">
            <Row onClick={doExport} chevron={false}>
              <IconBox name="download" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">Export backup</span>
                <span className="block text-[13px] text-muted">Download everything as JSON</span>
              </span>
            </Row>
            {subs && subs.length === 0 && (
              <>
                <Divider />
                <Row onClick={() => act('Sample subscriptions added', loadSamples)} chevron={false}>
                  <IconBox name="sparkle" />
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold text-ink">Load sample subscriptions</span>
                    <span className="block text-[13px] text-muted">Ten realistic examples to explore with</span>
                  </span>
                </Row>
              </>
            )}
            <Divider />
            <Row onClick={() => setConfirmReset(true)} chevron={false}>
              <IconBox name="trash" tone="coral" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-coral-700">Erase all data</span>
                <span className="block text-[13px] text-muted">Removes subscriptions, notes and profile</span>
              </span>
            </Row>
          </Card>
        </section>

        {auth.status === 'signed-in' && auth.user && (
          <section>
            <SectionTitle>Account</SectionTitle>
            <Card className="overflow-hidden">
              <div className="px-4 py-3">
                <span className="block text-[15px] font-semibold text-ink">{auth.user.email}</span>
                <span className="block text-[13px] text-muted">Password and sign-out are on your Profile.</span>
              </div>
              <Divider />
              <Row chevron={false} onClick={() => setDel({ open: true, password: '', show: false, error: '', busy: false })}>
                <IconBox name="trash" tone="coral" />
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-coral-700">Delete account</span>
                  <span className="block text-[13px] text-muted">Removes your account and everything in it</span>
                </span>
              </Row>
            </Card>
          </section>
        )}

        <section>
          <SectionTitle>Plan</SectionTitle>
          <Card className="overflow-hidden">
            <Row onClick={() => navigate('/premium')}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isPremium(profile) ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-navy-700'}`}>
                <Icon name="crown" size={20} />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">
                  {isPaidPremium(profile) ? `Premium ${profile.premiumInterval}` : trialState(profile).status === 'active' ? `Premium trial · day ${trialState(profile).day} of ${TRIAL_DAYS}` : 'Free plan'}
                </span>
                <span className="block text-[13px] text-muted">
                  {isPaidPremium(profile)
                    ? 'Manage or restore your plan'
                    : trialState(profile).status === 'active'
                      ? `Ends ${formatDate(trialState(profile).endsOn!, 'EEE d MMM')} · manage or choose a plan`
                      : `Up to ${FREE_SUBSCRIPTION_LIMIT} subscriptions · Premium is ${price('monthly')}/mo or ${price('yearly')}/yr`}
                </span>
              </span>
            </Row>
          </Card>
        </section>

        <p className="px-1 text-center text-[12px] text-faint">Subscription Tracker 1.0 · {auth.status === 'signed-in' ? 'Backed up to your account' : 'Data is stored locally in your browser'}</p>
      </Page>

      <Sheet open={del.open} onClose={() => setDel((d) => ({ ...d, open: false }))} title="Delete your account?">
        <p className="text-[15px] leading-relaxed text-muted">
          This permanently deletes your account, all {subs?.length ?? 0} subscriptions, every price change and note, and the copy on this device. There is no undo. Export a backup first if you want to keep a record.
        </p>
        <form
          onSubmit={async (e2) => {
            e2.preventDefault()
            if (del.busy) return
            if (!del.password) return setDel((d) => ({ ...d, error: 'Enter your password to confirm.' }))
            setDel((d) => ({ ...d, busy: true, error: '' }))
            try {
              await auth.deleteAccount(del.password)
              toast.info('Your account and data have been deleted.')
              leaveSheet(navigate, '/')
            } catch (e3) {
              setDel((d) => ({ ...d, busy: false, error: describeError(e3, 'delete the account') }))
            }
          }}
          className="mt-4 space-y-4"
          noValidate
        >
          <PasswordField label="Confirm with your password" value={del.password} onChange={(v) => setDel((d) => ({ ...d, password: v, error: '' }))} error={del.error} show={del.show} onToggle={() => setDel((d) => ({ ...d, show: !d.show }))} autoComplete="current-password" />
          <Button type="submit" full size="lg" variant="coral" loading={del.busy}>
            Delete account and all data
          </Button>
          <Button type="button" full size="lg" variant="ghost" onClick={() => setDel((d) => ({ ...d, open: false }))}>
            Keep my account
          </Button>
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Erase everything?"
        body="All subscriptions, price history, notes and your profile will be deleted from this device. Export a backup first if you might want it back."
        confirmLabel="Erase all data"
        loading={busy}
        onConfirm={() =>
          act('All data erased', async () => {
            await resetAllData()
            setConfirmReset(false)
            leaveSheet(navigate, '/')
          })
        }
      />
    </div>
  )
}

function IconBox({ name, tone = 'navy' }: { name: 'download' | 'sparkle' | 'trash' | 'bell'; tone?: 'navy' | 'coral' }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === 'coral' ? 'bg-coral-50 text-coral-700' : 'bg-navy-50 text-navy-700'}`}>
      <Icon name={name} size={20} />
    </span>
  )
}
