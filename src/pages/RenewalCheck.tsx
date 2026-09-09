import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { finishCheckIfDone, recordDecision, startCheck } from '@/db/repo'
import { db } from '@/db/schema'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CheckDecisionKind, CheckSummary, Subscription } from '@/db/schema'
import { useActiveCheck, useNotes, usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { categoryOf } from '@/lib/categories'
import { CYCLE_LABEL, formatMoney } from '@/lib/money'
import { daysUntil, formatDate, relativeLower, renewalsInRange, toISO } from '@/lib/dates'
import { useSmartBack } from '@/lib/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge, Card, EmptyState, ProgressBar, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'

interface Item {
  key: string
  subscription: Subscription
  date: string
  amount: number
}

export default function RenewalCheck() {
  const navigate = useNavigate()
  const goBack = useSmartBack()
  const toast = useToast()
  const subs = useSubscriptions()
  const settings = useSettings()
  const profile = useProfile()
  const notes = useNotes()
  const priceChanges = usePriceChanges()
  const check = useActiveCheck()
  const [searchParams] = useSearchParams()
  const viewId = Number(searchParams.get('id'))
  const viewed = useLiveQuery(() => (viewId > 0 ? db.renewalChecks.get(viewId) : undefined), [viewId])
  const [revisit, setRevisit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [done, setDone] = useState<CheckSummary | null>(null)
  const starting = useRef(false)
  const completing = useRef(false)
  const finished = useRef(false) // set the instant a check completes, before React state catches up
  const seenActive = useRef(false) // once this visit has had an active check, never auto-start another
  const currency = profile?.currency ?? 'USD'
  const lead = settings?.defaultReminderDays ?? 3

  // Viewing a finished check from history shows its summary instead of starting a new one.
  useEffect(() => {
    if (viewed?.completedAt && viewed.summary && !done) setDone(viewed.summary)
  }, [viewed, done])

  // Make sure a check exists when this screen is opened directly. Once a check has been active during this
  // visit, a null here means it just completed (its history entry may still be writing), so never start another.
  useEffect(() => {
    if (check) seenActive.current = true
    if (viewId > 0 || finished.current || seenActive.current) return
    if (check === null && !done && !starting.current) {
      starting.current = true
      startCheck().finally(() => (starting.current = false))
    }
  }, [check, done])

  const items = useMemo<Item[]>(() => {
    if (!subs || !check) return []
    const current = renewalsInRange(subs, check.periodStart, check.periodEnd).map((o) => ({ key: `${o.subscription.id}:${o.date}`, subscription: o.subscription, date: o.date, amount: o.amount }))
    const byKey = new Map(current.map((i) => [i.key, i]))
    // Renewals that were cancelled during this check are no longer upcoming but still count as reviewed.
    for (const d of check.decisions) {
      if (byKey.has(d.key)) continue
      const sub = subs.find((s) => s.id === d.subscriptionId)
      if (sub) byKey.set(d.key, { key: d.key, subscription: sub, date: d.date, amount: d.amount })
    }
    return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.subscription.name.localeCompare(b.subscription.name))
  }, [subs, check])

  const decisions = useMemo(() => new Map((check?.decisions ?? []).map((d) => [d.key, d])), [check])
  const pending = items.filter((i) => !decisions.has(i.key))
  const reviewed = items.length - pending.length
  const current = revisit ? items.find((i) => i.key === revisit) : pending[0]
  const currentDecision = current ? decisions.get(current.key) : undefined

  // Nothing left to decide (also covers a check resumed after its last decision): complete and celebrate.
  useEffect(() => {
    if (!check || !subs || done || completing.current || busy) return
    if (pending.length > 0 || revisit) return
    if (items.length === 0 && check.decisions.length === 0 && subs.length === 0) return
    completing.current = true
    finishCheckIfDone(check.id!)
      .then((summary) => {
        if (summary) {
          finished.current = true
          setDone(summary)
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not finish the check'))
      .finally(() => (completing.current = false))
  }, [check, subs, pending.length, items.length, revisit, done, busy, toast])

  const decide = async (decision: CheckDecisionKind) => {
    if (!check || !current || busy) return
    setBusy(true)
    try {
      await recordDecision(check.id!, { subscriptionId: current.subscription.id!, date: current.date, amount: current.amount, decision, leadDays: lead })
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 900)
      if (decision === 'cancel') toast.success(`${current.subscription.name} marked as cancelled`)
      if (decision === 'remind') toast.success(`Reminder set for ${current.subscription.name}`)
      setRevisit(null)
      // Decide completion from the database, not from live-query snapshots that may lag behind.
      const summary = await finishCheckIfDone(check.id!)
      if (summary) {
        finished.current = true
        setDone(summary)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that decision')
    } finally {
      setBusy(false)
    }
  }

  const previousDecided = () => {
    const decided = items.filter((i) => decisions.has(i.key))
    if (revisit) {
      const idx = decided.findIndex((i) => i.key === revisit)
      return idx > 0 ? decided[idx - 1] : null
    }
    return decided[decided.length - 1] ?? null
  }

  if (done) {
    const budget = settings?.monthlyBudget ?? null
    return (
      <div className="min-h-dvh bg-canvas">
        <div className="mx-auto w-full max-w-[480px] pb-10">
          <PageHeader title="Renewal check" back backTo="/" />
          <Page className="flex flex-col items-center pt-6 text-center">
            <span className="pop flex h-24 w-24 items-center justify-center rounded-full bg-mint-500 text-navy-900 ring-8 ring-mint-100">
              <Icon name="check" size={44} />
            </span>
            <h1 className="mt-6 text-[28px] font-bold leading-tight text-navy-900">
              {viewed?.completedAt ? `Checked ${formatDate(toISO(new Date(viewed.completedAt)), 'd MMM')}: all clear for ${viewed.windowDays} days` : `You are all clear for the next ${check?.windowDays ?? 30} days`}
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              {done.reviewed === 0 ? 'Nothing renews in this window, so there was nothing to decide.' : `${done.reviewed} ${done.reviewed === 1 ? 'renewal' : 'renewals'} worth ${formatMoney(done.amountReviewed, currency)} reviewed. Nothing will surprise you.`}
            </p>
            <div className="mt-6 w-full rounded-3xl bg-navy-900 p-5 text-left text-white">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-mint-400">Monthly total now</p>
              <p className="tabular mt-1 text-[36px] font-bold leading-none">{formatMoney(done.monthlyTotal, currency)}</p>
              {budget !== null && (
                <p className={`mt-2 text-[14px] font-semibold ${done.monthlyTotal > budget ? 'text-coral-300' : 'text-mint-300'}`}>
                  {done.monthlyTotal > budget ? `${formatMoney(done.monthlyTotal - budget, currency)} over your ${formatMoney(budget, currency, { compact: true })} limit` : `${formatMoney(budget - done.monthlyTotal, currency)} under your ${formatMoney(budget, currency, { compact: true })} limit`}
                </p>
              )}
              {done.savedMonthly > 0 && <p className="mt-2 text-[14px] text-navy-100">You freed up {formatMoney(done.savedMonthly, currency)} a month by cancelling.</p>}
            </div>
            {done.reviewed > 0 && (
              <div className="mt-3 grid w-full grid-cols-3 gap-2">
                <Stat label="Kept" value={String(done.kept)} />
                <Stat label="Reminders" value={String(done.reminded)} />
                <Stat label="Cancelled" value={String(done.cancelled)} tone={done.cancelled > 0 ? 'coral' : 'navy'} />
              </div>
            )}
            <Button full size="lg" variant="mint" className="mt-6" onClick={() => goBack('/')} leading={<Icon name="home" size={20} />}>
              Back to Home
            </Button>
            {done.reminded > 0 && (
              <TextLink className="mt-1" onClick={() => navigate('/notes')}>
                See your reminders
              </TextLink>
            )}
          </Page>
        </div>
      </div>
    )
  }

  const loading = !subs || !settings || check === undefined || (check === null && !done)

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[480px] pb-10">
        <PageHeader
          title="Renewal check"
          back
          backTo="/"
          subtitle={check ? `Next ${check.windowDays} days · ${formatDate(check.periodStart, 'd MMM')} to ${formatDate(check.periodEnd, 'd MMM')}` : undefined}
          right={
            <span className={`flex items-center gap-1 text-[12px] font-semibold text-mint-700 transition-opacity ${savedFlash ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
              <Icon name="check" size={14} /> Saved
            </span>
          }
        />
        <Page className="space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-3" />
              <Skeleton className="h-72" />
            </>
          ) : subs.length === 0 ? (
            <Card>
              <EmptyState
                icon="list"
                tone="mint"
                title="Nothing to check yet"
                body="Add the subscriptions you pay for and this check walks you through each renewal before it lands."
                actionLabel="Add a subscription"
                onAction={() => navigate('/subscriptions/new')}
              />
            </Card>
          ) : !current ? (
            <Card className="flex items-center justify-center gap-3 p-6 text-[15px] text-muted">
              <Skeleton className="h-5 w-5 rounded-full" /> Wrapping up your check…
            </Card>
          ) : (
            <>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-navy-900">
                    {revisit ? 'Reviewing again' : `${reviewed + 1} of ${items.length}`}
                  </span>
                  <span className="text-muted">{pending.length - (revisit ? 0 : 1)} left · progress is saved as you go</span>
                </div>
                <ProgressBar value={reviewed} max={items.length} tone="mint" />
              </div>

              <ItemCard item={current} lead={lead} currency={currency} notes={notes ?? []} priceChanges={priceChanges ?? []} onFixDate={() => navigate(`/subscriptions/${current.subscription.id}/edit`)} />

              <div className="space-y-2">
                <Button full size="lg" variant={currentDecision?.decision === 'keep' ? 'primary' : 'mint'} loading={busy} disabled={busy} onClick={() => decide('keep')} leading={<Icon name="check" size={20} />}>
                  {currentDecision?.decision === 'keep' ? 'Kept' : 'Keep it'}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="lg" variant={currentDecision?.decision === 'remind' ? 'primary' : 'secondary'} disabled={busy} onClick={() => decide('remind')} leading={<Icon name="bell" size={18} />}>
                    {currentDecision?.decision === 'remind' ? 'Reminder set' : 'Remind me'}
                  </Button>
                  <Button size="lg" variant={currentDecision?.decision === 'cancel' ? 'coral' : 'danger'} disabled={busy} onClick={() => decide('cancel')} leading={<Icon name="x" size={18} />}>
                    {currentDecision?.decision === 'cancel' ? 'Cancelled' : 'Cancel it'}
                  </Button>
                </div>
                <p className="text-center text-[12px] text-faint">Keep moves on. Remind me adds a note before the charge. Cancel marks it cancelled here; you still cancel with the provider.</p>
              </div>

              <div className="flex items-center justify-between">
                {previousDecided() ? (
                  <TextLink icon={null} onClick={() => setRevisit(previousDecided()!.key)}>
                    <Icon name="chevronLeft" size={16} /> Previous
                  </TextLink>
                ) : (
                  <span />
                )}
                {revisit && (
                  <TextLink onClick={() => setRevisit(null)}>{pending.length ? 'Continue' : 'Finish'}</TextLink>
                )}
              </div>
            </>
          )}
        </Page>
      </div>
    </div>
  )
}

function ItemCard({
  item,
  lead,
  currency,
  notes,
  priceChanges,
  onFixDate,
}: {
  item: Item
  lead: number
  currency: string
  notes: { subscriptionId: number; status: string; content: string; reason: string }[]
  priceChanges: { subscriptionId: number; previousAmount: number; newAmount: number; effectiveDate: string }[]
  onFixDate: () => void
}) {
  const sub = item.subscription
  const cat = categoryOf(sub.categoryId)
  const days = daysUntil(item.date)
  const soon = days <= lead
  const openNote = notes.find((n) => n.subscriptionId === sub.id && n.status === 'open')
  const recentIncrease = priceChanges.find((p) => p.subscriptionId === sub.id && p.newAmount > p.previousAmount && daysUntil(p.effectiveDate) >= -120)
  return (
    <Card className="rise p-5" key={item.key}>
      <div className="flex items-center gap-4">
        <ServiceMark name={sub.name} color={cat.color} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight text-navy-900">{sub.name}</h2>
          <p className="text-[13px] text-muted">
            {cat.name} · per {CYCLE_LABEL[sub.billingCycle]}
            {sub.status === 'trial' ? ' · trial' : ''}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="tabular text-[34px] font-bold leading-none text-navy-900">{formatMoney(item.amount, currency)}</span>
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${soon ? 'bg-coral-100 text-coral-700' : 'bg-mint-100 text-mint-700'}`}>
          {sub.status === 'trial' ? 'Trial converts ' : 'Renews '}
          {relativeLower(item.date)}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">{formatDate(item.date, 'EEEE d MMMM')}</p>
      <div className="mt-4 space-y-2">
        {sub.renewalEstimated && (
          <button onClick={onFixDate} className="flex w-full items-center gap-3 rounded-xl bg-navy-50 px-3 py-2.5 text-left">
            <Icon name="calendar" size={18} className="shrink-0 text-navy-700" />
            <span className="flex-1 text-[13px] text-navy-800">
              <span className="font-semibold">Estimated date.</span> Set the real billing date.
            </span>
            <Icon name="chevronRight" size={16} className="text-faint" />
          </button>
        )}
        {recentIncrease && (
          <p className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[13px] text-coral-700">
            <Icon name="trend" size={16} className="mt-0.5 shrink-0" />
            <span>
              Went up {formatMoney(recentIncrease.newAmount - recentIncrease.previousAmount, currency)} on {formatDate(recentIncrease.effectiveDate, 'd MMM')}.
            </span>
          </p>
        )}
        {openNote && (
          <p className="flex items-start gap-2 rounded-xl bg-mint-50 px-3 py-2.5 text-[13px] text-navy-800">
            <Icon name="note" size={16} className="mt-0.5 shrink-0 text-mint-700" />
            <span>
              <Badge tone="mint" className="mr-1.5">
                Your note
              </Badge>
              {openNote.content}
            </span>
          </p>
        )}
      </div>
    </Card>
  )
}

function Stat({ label, value, tone = 'navy' }: { label: string; value: string; tone?: 'navy' | 'coral' }) {
  return (
    <Card className="p-3 text-center">
      <span className={`tabular block text-[22px] font-bold ${tone === 'coral' ? 'text-coral-700' : 'text-navy-900'}`}>{value}</span>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</span>
    </Card>
  )
}
