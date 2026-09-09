import { useNavigate } from 'react-router-dom'
import type { Subscription } from '@/db/schema'
import { categoryOf } from '@/lib/categories'
import { CYCLE_LABEL, formatMoney } from '@/lib/money'
import { daysUntil, relativeLower } from '@/lib/dates'
import { Badge, ServiceMark } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'

export function StatusBadge({ status }: { status: Subscription['status'] }) {
  switch (status) {
    case 'trial':
      return <Badge tone="amber">Trial</Badge>
    case 'paused':
      return <Badge tone="gray">Paused</Badge>
    case 'cancelled':
      return <Badge tone="coral">Cancelled</Badge>
    default:
      return null
  }
}

export function SubscriptionRow({ sub, hasOpenNote }: { sub: Subscription; hasOpenNote?: boolean }) {
  const navigate = useNavigate()
  const cat = categoryOf(sub.categoryId)
  const days = daysUntil(sub.nextRenewalDate)
  const soon = sub.status !== 'cancelled' && sub.status !== 'paused' && days <= 3
  return (
    <button
      onClick={() => navigate(`/subscriptions/${sub.id}`)}
      className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-navy-50"
    >
      <ServiceMark name={sub.name} color={sub.status === 'cancelled' ? '#A0AEC0' : cat.color} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className={`min-w-0 break-words text-[0.9375rem] font-semibold leading-snug ${sub.status === 'cancelled' ? 'text-muted line-through' : 'text-ink'}`}>
            {hasOpenNote ? (
              // Keep the note marker glued to the last word so it never wraps onto a line of its own.
              <>
                {sub.name.split(' ').slice(0, -1).join(' ')}
                {sub.name.includes(' ') ? ' ' : ''}
                <span className="whitespace-nowrap">
                  {sub.name.split(' ').slice(-1)[0]}
                  <Icon name="note" size={14} className="ml-1.5 inline-block align-[-2px] text-coral-600" />
                </span>
              </>
            ) : (
              sub.name
            )}
          </span>
          <span className="tabular shrink-0 text-[0.9375rem] font-bold leading-snug text-navy-900">{formatMoney(sub.amount, sub.currency)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted">
          {sub.status !== 'active' && <StatusBadge status={sub.status} />}
          <span>
            {cat.name} · per {CYCLE_LABEL[sub.billingCycle]}
          </span>
        </span>
        {(sub.status === 'active' || sub.status === 'trial') && (
          <span className={`mt-0.5 block text-[0.8125rem] ${soon ? 'font-semibold text-coral-700' : 'text-muted'}`}>
            {sub.status === 'trial' ? 'Trial ends' : 'Renews'} {relativeLower(sub.nextRenewalDate)}
          </span>
        )}
      </span>
      <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
    </button>
  )
}
