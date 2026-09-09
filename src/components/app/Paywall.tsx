import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FREE_SUBSCRIPTION_LIMIT, PREMIUM_PRICING, type RenewalCheck, type Settings } from '@/db/schema'
import { updateSettings } from '@/db/repo'
import { PREMIUM_FEATURES } from '@/lib/plan'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { leaveSheet } from '@/lib/navigation'

export function PaywallSheet({ open, onClose, reason }: { open: boolean; onClose: () => void; reason?: string }) {
  const navigate = useNavigate()
  return (
    <Sheet open={open} onClose={onClose} title="Go Premium">
      <p className="text-[0.9375rem] leading-relaxed text-muted">
        {reason ?? `The free plan includes up to ${FREE_SUBSCRIPTION_LIMIT} subscriptions. Premium removes the limit and unlocks deeper insights.`}
      </p>
      <ul className="mt-4 space-y-2.5">
        {PREMIUM_FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-3 text-[0.9375rem] text-ink">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-100 text-mint-700">
              <Icon name="check" size={14} />
            </span>
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-baseline gap-2 text-navy-900">
        <span className="text-2xl font-bold">${PREMIUM_PRICING.monthly.toFixed(2)}</span>
        <span className="text-sm text-muted">/month, or ${PREMIUM_PRICING.yearly.toFixed(2)}/year</span>
      </div>
      <Button
        full
        size="lg"
        variant="mint"
        className="mt-4"
        onClick={() => {
          onClose()
          leaveSheet(navigate, '/premium')
        }}
        leading={<Icon name="crown" size={20} />}
      >
        See Premium plans
      </Button>
      <button onClick={onClose} className="mt-2 h-12 w-full rounded-2xl text-[0.9375rem] font-semibold text-muted">
        Not now
      </button>
    </Sheet>
  )
}

export function UpgradeBanner({ used, compact }: { used: number; compact?: boolean }) {
  const navigate = useNavigate()
  const remaining = Math.max(0, FREE_SUBSCRIPTION_LIMIT - used)
  return (
    <Card className="flex items-center gap-3 border-navy-800 bg-navy-900 p-4 text-white">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-navy-900">
        <Icon name="crown" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] font-semibold">
          {remaining === 0 ? 'Free limit reached' : `${used} of ${FREE_SUBSCRIPTION_LIMIT} free subscriptions used`}
        </span>
        {!compact && (
          <span className="block text-[0.8125rem] text-navy-100">
            {remaining === 0 ? 'Upgrade to keep adding and unlock insights.' : `${remaining} slot${remaining === 1 ? '' : 's'} left on the free plan.`}
          </span>
        )}
      </span>
      <button onClick={() => navigate('/premium')} className="h-10 shrink-0 rounded-xl bg-white/10 px-3 text-[0.8125rem] font-semibold hover:bg-white/15">
        Upgrade
      </button>
    </Card>
  )
}

/**
 * Shown once, on Home, after the first completed renewal check (a meaningful first win), and only to
 * free users. Dismissible, never blocking, recorded so it does not return.
 */
export function FirstWinOffer({ settings, checks }: { settings: Settings; checks: RenewalCheck[] }) {
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(false)
  const firstWin = checks.some((c) => c.completedAt && c.summary && c.summary.reviewed > 0)
  const shown = settings.premiumOfferSeen
  useEffect(() => {
    if (firstWin && !shown) void updateSettings({ premiumOfferSeen: new Date().toISOString() })
  }, [firstWin, shown])
  if (!firstWin || hidden || settings.premiumOfferDismissed) return null
  // Stays for the visit it first appeared in; on later visits it is gone even if it was never dismissed.
  if (shown && shown < new Date(Date.now() - 10 * 60000).toISOString()) return null
  const reviewed = checks.filter((c) => c.completedAt && c.summary).reduce((n, c) => n + (c.summary?.reviewed ?? 0), 0)
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
          <Icon name="crown" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">Nice work on your first check</p>
          <p className="text-[0.8125rem] leading-snug text-muted">
            You reviewed {reviewed} {reviewed === 1 ? 'renewal' : 'renewals'}. Premium keeps the whole year in view: a 12-month projection, price-increase impact and an unused-plan detector, for ${PREMIUM_PRICING.monthly.toFixed(2)}/mo or ${PREMIUM_PRICING.yearly.toFixed(2)}/yr.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => navigate('/premium')}>
              See Premium
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHidden(true)
                void updateSettings({ premiumOfferDismissed: new Date().toISOString() })
              }}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function LockedCard({ title, body, why }: { title: string; body: string; why?: string }) {
  const navigate = useNavigate()
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 select-none p-4 blur-[3px]" aria-hidden="true">
        <div className="mb-2 h-4 w-1/2 rounded bg-navy-100" />
        <div className="flex h-24 items-end gap-2">
          {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-navy-100" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="relative flex min-h-36 flex-col items-center justify-center bg-white/70 px-6 py-5 text-center">
        <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
          <Icon name="crown" size={20} />
        </span>
        <p className="text-[0.9375rem] font-bold text-navy-900">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted">{body}</p>
        <p className="mt-1.5 text-[0.75rem] leading-snug text-faint">{why ?? 'Part of Premium because it is built from your full history, and keeping that running is what Premium pays for.'}</p>
        <button onClick={() => navigate('/premium')} className="mt-3 h-11 rounded-xl bg-navy-900 px-4 text-[0.8125rem] font-semibold text-white">
          Unlock with Premium · from ${PREMIUM_PRICING.monthly.toFixed(2)}/mo
        </button>
      </div>
    </Card>
  )
}
