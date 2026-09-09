import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downgradeToFree, upgradeToPremium } from '@/db/repo'
import { FREE_SUBSCRIPTION_LIMIT, PREMIUM_PRICING, type PremiumInterval } from '@/db/schema'
import { useBillingEvents, useProfile, useSubscriptions } from '@/hooks/useData'
import { countedForLimit, isPremium, PREMIUM_FEATURES } from '@/lib/plan'
import { formatDate } from '@/lib/dates'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Badge, Card, Skeleton } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/auth/AuthContext'
import { AccountExplainerSheet } from '@/components/app/Account'

const yearlySaving = Math.round((1 - PREMIUM_PRICING.yearly / (PREMIUM_PRICING.monthly * 12)) * 100)

export default function Premium() {
  const navigate = useNavigate()
  const toast = useToast()
  const profile = useProfile()
  const subs = useSubscriptions()
  const events = useBillingEvents()
  const [interval, setInterval] = useState<PremiumInterval>('yearly')
  const [confirm, setConfirm] = useState(false)
  const [cancel, setCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justActivated, setJustActivated] = useState(false)
  const { status } = useAuth()
  const [explainer, setExplainer] = useState(false)
  const startCheckout = () => {
    if (status === 'guest') setExplainer(true)
    else setConfirm(true)
  }

  const premium = isPremium(profile)
  const used = subs ? countedForLimit(subs) : 0

  const activate = async () => {
    setBusy(true)
    try {
      await upgradeToPremium(interval)
      setConfirm(false)
      setJustActivated(true)
      toast.success('Premium activated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not activate')
    } finally {
      setBusy(false)
    }
  }

  const doCancel = async () => {
    setBusy(true)
    try {
      await downgradeToFree()
      setCancel(false)
      toast.info('Premium ended. Your data is untouched.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change plan')
    } finally {
      setBusy(false)
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
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-mint-500 text-navy-900">
            <Icon name="check" size={36} />
          </span>
          <h2 className="mt-6 text-2xl font-bold text-navy-900">You are on Premium</h2>
          <p className="mt-2 max-w-[300px] text-[15px] text-muted">
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
      <PageHeader title={premium ? 'Your plan' : 'Premium'} back backTo="/profile" />
      <Page className="space-y-5">
        <div className="rounded-3xl bg-navy-900 p-6 text-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-500 text-navy-900">
            <Icon name="crown" size={24} />
          </span>
          <h2 className="mt-4 text-[26px] font-bold leading-tight">{premium ? 'Premium is active' : 'Track everything. Miss nothing.'}</h2>
          <p className="mt-2 text-[15px] text-navy-100">
            {premium
              ? `You are on the ${profile.premiumInterval} plan since ${profile.premiumSince ? formatDate(profile.premiumSince) : 'today'}.`
              : `Free covers ${FREE_SUBSCRIPTION_LIMIT} subscriptions. Premium removes the cap and adds the reports that actually save money.`}
          </p>
          <ul className="mt-5 space-y-2.5">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[15px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-500 text-navy-900">
                  <Icon name="check" size={14} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {premium ? (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Current plan</p>
                  <p className="text-[17px] font-bold text-navy-900">
                    Premium {profile.premiumInterval} · ${profile.premiumInterval === 'yearly' ? PREMIUM_PRICING.yearly.toFixed(2) : PREMIUM_PRICING.monthly.toFixed(2)}
                  </p>
                  <p className="text-[13px] text-muted">Renews {profile.premiumRenewsOn ? formatDate(profile.premiumRenewsOn) : ''}</p>
                </div>
                <Badge tone="mint">Active</Badge>
              </div>
              {profile.premiumInterval === 'monthly' && (
                <button
                  onClick={() => {
                    setInterval('yearly')
                    setConfirm(true)
                  }}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-mint-100 text-[14px] font-semibold text-mint-700"
                >
                  <Icon name="sparkle" size={18} /> Switch to yearly and save {yearlySaving}%
                </button>
              )}
            </Card>
            {events && events.length > 0 && (
              <Card className="divide-y divide-line overflow-hidden">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between px-4 py-3 text-[14px]">
                    <span className="text-ink">
                      {ev.kind === 'upgrade' ? 'Started Premium' : ev.kind === 'downgrade' ? 'Moved to Free' : 'Changed billing'}
                      {ev.interval ? ` (${ev.interval})` : ''}
                    </span>
                    <span className="text-muted">{formatDate(ev.occurredAt.slice(0, 10))}</span>
                  </div>
                ))}
              </Card>
            )}
            <Button full variant="ghost" className="text-coral-700" onClick={() => setCancel(true)}>
              End Premium
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Billing interval">
              <PlanOption
                selected={interval === 'yearly'}
                onSelect={() => setInterval('yearly')}
                title="Yearly"
                price={`$${PREMIUM_PRICING.yearly.toFixed(2)}`}
                per="per year"
                note={`$${(PREMIUM_PRICING.yearly / 12).toFixed(2)}/mo · save ${yearlySaving}%`}
                highlight
              />
              <PlanOption selected={interval === 'monthly'} onSelect={() => setInterval('monthly')} title="Monthly" price={`$${PREMIUM_PRICING.monthly.toFixed(2)}`} per="per month" note="Cancel any time" />
            </div>
            <Button full size="lg" variant="mint" onClick={startCheckout} leading={<Icon name="crown" size={20} />}>
              Start Premium · ${interval === 'yearly' ? PREMIUM_PRICING.yearly.toFixed(2) : PREMIUM_PRICING.monthly.toFixed(2)}/{interval === 'yearly' ? 'yr' : 'mo'}
            </Button>
            <p className="text-center text-[12px] leading-relaxed text-faint">
              You are tracking {used} of {FREE_SUBSCRIPTION_LIMIT} free subscriptions. Premium renews automatically and can be ended from this screen.
            </p>
          </>
        )}
      </Page>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Confirm your plan">
        <div className="rounded-2xl bg-navy-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink">Premium {interval}</span>
            <span className="tabular text-[17px] font-bold text-navy-900">${interval === 'yearly' ? PREMIUM_PRICING.yearly.toFixed(2) : PREMIUM_PRICING.monthly.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-[13px] text-muted">Billed {interval === 'yearly' ? 'once a year' : 'every month'}. First renewal in {interval === 'yearly' ? 'one year' : 'one month'}.</p>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          This build activates Premium on your device and records the plan in your billing history. Payment collection is handled by the app store when published.
        </p>
        <Button full size="lg" variant="mint" className="mt-4" loading={busy} onClick={activate}>
          {premium ? 'Switch plan' : 'Activate Premium'}
        </Button>
      </Sheet>

      <AccountExplainerSheet
        open={explainer}
        onClose={() => setExplainer(false)}
        next="/premium"
        reason="Premium needs an owner. Create a free account first so your plan stays with you on every device, then come back here to activate it."
      />
      <ConfirmSheet
        open={cancel}
        onClose={() => setCancel(false)}
        title="End Premium?"
        body={
          used > FREE_SUBSCRIPTION_LIMIT
            ? `You are tracking ${used} subscriptions. On the free plan you keep all of them, but cannot add more until you are under ${FREE_SUBSCRIPTION_LIMIT}. Premium insights will lock.`
            : 'You will go back to the free plan. Everything you have entered stays on this device.'
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
      className={`relative rounded-2xl border-2 bg-white p-4 text-left transition-colors ${selected ? 'border-mint-500' : 'border-line'}`}
    >
      {highlight && <span className="absolute -top-2.5 left-3 rounded-full bg-coral-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Best value</span>}
      <span className="block text-[13px] font-semibold text-muted">{title}</span>
      <span className="tabular block text-[24px] font-bold text-navy-900">{price}</span>
      <span className="block text-[12px] text-faint">{per}</span>
      <span className={`mt-2 block text-[12px] font-semibold ${highlight ? 'text-mint-700' : 'text-muted'}`}>{note}</span>
      <span className={`absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full ${selected ? 'bg-mint-500 text-navy-900' : 'border-2 border-navy-100'}`}>
        {selected && <Icon name="check" size={14} />}
      </span>
    </button>
  )
}
