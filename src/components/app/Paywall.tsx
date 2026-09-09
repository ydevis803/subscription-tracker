import { useNavigate } from 'react-router-dom'
import { FREE_SUBSCRIPTION_LIMIT, PREMIUM_PRICING } from '@/db/schema'
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
      <p className="text-[15px] leading-relaxed text-muted">
        {reason ?? `The free plan includes up to ${FREE_SUBSCRIPTION_LIMIT} subscriptions. Premium removes the limit and unlocks deeper insights.`}
      </p>
      <ul className="mt-4 space-y-2.5">
        {PREMIUM_FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-3 text-[15px] text-ink">
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
      <button onClick={onClose} className="mt-2 h-12 w-full rounded-2xl text-[15px] font-semibold text-muted">
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
        <span className="block text-[14px] font-semibold">
          {remaining === 0 ? 'Free limit reached' : `${used} of ${FREE_SUBSCRIPTION_LIMIT} free subscriptions used`}
        </span>
        {!compact && (
          <span className="block text-[13px] text-navy-100">
            {remaining === 0 ? 'Upgrade to keep adding and unlock insights.' : `${remaining} slot${remaining === 1 ? '' : 's'} left on the free plan.`}
          </span>
        )}
      </span>
      <button onClick={() => navigate('/premium')} className="h-10 shrink-0 rounded-xl bg-white/10 px-3 text-[13px] font-semibold hover:bg-white/15">
        Upgrade
      </button>
    </Card>
  )
}

export function LockedCard({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate()
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="pointer-events-none select-none blur-[3px]" aria-hidden="true">
        <div className="mb-2 h-4 w-1/2 rounded bg-navy-100" />
        <div className="flex h-24 items-end gap-2">
          {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-navy-100" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 px-6 text-center">
        <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
          <Icon name="crown" size={20} />
        </span>
        <p className="text-[15px] font-bold text-navy-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{body}</p>
        <button onClick={() => navigate('/premium')} className="mt-3 h-10 rounded-xl bg-navy-900 px-4 text-[13px] font-semibold text-white">
          Unlock with Premium
        </button>
      </div>
    </Card>
  )
}
