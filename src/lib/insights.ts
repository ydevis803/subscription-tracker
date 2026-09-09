import type { PriceChange, Subscription } from '@/db/schema'
import type { IconName } from '@/components/ui/Icon'
import { categoryOf } from '@/lib/categories'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { daysUntil, formatDate, relativeLower } from '@/lib/dates'

export interface Headline {
  icon: IconName
  tone: 'navy' | 'mint' | 'coral'
  text: string
  to?: string
}

/** A few plain-language observations about where the money goes. Free for everyone. */
export function headlineInsights(subs: Subscription[], changes: PriceChange[], currency: string, limit: number | null): Headline[] {
  const counted = subs.filter(isCounted)
  if (counted.length === 0) return []
  const monthly = monthlyEquivalent(subs)
  const out: Headline[] = []

  const byCat = new Map<string, number>()
  for (const s of counted) byCat.set(s.categoryId, (byCat.get(s.categoryId) ?? 0) + toMonthly(s.amount, s.billingCycle))
  const [topCat, topAmount] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
  if (monthly > 0 && byCat.size > 1) {
    out.push({ icon: 'chart', tone: 'navy', text: `${categoryOf(topCat as Subscription['categoryId']).name} is ${Math.round((topAmount / monthly) * 100)}% of your monthly total (${formatMoney(topAmount, currency)}).`, to: '/insights' })
  }

  const biggest = [...counted].sort((a, b) => toMonthly(b.amount, b.billingCycle) - toMonthly(a.amount, a.billingCycle))[0]
  out.push({
    icon: 'wallet',
    tone: 'navy',
    text: `${biggest.name} is your biggest line at ${formatMoney(toMonthly(biggest.amount, biggest.billingCycle), currency)} a month${biggest.billingCycle !== 'monthly' ? ` (${formatMoney(biggest.amount, biggest.currency)} ${biggest.billingCycle})` : ''}.`,
    to: `/subscriptions/${biggest.id}`,
  })

  const annual = counted.filter((s) => s.billingCycle === 'yearly' || s.billingCycle === 'quarterly').sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate))
  if (annual.length > 0) {
    const next = annual[0]
    out.push({
      icon: 'calendar',
      tone: daysUntil(next.nextRenewalDate) <= 30 ? 'coral' : 'navy',
      text: `${annual.length} ${annual.length === 1 ? 'plan lands' : 'plans land'} as a single charge. Next: ${next.name}, ${formatMoney(next.amount, next.currency)} ${relativeLower(next.nextRenewalDate)} (${formatDate(next.nextRenewalDate, 'd MMM')}).`,
      to: '/timeline',
    })
  } else {
    out.push({ icon: 'check', tone: 'mint', text: 'Everything bills monthly or weekly, so no big one-off charges are waiting.' })
  }

  const increases = changes.filter((c) => c.newAmount > c.previousAmount && daysUntil(c.effectiveDate) >= -365 && counted.some((s) => s.id === c.subscriptionId))
  if (increases.length > 0) {
    const extra = increases.reduce((s, c) => {
      const sub = counted.find((x) => x.id === c.subscriptionId)!
      return s + toMonthly(c.newAmount - c.previousAmount, sub.billingCycle)
    }, 0)
    out.push({ icon: 'trend', tone: 'coral', text: `${increases.length} price ${increases.length === 1 ? 'increase' : 'increases'} in the last year add ${formatMoney(extra, currency)} a month.`, to: '/history' })
  }

  if (limit !== null) {
    out.push(
      monthly > limit
        ? { icon: 'alert', tone: 'coral', text: `You are ${formatMoney(monthly - limit, currency)} over your ${formatMoney(limit, currency, { compact: true })} limit.`, to: '/total' }
        : { icon: 'check', tone: 'mint', text: `${formatMoney(limit - monthly, currency)} of room under your ${formatMoney(limit, currency, { compact: true })} limit.`, to: '/total' },
    )
  }
  return out.slice(0, 4)
}
