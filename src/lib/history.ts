import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import type { PriceChange, Subscription } from '@/db/schema'
import { toMonthly } from '@/lib/money'
import { toISO } from '@/lib/dates'

export interface MonthPoint {
  /** yyyy-MM */
  key: string
  label: string
  total: number
  count: number
  isCurrent: boolean
}

/** What a subscription cost at the end of a given month, walking price changes backwards from today. */
function amountAt(sub: Subscription, changes: PriceChange[], monthEnd: string): number {
  let amount = sub.amount
  const later = changes.filter((c) => c.subscriptionId === sub.id && c.effectiveDate > monthEnd).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  if (later.length > 0) amount = later[0].previousAmount
  return amount
}

/**
 * Reconstruct the monthly total for the last `months` months (oldest first) from start dates,
 * cancellation dates and price history. Paused plans are left out, as they are today.
 */
export function monthlyTotalHistory(subs: Subscription[], changes: PriceChange[], months = 6): MonthPoint[] {
  const out: MonthPoint[] = []
  const thisMonth = startOfMonth(new Date())
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(thisMonth, -i)
    const start = toISO(startOfMonth(m))
    const end = toISO(endOfMonth(m))
    let total = 0
    let count = 0
    for (const s of subs) {
      if (s.status === 'paused') continue
      if (s.startDate > end) continue
      if (s.status === 'cancelled' && s.cancelledAt && s.cancelledAt <= start) continue
      total += toMonthly(amountAt(s, changes, end), s.billingCycle)
      count += 1
    }
    out.push({ key: format(m, 'yyyy-MM'), label: format(m, 'MMM'), total, count, isCurrent: i === 0 })
  }
  return out
}
