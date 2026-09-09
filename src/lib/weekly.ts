import { addDays, endOfWeek, startOfWeek } from 'date-fns'
import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { daysFromToday, formatDate, todayISO, toISO } from '@/lib/dates'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { localDay } from '@/lib/streak'
import { nextAction, type NextAction } from '@/lib/daily'
import { renewalsInRange } from '@/lib/dates'

export interface WeekRange {
  start: string
  end: string
  label: string
  isCurrent: boolean
}

/** The week containing today shifted by `offset` weeks (0 = this week, -1 = last week). */
export function weekRange(offset: number, weekStartsOn: 0 | 1): WeekRange {
  const base = addDays(new Date(), offset * 7)
  const start = startOfWeek(base, { weekStartsOn })
  const end = endOfWeek(base, { weekStartsOn })
  const s = toISO(start)
  const e = toISO(end)
  const sameMonth = formatDate(s, 'MMM') === formatDate(e, 'MMM')
  return { start: s, end: e, label: `${formatDate(s, sameMonth ? 'EEE d' : 'EEE d MMM')} – ${formatDate(e, 'EEE d MMM')}`, isCurrent: offset === 0 }
}

export interface Completed {
  checks: number
  decisions: number
  notesDecided: number
  notesAdded: number
  subsAdded: number
  subsCancelled: number
  priceChanges: number
  limitChanges: number
  total: number
  activeDays: number
  /** Actions per day across the week, oldest first. */
  byDay: { day: string; label: string; count: number; isToday: boolean; future: boolean }[]
}

export interface Change {
  totalStart: number
  totalEnd: number
  delta: number
  freedMonthly: number
  addedMonthly: number
  increasesMonthly: number
}

export interface WeeklySummary {
  range: WeekRange
  completed: Completed
  change: Change
  recommendation: NextAction & { why: string }
}

const inRange = (iso: string | null | undefined, r: WeekRange, isDate = false) => {
  if (!iso) return false
  const d = isDate ? iso : localDay(iso)
  return d >= r.start && d <= r.end
}

/** Monthly total as it stood at the end of `day`, rebuilt from start and cancellation dates and price history. */
export function monthlyTotalAt(subs: Subscription[], changes: PriceChange[], day: string): number {
  let total = 0
  for (const s of subs) {
    if (s.status === 'paused') continue
    if (s.startDate > day) continue
    if (s.status === 'cancelled' && s.cancelledAt && s.cancelledAt <= day) continue
    const later = changes.filter((c) => c.subscriptionId === s.id && c.effectiveDate > day).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    const amount = later.length ? later[0].previousAmount : s.amount
    total += toMonthly(amount, s.billingCycle)
  }
  return total
}

export function weeklySummary(input: {
  subs: Subscription[]
  notes: CancellationNote[]
  changes: PriceChange[]
  checks: RenewalCheck[]
  settings: Settings
  active: RenewalCheck | null
  latest: RenewalCheck | null
  currency: string
  offset: number
}): WeeklySummary {
  const { subs, notes, changes, checks, settings, currency, offset } = input
  const range = weekRange(offset, settings.weekStartsOn)
  const today = todayISO()

  // ---- What you completed ----
  const perDay = new Map<string, number>()
  const bump = (iso: string | null | undefined, isDate = false) => {
    if (!inRange(iso, range, isDate)) return false
    const d = isDate ? iso! : localDay(iso!)
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
    return true
  }
  let checksDone = 0
  let decisions = 0
  for (const c of checks) {
    if (bump(c.completedAt)) checksDone++
    for (const d of c.decisions) if (bump(d.decidedAt)) decisions++
  }
  let notesDecided = 0
  let notesAdded = 0
  for (const n of notes) {
    if (bump(n.createdAt)) notesAdded++
    if (n.status === 'done' && n.updatedAt !== n.createdAt && bump(n.updatedAt)) notesDecided++
  }
  let subsAdded = 0
  let subsCancelled = 0
  for (const s of subs) {
    if (bump(s.createdAt)) subsAdded++
    if (s.status === 'cancelled' && bump(s.cancelledAt, true)) subsCancelled++
  }
  let priceChanges = 0
  for (const p of changes) if (bump(p.createdAt)) priceChanges++
  let limitChanges = 0
  for (const h of settings.monthlyBudgetHistory ?? []) if (bump(h.changedAt)) limitChanges++
  const byDay = Array.from({ length: 7 }).map((_, i) => {
    const day = toISO(addDays(new Date(range.start + 'T12:00:00'), i))
    return { day, label: formatDate(day, 'EEEEE'), count: perDay.get(day) ?? 0, isToday: day === today, future: day > today }
  })
  const completed: Completed = {
    checks: checksDone,
    decisions,
    notesDecided,
    notesAdded,
    subsAdded,
    subsCancelled,
    priceChanges,
    limitChanges,
    total: checksDone + decisions + notesDecided + notesAdded + subsAdded + subsCancelled + priceChanges + limitChanges,
    activeDays: [...perDay.keys()].length,
    byDay,
  }

  // ---- How you changed ----
  const dayBefore = toISO(addDays(new Date(range.start + 'T12:00:00'), -1))
  const totalStart = monthlyTotalAt(subs, changes, dayBefore)
  const totalEnd = range.isCurrent ? monthlyEquivalent(subs) : monthlyTotalAt(subs, changes, range.end)
  const freedMonthly = subs.filter((s) => s.status === 'cancelled' && inRange(s.cancelledAt, range, true)).reduce((t, s) => t + toMonthly(s.amount, s.billingCycle), 0)
  const addedMonthly = subs.filter((s) => inRange(s.createdAt, range) && isCounted(s)).reduce((t, s) => t + toMonthly(s.amount, s.billingCycle), 0)
  const increasesMonthly = changes
    .filter((c) => inRange(c.effectiveDate, range, true) && c.newAmount > c.previousAmount)
    .reduce((t, c) => {
      const s = subs.find((x) => x.id === c.subscriptionId)
      return s && isCounted(s) ? t + toMonthly(c.newAmount - c.previousAmount, s.billingCycle) : t
    }, 0)
  const change: Change = { totalStart, totalEnd, delta: totalEnd - totalStart, freedMonthly, addedMonthly, increasesMonthly }

  // ---- One recommended next action ----
  const base = nextAction({ subs, notes, active: input.active, latest: input.latest, lead: settings.defaultReminderDays })
  let recommendation: NextAction & { why: string }
  if (base.kind === 'all-clear') {
    const ahead = renewalsInRange(subs, daysFromToday(1), daysFromToday(14))
    const amount = ahead.reduce((s, o) => s + o.amount, 0)
    recommendation =
      ahead.length > 0
        ? { ...base, icon: 'trend', tone: 'navy', title: 'Look at the next two weeks', body: `${ahead.length} ${ahead.length === 1 ? 'renewal' : 'renewals'} worth ${formatMoney(amount, currency)} are coming. A quick look now means no surprises next week.`, cta: 'See next two weeks', path: '/timeline?h=14&cat=', why: 'Everything due this month is already reviewed.' }
        : { ...base, why: 'Nothing is due in the next two weeks.' }
  } else {
    const why: Record<NextAction['kind'], string> = {
      'add-first': 'Nothing is tracked yet, so nothing else can help until one subscription is in.',
      'resume-check': 'An unfinished check is the fastest way to know you are covered.',
      'decide-note': 'A reminder you set has come due, and deciding is one tap.',
      'confirm-renewal': 'A charge lands within your heads-up window and has not been reviewed.',
      'start-check': 'Renewals are coming that no check has covered yet.',
      'confirm-dates': 'Estimated dates make reminders fire at the wrong time.',
      'all-clear': '',
    }
    recommendation = { ...base, why: why[base.kind] }
  }
  return { range, completed, change, recommendation }
}
