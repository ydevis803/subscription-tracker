import { FREE_SUBSCRIPTION_LIMIT, type Profile, type Subscription } from '@/db/schema'

export class PlanLimitError extends Error {
  constructor() {
    super(`Free plan includes up to ${FREE_SUBSCRIPTION_LIMIT} subscriptions.`)
    this.name = 'PlanLimitError'
  }
}

export function isPremium(profile: Profile | undefined | null): boolean {
  return profile?.plan === 'premium'
}

/** Subscriptions that count toward the free limit: everything not cancelled. */
export function countedForLimit(subs: Subscription[]): number {
  return subs.filter((s) => s.status !== 'cancelled').length
}

export function remainingFreeSlots(subs: Subscription[]): number {
  return Math.max(0, FREE_SUBSCRIPTION_LIMIT - countedForLimit(subs))
}

export function canAddSubscription(profile: Profile | undefined | null, subs: Subscription[]): boolean {
  return isPremium(profile) || countedForLimit(subs) < FREE_SUBSCRIPTION_LIMIT
}

import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import type { CancellationNote, PriceChange } from '@/db/schema'
import { PREMIUM_PRICING } from '@/db/schema'
import { formatMoney, isCounted, toMonthly } from '@/lib/money'
import { daysUntil, renewalsInRange, toISO } from '@/lib/dates'

export const YEARLY_SAVING_AMOUNT = Math.round((PREMIUM_PRICING.monthly * 12 - PREMIUM_PRICING.yearly) * 100) / 100
export const YEARLY_SAVING_PCT = Math.round((1 - PREMIUM_PRICING.yearly / (PREMIUM_PRICING.monthly * 12)) * 100)
export const YEARLY_PER_MONTH = Math.round((PREMIUM_PRICING.yearly / 12) * 100) / 100
export const price = (interval: 'monthly' | 'yearly') => `$${PREMIUM_PRICING[interval].toFixed(2)}`

export interface PremiumBenefit {
  icon: 'list' | 'trend' | 'calendar' | 'pause' | 'chart' | 'note'
  title: string
  body: string
  /** Which free feature it grows out of. */
  from: string
}

/** Three concrete benefits, phrased with the user's own numbers wherever the data allows. */
export function premiumBenefits(subs: Subscription[], changes: PriceChange[], notes: CancellationNote[], currency: string): PremiumBenefit[] {
  const counted = subs.filter(isCounted)
  const used = countedForLimit(subs)
  const out: PremiumBenefit[] = []

  out.push({
    icon: 'list',
    title: used >= FREE_SUBSCRIPTION_LIMIT ? 'Track every subscription, not just ten' : 'Never hit the ten-subscription wall',
    body:
      used >= FREE_SUBSCRIPTION_LIMIT
        ? `You already track ${used}. Premium lifts the limit so the next one is never left off your monthly total.`
        : `You track ${used} of ${FREE_SUBSCRIPTION_LIMIT} free slots. Premium keeps the list complete as life adds more.`,
    from: 'Subscription list',
  })

  const increases = changes.filter((c) => c.newAmount > c.previousAmount && daysUntil(c.effectiveDate) >= -365 && counted.some((s) => s.id === c.subscriptionId))
  const extra = increases.reduce((s, c) => {
    const sub = counted.find((x) => x.id === c.subscriptionId)!
    return s + toMonthly(c.newAmount - c.previousAmount, sub.billingCycle)
  }, 0)
  if (increases.length > 0) {
    out.push({
      icon: 'trend',
      title: `See what ${formatMoney(extra, currency)} a month of increases costs you`,
      body: `${increases.length} price ${increases.length === 1 ? 'rise' : 'rises'} in the last year. The impact report totals them per plan so you know what to renegotiate or drop.`,
      from: 'Price-change history',
    })
  }

  const projection = Array.from({ length: 12 }).map((_, i) => {
    const m = addMonths(startOfMonth(new Date()), i)
    const occ = renewalsInRange(subs, toISO(startOfMonth(m)), toISO(endOfMonth(m)))
    return { label: format(m, 'MMMM'), total: occ.reduce((s, o) => s + o.amount, 0) }
  })
  const peak = projection.reduce((a, b) => (b.total > a.total ? b : a), projection[0])
  const typical = projection.reduce((s, p) => s + p.total, 0) / 12
  if (peak && peak.total > typical * 1.3 && peak.total > 0) {
    out.push({
      icon: 'calendar',
      title: `Know that ${peak.label} costs ${formatMoney(peak.total, currency)} before it lands`,
      body: 'The 12-month projection shows which months spike when annual plans renew, so nothing lands as a surprise.',
      from: 'Renewal calendar and monthly total',
    })
  }

  const flagged = subs.filter((s) => s.status === 'paused' || notes.some((n) => n.subscriptionId === s.id && n.status === 'open' && (n.reason === 'not-using' || n.reason === 'too-expensive')))
  const flaggedMonthly = flagged.reduce((s, x) => s + toMonthly(x.amount, x.billingCycle), 0)
  if (flagged.length > 0) {
    out.push({
      icon: 'pause',
      title: `${formatMoney(flaggedMonthly, currency)} a month you might not need`,
      body: `${flagged.length} ${flagged.length === 1 ? 'plan is' : 'plans are'} paused or flagged in your notes. The unused detector keeps them in front of you until you decide.`,
      from: 'Cancellation notes and spending insights',
    })
  }

  if (out.length < 3) {
    out.push({ icon: 'chart', title: 'Insights that go a year ahead', body: 'A 12-month projection, a price-increase impact report and an unused-subscription detector, all built from your own history.', from: 'Spending insights' })
  }
  if (out.length < 3) {
    out.push({ icon: 'pause', title: 'Catch plans you stopped using', body: 'The unused detector watches pauses, trials and your own notes so money you may not need never slips by.', from: 'Cancellation notes and spending insights' })
  }
  return out.slice(0, 3)
}

/** Exactly what Premium adds. Everything else in the app, including export, stays free. */
export const PREMIUM_FEATURES = ['Unlimited subscriptions (free covers ten)', 'Spending trends and 12-month projection', 'Price-increase impact report', 'Unused subscription detector']
