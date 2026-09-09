import { useMemo, useRef, useState, useEffect } from 'react'
import { useSmartBack } from '@/lib/navigation'
import { track } from '@/lib/analytics'
import { useNavigate } from 'react-router-dom'
import { downgradeToFree, endTrialNow, startTrial, upgradeToPremium } from '@/db/repo'
import { FREE_SUBSCRIPTION_LIMIT, type PremiumInterval } from '@/db/schema'
import { useBillingEvents, useNotes, usePriceChanges, useProfile, useSubscriptions } from '@/hooks/useData'
import { countedForLimit, isPaidPremium, premiumBenefits, price, PREMIUM_FEATURES, TRIAL_DAYS, trialState, YEARLY_PER_MONTH, YEARLY_SAVING_AMOUNT, YEARLY_SAVING_PCT } from '@/lib/plan'
import { ProgressBar } from '@/components/ui/Primitives'
import { formatDate } from '@/lib/dates'
import { formatMoney, monthlyEquivalent } from '@/lib/money'
import { describeError } from '@/lib/errors'
import { pullFromServer } from '@/sync/sync'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button, TextLink } from '@/components/ui/Button'
import { Badge, Card, Skeleton } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/auth/AuthContext'
import { AccountExplainerSheet } from '@/components/app/Account'

export default function Premium() {
  const navigate = useNavigate()
  const goBack = useSmartBack()
  useEffect(() => {
    void track('premium_view')
  }, [])
  const toast = useToast()
  const profile = useProfile()
  const subs = useSubscriptions()
  const changes = usePriceChanges()
  const notes = useNotes()
  const events = useBillingEvents()
  const { status } = useAuth()
  const [interval, setInterval] = useState<PremiumInterval>('yearly')
  const [confirm, setConfirm] = useState(false)
  const [cancel, setCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [justActivated, setJustActivated] = useState(false)
  const [explainer, setExplainer] = useState<'buy' | 'restore' | null>(null)
  const inFlight = useRef(false)

  const currency = profile?.currency ?? 'USD'
  const premium = isPaidPremium(profile)
  const trial = trialState(profile)
  const [endTrial, setEndTrial] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)

  const beginTrial = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setStartingTrial(true)
    try {
      const { endsOn } = await startTrial()
      toast.success(`Premium trial started. Ends ${formatDate(endsOn, 'EEE d MMM')}.`)
      navigate('/')
    } catch (e) {
      toast.error(describeError(e, 'start the trial'))
    } finally {
      inFlight.current = false
      setStartingTrial(false)
    }
  }
  const used = subs ? countedForLimit(subs) : 0
  const monthly = subs ? monthlyEquivalent(subs) : 0
  const benefits = useMemo(() => (subs && changes && notes ? premiumBenefits(subs, changes, notes, currency) : []), [subs, changes, notes, currency])

  /** Every upgrade button in the app lands here; this is the one purchase flow. */
  const startCheckout = (chosen?: PremiumInterval) => {
    if (chosen) setInterval(chosen)
    if (status === 'guest') setExplainer('buy')
    else setConfirm(true)
  }

  const activate = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await upgradeToPremium(interval)
      setConfirm(false)
      setJustActivated(true)
      toast.success('Premium activated')
    } catch (e) {
      toast.error(describeError(e, 'activate Premium'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const doCancel = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await downgradeToFree()
      setCancel(false)
      toast.info('Premium ended. Everything you entered stays.')
    } catch (e) {
      toast.error(describeError(e, 'change your plan'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  /** Restore: a purchase lives on the account, so pull the account and read the plan back. */
  const restore = async () => {
    if (status === 'guest') {
      setExplainer('restore')
      return
    }
    setRestoring(true)
    try {
      await pullFromServer()
      const { db } = await import('@/db/schema')
      const p = await db.profile.get(1)
      if (p?.plan === 'premium') toast.success('Premium restored to this device')
      else toast.info('No Premium purchase found on this account. If you bought it elsewhere, sign in with that account.')
    } catch (e) {
      toast.error(describeError(e, 'check your purchases'))
    } finally {
      setRestoring(false)
    }
  }

  if (!profile) {
    return (
      <div>
        <PageHeader title="Premium" back backTo="/profile" />
        <Page>
          <Skeleton className="h-64" />
        </Page>
      </div>
    )
  }

  if (justActivated) {
    return (
      <div>
        <PageHeader title="Premium" back backTo="/profile" />
        <Page className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
          <span className="pop flex h-20 w-20 items-center justify-center rounded-3xl bg-mint-500 text-navy-900 ring-8 ring-mint-100">
            <Icon name="check" size={36} />
          </span>
          <h2 className="mt-6 text-2xl font-bold text-navy-900">You are on Premium</h2>
          <p className="mt-2 max-w-[300px] text-[0.9375rem] text-muted">
            Unlimited tracking and every insight is unlocked. Your {interval} plan renews on {profile.premiumRenewsOn ? formatDate(profile.premiumRenewsOn) : 'schedule'}.
          </p>
          <div className="mt-8 w-full space-y-2">
            <Button full size="lg" onClick={() => navigate('/insights')}>
              Open Insights
            </Button>
            <Button full size="lg" variant="ghost" onClick={() => navigate('/subscriptions')}>
              Back to subscriptions
            </Button>
          </div>
        </Page>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={premium ? 'Manage Premium' : 'Premium'} back backTo="/profile" />
      <Page className="space-y-5 pb-8">
        {/* Outcome first */}
        <div className="rounded-3xl bg-navy-900 p-6 text-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-500 text-navy-900">
            <Icon name="crown" size={24} />
          </span>
          <h2 className="mt-4 text-[1.75rem] font-bold leading-[1.1]">
            {premium ? 'Every charge, in view. Always.' : trial.status === 'active' ? `Premium trial · day ${trial.day} of ${TRIAL_DAYS}` : trial.status === 'ended' ? 'Your trial ended. Keep the whole year in view?' : 'Every charge in view before it lands.'}
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-100">
            {premium
              ? `Premium ${profile.premiumInterval} since ${profile.premiumSince ? formatDate(profile.premiumSince) : 'today'}. Unlimited tracking and every insight, on every device you sign in to.`
              : trial.status === 'active'
                ? `Everything Premium is on until ${formatDate(trial.endsOn!, 'EEEE d MMM')}. No card needed. When it ends you go back to Free unless you choose a plan.`
                : trial.status === 'ended'
                  ? `Your trial ran ${formatDate(trial.startedOn!, 'd MMM')} to ${formatDate(trial.endsOn!, 'd MMM')}. Nothing was removed. Premium brings the reports back and lifts the ten-subscription limit.`
                  : `You track ${used} ${used === 1 ? 'subscription' : 'subscriptions'} worth ${formatMoney(monthly, currency)} a month. Free covers ${FREE_SUBSCRIPTION_LIMIT}. Premium removes the cap and adds the reports that find money to keep.`}
          </p>
          {!premium && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[0.8125rem] font-semibold">
              <Icon name="sparkle" size={14} className="text-mint-400" />
              {price('monthly')}/month or {price('yearly')}/year
            </p>
          )}
        </div>

        {trial.status === 'active' && (
          <Card className="border-mint-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[0.9375rem] font-bold text-navy-900">Your trial</p>
              <Badge tone="mint">Day {trial.day} of {TRIAL_DAYS}</Badge>
            </div>
            <div className="mt-2">
              <ProgressBar value={trial.day} max={TRIAL_DAYS} tone="mint" />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[0.8125rem]">
              <div>
                <dt className="font-semibold uppercase tracking-wide text-faint">Started</dt>
                <dd className="text-ink">{formatDate(trial.startedOn!, 'EEE d MMM')}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-faint">Ends</dt>
                <dd className="text-ink">{formatDate(trial.endsOn!, 'EEE d MMM')} · last day included</dd>
              </div>
            </dl>
            <p className="mt-3 text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Included</p>
            <ul className="mt-1 space-y-1.5">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-[0.875rem] text-ink">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-100 text-mint-700">
                    <Icon name="check" size={12} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <TextLink icon={null} className="mt-2 text-coral-700" onClick={() => setEndTrial(true)}>
              End trial now
            </TextLink>
          </Card>
        )}

        {/* Three concrete benefits from the user's data */}
        <section>
          <p className="mb-2 px-1 text-[0.9375rem] font-bold text-navy-900">{premium ? 'What Premium is doing for you' : 'What changes for you'}</p>
          <Card className="divide-y divide-line overflow-hidden">
            {benefits.map((b) => (
              <div key={b.title} className="flex items-start gap-3 px-4 py-3.5">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                  <Icon name={b.icon} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold leading-snug text-ink">{b.title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{b.body}</span>
                  <span className="mt-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">From {b.from}</span>
                </span>
              </div>
            ))}
          </Card>
        </section>

        {premium ? (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Current plan</p>
                  <p className="text-[1.0625rem] font-bold text-navy-900">
                    Premium {profile.premiumInterval} · {price(profile.premiumInterval ?? 'monthly')}
                  </p>
                  <p className="text-[0.8125rem] text-muted">Renews {profile.premiumRenewsOn ? formatDate(profile.premiumRenewsOn) : ''}</p>
                </div>
                <Badge tone="mint">Active</Badge>
              </div>
              {profile.premiumInterval === 'monthly' ? (
                <Button full variant="mint" className="mt-4" onClick={() => startCheckout('yearly')} leading={<Icon name="sparkle" size={18} />}>
                  Switch to yearly · save {formatMoney(YEARLY_SAVING_AMOUNT, 'USD')} a year
                </Button>
              ) : (
                <p className="mt-3 rounded-xl bg-mint-50 px-3 py-2 text-[0.8125rem] text-mint-700">You are on the best value plan, {YEARLY_SAVING_PCT}% less than paying monthly.</p>
              )}
            </Card>
            {events && events.length > 0 && (
              <Card className="divide-y divide-line overflow-hidden">
                <p className="px-4 pt-3 text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Billing history</p>
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between px-4 py-3 text-[0.875rem]">
                    <span className="text-ink">
                      {ev.kind === 'upgrade' ? 'Started Premium' : ev.kind === 'downgrade' ? 'Moved to Free' : 'Changed billing'}
                      {ev.interval ? ` (${ev.interval})` : ''}
                      {ev.amount > 0 ? ` · $${ev.amount.toFixed(2)}` : ''}
                    </span>
                    <span className="text-muted">{formatDate(ev.occurredAt.slice(0, 10))}</span>
                  </div>
                ))}
              </Card>
            )}
            <div className="space-y-2">
              <Button full variant="secondary" loading={restoring} onClick={restore} leading={<Icon name="refresh" size={18} />}>
                Restore purchase on this device
              </Button>
              <Button full variant="ghost" className="text-coral-700" onClick={() => setCancel(true)}>
                End Premium
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Billing interval">
              <PlanOption selected={interval === 'yearly'} onSelect={() => setInterval('yearly')} title="Yearly" price={price('yearly')} per="per year" note={`${formatMoney(YEARLY_PER_MONTH, 'USD')}/mo · save ${YEARLY_SAVING_PCT}%`} highlight />
              <PlanOption selected={interval === 'monthly'} onSelect={() => setInterval('monthly')} title="Monthly" price={price('monthly')} per="per month" note="Cancel any time" />
            </div>
            {interval === 'yearly' && (
              <p className="rounded-xl bg-mint-50 px-3 py-2 text-center text-[0.8125rem] text-mint-700">
                Yearly is {formatMoney(YEARLY_SAVING_AMOUNT, 'USD')} less than twelve months at {price('monthly')}, and every insight stays unlocked all year.
              </p>
            )}
            {trial.status === 'none' && (
              <Button full size="lg" variant="mint" loading={startingTrial} onClick={beginTrial} leading={<Icon name="sparkle" size={20} />}>
                Try Premium free for {TRIAL_DAYS} days
              </Button>
            )}
            <Button full size="lg" variant={trial.status === 'none' ? 'primary' : 'mint'} onClick={() => startCheckout()} leading={<Icon name="crown" size={20} />}>
              {trial.status === 'active' ? 'Keep Premium' : 'Start Premium'} · {price(interval)}/{interval === 'yearly' ? 'year' : 'month'}
            </Button>
            {trial.status === 'none' && <p className="text-center text-[0.75rem] text-faint">The trial needs no card and ends on its own after {TRIAL_DAYS} days. One trial per profile.</p>}
            <div className="flex items-center justify-center gap-4">
              <TextLink icon={null} onClick={restore}>
                {restoring ? 'Checking…' : 'Restore purchase'}
              </TextLink>
              <TextLink icon={null} onClick={() => goBack('/')}>
                Keep the free plan
              </TextLink>
            </div>
            <p className="text-center text-[0.75rem] leading-relaxed text-faint">
              Free keeps working with up to {FREE_SUBSCRIPTION_LIMIT} subscriptions, reminders, notes and the calendar. Premium renews automatically and can be ended from this screen.
            </p>
          </>
        )}
      </Page>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={premium ? 'Change your plan' : 'Confirm your plan'}>
        <div className="rounded-2xl bg-navy-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[0.9375rem] font-semibold text-ink">Premium {interval}</span>
            <span className="tabular text-[1.0625rem] font-bold text-navy-900">{price(interval)}</span>
          </div>
          <p className="mt-1 text-[0.8125rem] text-muted">Billed {interval === 'yearly' ? 'once a year' : 'every month'}. First renewal in {interval === 'yearly' ? 'one year' : 'one month'}.</p>
        </div>
        <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">This build activates Premium on your account and records the plan in your billing history. Payment collection is handled by the app store when published.</p>
        <Button full size="lg" variant="mint" className="mt-4" loading={busy} onClick={activate}>
          {premium ? 'Switch plan' : `Activate Premium · ${price(interval)}`}
        </Button>
        <Button full size="lg" variant="ghost" className="mt-1" onClick={() => setConfirm(false)}>
          Not now
        </Button>
      </Sheet>

      <AccountExplainerSheet
        open={explainer !== null}
        onClose={() => setExplainer(null)}
        next="/premium"
        reason={
          explainer === 'restore'
            ? 'Purchases live on your account. Sign in with the account you bought Premium on and it comes back to this device.'
            : 'Premium needs an owner. Create a free account first so your plan stays with you on every device, then come back here to activate it.'
        }
      />
      <ConfirmSheet
        open={endTrial}
        onClose={() => setEndTrial(false)}
        title="End the trial now?"
        body="Premium reports lock again straight away. Every subscription, note and price change stays exactly as it is, and you can choose a plan any time."
        confirmLabel="End trial"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          try {
            await endTrialNow()
            setEndTrial(false)
            toast.info('Trial ended. Everything you entered stays.')
          } catch (e) {
            toast.error(describeError(e, 'end the trial'))
          } finally {
            setBusy(false)
          }
        }}
      />
      <ConfirmSheet
        open={cancel}
        onClose={() => setCancel(false)}
        title="End Premium?"
        body={
          used > FREE_SUBSCRIPTION_LIMIT
            ? `You are tracking ${used} subscriptions. On the free plan you keep all of them, but cannot add more until you are under ${FREE_SUBSCRIPTION_LIMIT}. Premium insights will lock.`
            : 'You will go back to the free plan. Everything you have entered stays.'
        }
        confirmLabel="End Premium"
        loading={busy}
        onConfirm={doCancel}
      />
    </div>
  )
}

function PlanOption({ selected, onSelect, title, price, per, note, highlight }: { selected: boolean; onSelect: () => void; title: string; price: string; per: string; note: string; highlight?: boolean }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative min-h-[7.5rem] rounded-2xl border-2 bg-white p-4 text-left transition-colors ${selected ? 'border-mint-500' : 'border-line'}`}
    >
      {highlight && <span className="absolute -top-2.5 left-3 rounded-full bg-coral-700 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">Best value</span>}
      <span className="block text-[0.8125rem] font-semibold text-muted">{title}</span>
      <span className="tabular block text-[1.5rem] font-bold text-navy-900">{price}</span>
      <span className="block text-[0.75rem] text-faint">{per}</span>
      <span className={`mt-2 block text-[0.75rem] font-semibold ${highlight ? 'text-mint-700' : 'text-muted'}`}>{note}</span>
      <span className={`absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full ${selected ? 'bg-mint-500 text-navy-900' : 'border-2 border-navy-100'}`}>
        {selected && <Icon name="check" size={14} />}
      </span>
    </button>
  )
}
