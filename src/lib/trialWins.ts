import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import type { CancellationNote, PriceChange, Subscription } from '@/db/schema'
import type { IconName } from '@/components/ui/Icon'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { countedForLimit, price } from '@/lib/plan'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { daysUntil, renewalsInRange, toISO } from '@/lib/dates'

export interface TrialWin {
  day: number
  icon: IconName
  title: string
  body: string
  cta: string
  path: string
}

/** One premium-only win per trial day, phrased with the user's own numbers. */
export function trialWin(day: number, subs: Subscription[], changes: PriceChange[], notes: CancellationNote[], currency: string): TrialWin {
  const counted = subs.filter(isCounted)
  const monthly = monthlyEquivalent(subs)
  const projection = Array.from({ length: 12 }).map((_, i) => {
    const m = addMonths(startOfMonth(new Date()), i)
    const occ = renewalsInRange(subs, toISO(startOfMonth(m)), toISO(endOfMonth(m)))
    return { label: format(m, 'MMMM'), total: occ.reduce((s, o) => s + o.amount, 0), count: occ.length }
  })
  const peak = projection.reduce((a, b) => (b.total > a.total ? b : a), projection[0])
  const quiet = projection.reduce((a, b) => (b.total < a.total ? b : a), projection[0])
  const increases = changes.filter((c) => c.newAmount > c.previousAmount && daysUntil(c.effectiveDate) >= -365 && counted.some((s) => s.id === c.subscriptionId))
  const extra = increases.reduce((s, c) => {
    const sub = counted.find((x) => x.id === c.subscriptionId)!
    return s + toMonthly(c.newAmount - c.previousAmount, sub.billingCycle)
  }, 0)
  const flagged = subs.filter((s) => s.status === 'paused' || notes.some((n) => n.subscriptionId === s.id && n.status === 'open' && (n.reason === 'not-using' || n.reason === 'too-expensive')))
  const flaggedMonthly = flagged.reduce((s, x) => s + toMonthly(x.amount, x.billingCycle), 0)
  const used = countedForLimit(subs)

  const wins: TrialWin[] = [
    {
      day: 1,
      icon: 'calendar',
      title: peak.total > 0 ? `${peak.label} is your heaviest month: ${formatMoney(peak.total, currency)}` : 'Your next twelve months, mapped',
      body: 'The 12-month projection is unlocked. See exactly which months annual plans land in, so none of them surprise you.',
      cta: 'Open the projection',
      path: '/insights',
    },
    {
      day: 2,
      icon: 'trend',
      title: increases.length > 0 ? `Price rises cost you ${formatMoney(extra, currency)} a month` : 'No price rises in the last year',
      body: increases.length > 0 ? `${increases.length} ${increases.length === 1 ? 'plan went' : 'plans went'} up this year. The impact report shows which ones, so you know what to renegotiate.` : 'The impact report will flag the first increase the moment it is logged.',
      cta: 'See the impact report',
      path: '/insights',
    },
    {
      day: 3,
      icon: 'pause',
      title: flagged.length > 0 ? `${formatMoney(flaggedMonthly, currency)} a month you may not need` : 'Nothing unused right now',
      body: flagged.length > 0 ? `${flagged.length} ${flagged.length === 1 ? 'plan is' : 'plans are'} paused or flagged in your notes. The unused detector keeps them in front of you until you decide.` : 'The unused detector watches pauses, trials and your notes and speaks up when something looks idle.',
      cta: 'Open the detector',
      path: '/insights',
    },
    {
      day: 4,
      icon: 'list',
      title: used >= FREE_SUBSCRIPTION_LIMIT ? 'The ten-subscription limit is off' : `Room for more than ${FREE_SUBSCRIPTION_LIMIT}`,
      body: used >= FREE_SUBSCRIPTION_LIMIT ? `You track ${used}. Add the ones you have been leaving off so your ${formatMoney(monthly, currency)} a month is the whole picture.` : `You track ${used}. Whatever life adds, the list stays complete during the trial and on Premium.`,
      cta: 'Add a subscription',
      path: '/subscriptions/new',
    },
    {
      day: 5,
      icon: 'wallet',
      title: quiet.total < peak.total ? `${quiet.label} is your lightest month: ${formatMoney(quiet.total, currency)}` : 'Every month costs about the same',
      body: 'Knowing the quiet months makes it easier to plan a cancellation or a one-off purchase.',
      cta: 'See month by month',
      path: '/insights',
    },
    {
      day: 6,
      icon: 'chart',
      title: `${formatMoney(monthly * 12, currency, { compact: true })} a year, broken down`,
      body: 'Category shares, billing mix and the biggest lines, all in one place, with the Premium reports underneath.',
      cta: 'Open Insights',
      path: '/insights',
    },
    {
      day: 7,
      icon: 'crown',
      title: 'Last trial day: keep the whole year in view?',
      body: `Premium keeps the projection, the impact report and the unused detector, and lifts the ten-subscription limit, for ${price('monthly')} a month or ${price('yearly')} a year.`,
      cta: 'Choose a plan',
      path: '/premium',
    },
  ]
  return wins[Math.min(Math.max(day, 1), 7) - 1]
}
