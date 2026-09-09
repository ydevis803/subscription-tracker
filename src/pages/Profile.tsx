import { useMemo, useRef, useState, type FormEvent } from 'react'
import { describeError } from '@/lib/errors'
import { categoryTotals } from '@/components/app/CategoryBreakdown'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from '@/db/repo'
import { useNotes, usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { MILESTONES } from '@/lib/milestones'
import { everHadPositiveMoment, inviteProgress } from '@/lib/referral'
import { CHALLENGE_DAYS_TOTAL, challengeState } from '@/lib/challenge'
import { ChallengeDots } from '@/components/app/ChallengeCard'
import { setChallengeHidden } from '@/db/repo'
import { db } from '@/db/schema'
import { useLiveQuery } from 'dexie-react-hooks'
import { useScopeKey } from '@/auth/AuthContext'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { countedForLimit, isPaidPremium, isPremium, price, trialState } from '@/lib/plan'
import { formatDate } from '@/lib/dates'
import { monthlyEquivalent, formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Badge, Card, Divider, Row, Skeleton } from '@/components/ui/Primitives'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'
import { TextField } from '@/components/ui/Field'
import { Button, IconButton } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/auth/AuthContext'
import { AccountExplainerSheet, SaveProgressCard } from '@/components/app/Account'
import { PasswordField } from '@/pages/auth/AuthLayout'

export default function Profile() {
  const navigate = useNavigate()
  const toast = useToast()
  const profile = useProfile()
  const subs = useSubscriptions()
  const notes = useNotes()
  const changes = usePriceChanges()
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<{ name?: string; email?: string }>({})
  const [saving, setSaving] = useState(false)
  const auth = useAuth()
  const [explainer, setExplainer] = useState(false)
  const [pw, setPw] = useState<{ open: boolean; current: string; next: string; show: boolean; error: string; busy: boolean }>({ open: false, current: '', next: '', show: false, error: '', busy: false })
  const [signingOut, setSigningOut] = useState(false)

  const premium = isPremium(profile)
  const used = subs ? countedForLimit(subs) : 0
  const settings = useSettings()
  const scopeKey = useScopeKey()
  const allChecks = useLiveQuery(() => db.renewalChecks.toArray(), [scopeKey]) ?? []
  const milestoneCtx = useMemo(() => (subs && notes && settings && profile ? { subs, notes, changes: changes ?? [], checks: allChecks, settings, currency: profile.currency } : null), [subs, notes, changes, allChecks, settings, profile])
  const topCategory = useMemo(() => {
    const totals = categoryTotals(subs ?? [])
    return totals[0]?.name ?? null
  }, [subs])
  const openNotes = (notes ?? []).filter((n) => n.status === 'open').length
  const invites = inviteProgress(settings)
  const challenge = challengeState(settings)
  const canInvite = !!notes && !!settings && everHadPositiveMoment({ checks: allChecks, settings, notes })

  const openEdit = () => {
    setName(profile?.name ?? '')
    setEmail(profile?.email ?? '')
    setErr({})
    setEdit(true)
  }

  const inFlight = useRef(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    const next: typeof err = {}
    if (name.trim().length < 1) next.name = 'Name cannot be empty.'
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'That email does not look right.'
    setErr(next)
    if (Object.keys(next).length) return
    inFlight.current = true
    setSaving(true)
    try {
      await updateProfile({ name: name.trim(), email: email.trim() })
      if (auth.status === 'signed-in' && name.trim() !== auth.user?.name) await auth.updateName(name.trim()).catch(() => undefined)
      toast.success('Profile updated')
      setEdit(false)
    } catch (e2) {
      toast.error(describeError(e2, 'save your profile'))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const avatar = (profile?.name ?? '?').trim().slice(0, 1).toUpperCase() || '?'

  return (
    <div>
      <PageHeader title="Profile" large right={<IconButton icon="settings" label="Settings" onClick={() => navigate('/settings')} />} />
      <Page className="space-y-5">
        <Card className="p-5">
          {!profile ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-44" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 text-2xl font-bold text-mint-400">{avatar}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="break-words text-xl font-bold leading-tight text-navy-900">{profile.name || 'Add your name'}</h2>
                  <Badge tone={premium ? 'mint' : 'gray'}>{isPaidPremium(profile) ? 'Premium' : premium ? `Trial · day ${trialState(profile).day}` : 'Free'}</Badge>
                </div>
                <p className="break-all text-[0.8125rem] text-muted">{auth.status === 'signed-in' ? auth.user?.email : profile.email || 'No email added'}</p>
                <p className="text-[0.75rem] text-faint">Tracking since {formatDate(profile.createdAt.slice(0, 10), 'MMM yyyy')}</p>
                {invites.top && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-mint-700">
                    <Icon name={invites.top.icon} size={12} /> {invites.top.title}
                  </span>
                )}
              </div>
              <IconButton icon="edit" size={20} label="Edit profile" onClick={openEdit} />
            </div>
          )}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Stat label="Tracked" value={subs ? String(used) : '–'} />
            <Stat label="Per month" value={subs && profile ? formatMoney(monthlyEquivalent(subs), profile.currency, { compact: true }) : '–'} />
            <Stat label="Open notes" value={notes ? String(openNotes) : '–'} />
          </div>
        </Card>

        {auth.status === 'signed-in' ? (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                <Icon name="shield" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">Backed up to your account</span>
                <span className="block text-[0.8125rem] text-muted">
                  {auth.sync.status === 'syncing'
                    ? 'Saving changes…'
                    : auth.sync.status === 'offline'
                      ? 'Offline. Changes save here and sync when you are back online.'
                      : auth.sync.status === 'error'
                        ? `Sync problem: ${auth.sync.message ?? 'will retry'}`
                        : auth.sync.at
                          ? `Synced ${formatDate(auth.sync.at.slice(0, 10))} at ${new Date(auth.sync.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Every change is saved to your account.'}
                </span>
              </span>
            </div>
            <Divider />
            <Row onClick={() => setPw((p) => ({ ...p, open: true, current: '', next: '', error: '' }))}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                <Icon name="eye" size={20} />
              </span>
              <span className="flex-1 text-[0.9375rem] font-semibold text-ink">Change password</span>
            </Row>
            <Divider />
            <Row
              chevron={false}
              onClick={async () => {
                setSigningOut(true)
                try {
                  await auth.signOut()
                  toast.info('Signed out. Your data stays safe in your account.')
                  navigate('/', { replace: true })
                } catch (e2) {
                  toast.error(e2 instanceof Error ? e2.message : 'Could not sign out')
                  setSigningOut(false)
                }
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-50 text-coral-700">
                <Icon name="x" size={20} />
              </span>
              <span className="flex-1 text-[0.9375rem] font-semibold text-coral-700">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </Row>
          </Card>
        ) : (
          <SaveProgressCard count={subs?.length ?? 0} onOpen={() => setExplainer(true)} />
        )}

        <Card className="overflow-hidden">
          <button onClick={() => navigate('/premium')} className="flex w-full items-center gap-3 p-4 text-left active:bg-navy-50">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${premium ? 'bg-mint-100 text-mint-700' : 'bg-navy-900 text-mint-400'}`}>
              <Icon name="crown" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-ink">{premium ? 'Premium is active' : 'Upgrade to Premium'}</span>
              <span className="block text-[0.8125rem] text-muted">
                {premium
                  ? `${profile?.premiumInterval === 'yearly' ? 'Yearly' : 'Monthly'} plan · renews ${profile?.premiumRenewsOn ? formatDate(profile.premiumRenewsOn) : ''}`
                  : `${used} of ${FREE_SUBSCRIPTION_LIMIT} free subscriptions used · unlimited from ${price('monthly')}/mo`}
              </span>
            </span>
            <Icon name="chevronRight" size={18} className="text-faint" />
          </button>
        </Card>

        <Card className="overflow-hidden">
          <Link
            icon="chart"
            label="Spending insights"
            hint={subs && profile ? (topCategory ? `${formatMoney(monthlyEquivalent(subs), profile.currency)}/mo · most on ${topCategory}` : 'Add a subscription to see where money goes') : ''}
            onClick={() => navigate('/insights')}
          />
          <Divider />
          <Link icon="trend" label="Price history" hint={changes ? `${changes.length} recorded` : ''} onClick={() => navigate('/history')} />
          <Divider />
          <Link icon="note" label="Cancellation notes" hint={openNotes ? `${openNotes} open` : 'None open'} onClick={() => navigate('/notes')} />
          {canInvite && (
            <>
              <Divider />
              <Link icon="gift" label="Invite a friend" hint={invites.count === 0 ? 'Share your link · earn a cosmetic badge' : `${invites.count} shared${invites.next ? ` · ${invites.next.at - invites.count} more for ${invites.next.title}` : ' · every badge earned'}`} onClick={() => navigate('/invite')} />
            </>
          )}
        </Card>

        {settings && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-bold text-navy-900">Seven-day starter</p>
                <p className="text-[0.8125rem] text-muted">
                  {challenge.complete ? 'All seven days done' : challenge.started ? `${challenge.completedCount} of ${CHALLENGE_DAYS_TOTAL} days done · next: ${challenge.current?.title}` : 'Starts on Home the next time you open it'}
                </p>
              </div>
              <ChallengeDots settings={settings} size="sm" />
            </div>
            {challenge.started && !challenge.complete && (
              <div className="mt-3 flex gap-2">
                {challenge.hidden ? (
                  <Button size="sm" variant="mint" onClick={async () => { await setChallengeHidden(false); toast.success('Challenge is back on Home'); navigate('/') }}>
                    Show on Home again
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => navigate(challenge.current!.path)}>
                    Continue day {challenge.current!.day}
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        {milestoneCtx && (
          <Card className="p-4">
            <p className="text-[0.9375rem] font-bold text-navy-900">Milestones</p>
            <ul className="mt-2 divide-y divide-line">
              {[...MILESTONES].reverse().map((m) => {
                const seenAt = settings?.milestonesSeen?.[m.id]
                const earned = !!seenAt || m.met(milestoneCtx)
                return (
                  <li key={m.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${earned ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-faint'}`}>
                      <Icon name={m.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[0.875rem] font-semibold ${earned ? 'text-ink' : 'text-muted'}`}>{m.title}</span>
                      <span className="block text-[0.75rem] leading-snug text-muted">{earned ? (seenAt ? `Earned ${formatDate(seenAt.slice(0, 10), 'd MMM yyyy')}` : 'Earned') : m.howTo}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
              <Icon name="shield" size={20} />
            </span>
            <div>
              <p className="text-[0.875rem] font-semibold text-ink">{auth.status === 'signed-in' ? 'Only you can see this' : 'Your data stays on this device'}</p>
              <p className="text-[0.8125rem] leading-relaxed text-muted">
                {auth.status === 'signed-in'
                  ? 'Your list is stored under your account and never shared. Signing out removes the local copy from this device.'
                  : 'Nothing is uploaded until you create an account. Export a backup from Settings before switching phones or clearing your browser.'}
              </p>
            </div>
          </div>
        </Card>
      </Page>

      <AccountExplainerSheet open={explainer} onClose={() => setExplainer(false)} next="/profile" />
      <Sheet open={pw.open} onClose={() => setPw((p) => ({ ...p, open: false }))} title="Change password">
        <form
          onSubmit={async (e2) => {
            e2.preventDefault()
            if (pw.next.length < 8) return setPw((p) => ({ ...p, error: 'New password needs at least 8 characters.' }))
            setPw((p) => ({ ...p, busy: true, error: '' }))
            try {
              await auth.changePassword(pw.current, pw.next)
              toast.success('Password changed')
              setPw((p) => ({ ...p, open: false, busy: false }))
            } catch (e3) {
              setPw((p) => ({ ...p, busy: false, error: describeError(e3, 'change your password') }))
            }
          }}
          className="space-y-4"
          noValidate
        >
          <PasswordField label="Current password" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} show={pw.show} onToggle={() => setPw((p) => ({ ...p, show: !p.show }))} autoComplete="current-password" />
          <PasswordField label="New password" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} error={pw.error} show={pw.show} onToggle={() => setPw((p) => ({ ...p, show: !p.show }))} autoComplete="new-password" hint="At least 8 characters. Other devices are signed out." />
          <Button type="submit" full size="lg" loading={pw.busy}>
            Save new password
          </Button>
        </form>
      </Sheet>
      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit profile">
        <form onSubmit={save} className="space-y-4" noValidate>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={err.name} autoFocus autoComplete="given-name" />
          <TextField label="Email (optional)" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err.email} hint="Used only to label exports." autoComplete="email" />
          <Button type="submit" full size="lg" loading={saving}>
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-navy-50 py-2.5">
      <span className="tabular block text-[1.0625rem] font-bold text-navy-900">{value}</span>
      <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">{label}</span>
    </div>
  )
}

function Link({ icon, label, hint, onClick }: { icon: IconName; label: string; hint?: string; onClick: () => void }) {
  return (
    <Row onClick={onClick}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[0.8125rem] text-muted">{hint}</span>}
      </span>
    </Row>
  )
}
