import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { daysFromToday, renewalsInRange, todayISO } from '@/lib/dates'
import { formatMoney, isCounted, monthlyEquivalent } from '@/lib/money'
import { categoryTotals } from '@/components/app/CategoryBreakdown'
import { describeDays, scheduleOf } from '@/lib/reminders'
import type { IconName } from '@/components/ui/Icon'

export const CHALLENGE_DAYS_TOTAL = 7

export interface ChallengeContext {
  subs: Subscription[]
  notes: CancellationNote[]
  changes: PriceChange[]
  checks: RenewalCheck[]
  settings: Settings
  currency: string
}

export interface ChallengeDay {
  day: number
  icon: IconName
  title: string
  /** Why it matters, in one line. */
  body: string
  /** What to do, in one line. */
  task: string
  minutes: number
  cta: string
  /** The one existing feature this day points to. */
  path: string
  /** True once the user has done the day's task (from real data, never a manual tick). */
  done: (ctx: ChallengeContext) => boolean
  /** The visible win, phrased with the user's own numbers. */
  win: (ctx: ChallengeContext) => string
}

/** When a day became the current one: the start for day 1, otherwise the moment the previous day was completed. */
export function unlockedAt(ctx: ChallengeContext, day: number): string {
  const c = ctx.settings.challenge
  if (!c) return ''
  return day <= 1 ? c.startedAt : (c.completed[String(day - 1)] ?? '9999-12-31')
}
/** A visit counts only if it happened while that day was current, so earlier browsing cannot complete days out of order. */
const visited = (ctx: ChallengeContext, key: string, day: number) => (ctx.settings.challenge?.visits[key] ?? '') >= unlockedAt(ctx, day)
const estimatedNow = (ctx: ChallengeContext) => countEstimated(ctx.subs)

export const CHALLENGE_DAYS: ChallengeDay[] = [
  {
    day: 1,
    icon: 'wallet',
    title: 'Know your number',
    body: 'Most people guess their monthly total and guess low. Yours is already worked out.',
    task: 'Open Monthly total and read what it includes.',
    minutes: 2,
    cta: 'See my total',
    path: '/total',
    done: (ctx) => visited(ctx, 'total', 1),
    win: (ctx) => `Your number: ${formatMoney(monthlyEquivalent(ctx.subs), ctx.currency)} a month, ${formatMoney(monthlyEquivalent(ctx.subs) * 12, ctx.currency, { compact: true })} a year.`,
  },
  {
    day: 2,
    icon: 'check',
    title: 'Check the next 30 days',
    body: 'A renewal check walks through what is about to charge you, one tap each.',
    task: 'Run one renewal check to the end.',
    minutes: 5,
    cta: 'Start the check',
    path: '/check',
    done: (ctx) => ctx.checks.some((c) => c.completedAt && c.completedAt >= unlockedAt(ctx, 2)),
    win: (ctx) => {
      const c = [...ctx.checks].filter((x) => x.completedAt && x.completedAt >= unlockedAt(ctx, 2)).sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))[0]
      const n = c?.summary?.reviewed ?? 0
      return n > 0 ? `${n} ${n === 1 ? 'renewal' : 'renewals'} reviewed. Nothing in the next 30 days will surprise you.` : 'Checked. Nothing renews in the next 30 days.'
    },
  },
  {
    day: 3,
    icon: 'calendar',
    title: 'Make one date exact',
    body: 'Estimated dates make reminders fuzzy. Real billing dates make them land on the right day.',
    task: 'Open a subscription marked "estimated" and set its real renewal date.',
    minutes: 3,
    cta: 'Open my list',
    path: '/subscriptions',
    done: (ctx) => {
      const from = unlockedAt(ctx, 3)
      const fixedOne = ctx.subs.some((s) => !s.renewalEstimated && s.status !== 'cancelled' && s.updatedAt >= from)
      return fixedOne || (estimatedNow(ctx) === 0 && visited(ctx, 'subscriptions', 3))
    },
    win: (ctx) => {
      const left = estimatedNow(ctx)
      return left === 0 ? `Every renewal date is exact. Reminders will land on the right day.` : `One date fixed. ${left} ${left === 1 ? 'is' : 'are'} still estimated when you want them.`
    },
  },
  {
    day: 4,
    icon: 'calendar',
    title: 'See the month ahead',
    body: 'The calendar shows which days money leaves, so nothing lands on an empty account.',
    task: 'Open the renewal calendar and find your heaviest week.',
    minutes: 2,
    cta: 'Open the calendar',
    path: '/calendar',
    done: (ctx) => visited(ctx, 'calendar', 4),
    win: (ctx) => {
      const next = renewalsInRange(ctx.subs, todayISO(), daysFromToday(30))
      const total = next.reduce((s, o) => s + o.amount, 0)
      return `${next.length} ${next.length === 1 ? 'charge' : 'charges'} worth ${formatMoney(total, ctx.currency)} in the next 30 days, all on the calendar.`
    },
  },
  {
    day: 5,
    icon: 'note',
    title: 'Decide on one',
    body: 'A note with a reminder turns "I should cancel that" into a decision with a date.',
    task: 'Write one cancellation note on a subscription you are unsure about.',
    minutes: 3,
    cta: 'Write a note',
    path: '/notes',
    done: (ctx) => ctx.notes.some((n) => n.createdAt >= unlockedAt(ctx, 5)),
    win: (ctx) => {
      const n = ctx.notes.filter((x) => x.createdAt >= unlockedAt(ctx, 5))
      const s = ctx.subs.find((x) => x.id === n[0]?.subscriptionId)
      return s ? `Decision queued for ${s.name}. It will come back to you before it renews.` : 'One decision queued. It will come back before it renews.'
    },
  },
  {
    day: 6,
    icon: 'chart',
    title: 'See where it goes',
    body: 'Spending by category shows which habit costs most, which is where cutting is easiest.',
    task: 'Open Spending insights and read the biggest category.',
    minutes: 3,
    cta: 'Open insights',
    path: '/insights',
    done: (ctx) => visited(ctx, 'insights', 6),
    win: (ctx) => {
      const totals = categoryTotals(ctx.subs)
      const top = totals[0]
      const monthly = monthlyEquivalent(ctx.subs)
      return top && monthly > 0 ? `${top.name} is your biggest category at ${Math.round((top.monthly / monthly) * 100)}% of the total.` : 'You know where every dollar goes.'
    },
  },
  {
    day: 7,
    icon: 'bell',
    title: 'Set your rhythm',
    body: 'Two or three short check-ins a week keep the total honest without becoming a chore.',
    task: 'Open Reminders and pick the days and time that suit you.',
    minutes: 2,
    cta: 'Set reminders',
    path: '/reminders',
    done: (ctx) => visited(ctx, 'reminders', 7),
    win: (ctx) => {
      const s = scheduleOf(ctx.settings)
      return `Reminders ${s.paused ? 'are paused for now' : `on ${describeDays(s.days)} at ${s.time}`}. You finished the seven-day challenge.`
    },
  },
]

export type DayStatus = 'done' | 'current' | 'locked'

export interface ChallengeState {
  started: boolean
  hidden: boolean
  days: { def: ChallengeDay; status: DayStatus; doneAt: string | null }[]
  /** The day to work on now, or null when all seven are done. */
  current: ChallengeDay | null
  completedCount: number
  complete: boolean
  /** The most recently completed day, for showing its win. */
  lastDone: ChallengeDay | null
}

/** Days unlock strictly in order and never expire. There is no date arithmetic here, so a late user simply carries on. */
export function challengeState(settings: Settings | undefined): ChallengeState {
  const c = settings?.challenge
  if (!c) return { started: false, hidden: false, days: CHALLENGE_DAYS.map((def) => ({ def, status: def.day === 1 ? 'current' : 'locked', doneAt: null })), current: CHALLENGE_DAYS[0], completedCount: 0, complete: false, lastDone: null }
  let currentFound = false
  const days = CHALLENGE_DAYS.map((def) => {
    const doneAt = c.completed[String(def.day)] ?? null
    let status: DayStatus
    if (doneAt) status = 'done'
    else if (!currentFound) {
      status = 'current'
      currentFound = true
    } else status = 'locked'
    return { def, status, doneAt }
  })
  const completedCount = days.filter((d) => d.status === 'done').length
  const current = days.find((d) => d.status === 'current')?.def ?? null
  const lastDone = [...days].reverse().find((d) => d.status === 'done')?.def ?? null
  return { started: true, hidden: !!c.dismissedAt, days, current, completedCount, complete: completedCount === CHALLENGE_DAYS_TOTAL, lastDone }
}

export function countEstimated(subs: Subscription[]): number {
  return subs.filter((s) => s.renewalEstimated && s.status !== 'cancelled' && isCounted(s)).length
}
