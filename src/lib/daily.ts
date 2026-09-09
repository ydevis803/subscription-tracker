import type { CancellationNote, PriceChange, RenewalCheck, Subscription } from '@/db/schema'
import type { IconName } from '@/components/ui/Icon'
import { daysFromToday, daysUntil, formatDate, relativeLower, renewalsInRange, todayISO, toISO } from '@/lib/dates'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { headlineInsights } from '@/lib/insights'
import { notesProgress, DECISION_MILESTONES, FREED_MILESTONES } from '@/lib/progress'
import { CHECK_FRESH_DAYS, CHECK_WINDOW_DAYS } from '@/db/repo'

export interface NextAction {
  kind: 'resume-check' | 'decide-note' | 'confirm-renewal' | 'start-check' | 'confirm-dates' | 'add-first' | 'all-clear'
  icon: IconName
  tone: 'coral' | 'mint' | 'navy'
  title: string
  body: string
  cta: string
  path: string
}

export interface Reward {
  icon: IconName
  tone: 'coral' | 'mint' | 'navy'
  label: string
  text: string
  path?: string
}

const localDay = (iso: string) => toISO(new Date(iso))

/** One thing to do next, by priority. Never more than one. */
export function nextAction(input: {
  subs: Subscription[]
  notes: CancellationNote[]
  active: RenewalCheck | null
  latest: RenewalCheck | null
  lead: number
}): NextAction {
  const { subs, notes, active, latest, lead } = input
  const today = todayISO()
  if (subs.length === 0) {
    return { kind: 'add-first', icon: 'plus', tone: 'mint', title: 'Add your first subscription', body: 'Your monthly total and renewal reminders start the moment one is in.', cta: 'Add a subscription', path: '/subscriptions/new' }
  }
  if (active) {
    const done = active.decisions.length
    const remaining = renewalsInRange(subs, active.periodStart, active.periodEnd).filter((o) => !active.decisions.some((d) => d.key === `${o.subscription.id}:${o.date}`)).length
    if (remaining === 0)
      return { kind: 'resume-check', icon: 'clock', tone: 'mint', title: 'Wrap up your renewal check', body: done === 0 ? 'Nothing was left to review. One tap closes it.' : `All ${done} reviewed. One tap closes it.`, cta: 'Wrap up', path: '/check' }
    return { kind: 'resume-check', icon: 'clock', tone: 'coral', title: 'Finish your renewal check', body: `${done} reviewed, ${remaining} to go. One tap each.`, cta: 'Resume check', path: '/check' }
  }
  const dueNotes = notes.filter((n) => n.status === 'open' && n.remindOn && n.remindOn <= today)
  if (dueNotes.length > 0) {
    const sub = subs.find((s) => s.id === dueNotes[0].subscriptionId)
    return {
      kind: 'decide-note',
      icon: 'note',
      tone: 'coral',
      title: dueNotes.length === 1 && sub ? `Decide on ${sub.name}` : `${dueNotes.length} decisions are due`,
      body: dueNotes.length === 1 ? 'You asked to be reminded today. Keep it, cancel it or snooze it.' : 'Reminders you set have come due. Each one is a single tap.',
      cta: dueNotes.length === 1 ? 'Decide now' : 'See decisions',
      path: '/notes',
    }
  }
  const upcoming = renewalsInRange(subs, today, daysFromToday(CHECK_WINDOW_DAYS))
  const decided = new Set((latest?.decisions ?? []).map((d) => d.key))
  const fresh = latest?.completedAt && daysUntil(localDay(latest.completedAt)) >= -CHECK_FRESH_DAYS
  const imminent = upcoming.filter((o) => daysUntil(o.date) <= lead && !decided.has(`${o.subscription.id}:${o.date}`))
  if (imminent.length > 0) {
    const o = imminent[0]
    return {
      kind: 'confirm-renewal',
      icon: 'bell',
      tone: 'coral',
      title: `${o.subscription.name} renews ${relativeLower(o.date)}`,
      body: `${formatMoney(o.amount, o.subscription.currency)} leaves ${relativeLower(o.date)}. Confirm you still want it, or cancel before it charges.`,
      cta: 'Review it now',
      path: '/check',
    }
  }
  if (upcoming.length > 0 && (!fresh || upcoming.some((o) => !decided.has(`${o.subscription.id}:${o.date}`)))) {
    const amount = upcoming.reduce((s, o) => s + o.amount, 0)
    return {
      kind: 'start-check',
      icon: 'sparkle',
      tone: 'mint',
      title: fresh ? 'New renewals since your last check' : `Check your next ${CHECK_WINDOW_DAYS} days`,
      body: `${upcoming.length} ${upcoming.length === 1 ? 'renewal' : 'renewals'} worth ${formatMoney(amount, subs[0].currency)}. About a minute, one tap each.`,
      cta: 'Start check',
      path: '/check',
    }
  }
  const estimated = subs.filter((s) => s.renewalEstimated && s.status !== 'cancelled')
  if (estimated.length > 0) {
    return {
      kind: 'confirm-dates',
      icon: 'calendar',
      tone: 'navy',
      title: `Confirm ${estimated.length} estimated ${estimated.length === 1 ? 'date' : 'dates'}`,
      body: `${estimated.map((s) => s.name).slice(0, 3).join(', ')}${estimated.length > 3 ? '…' : ''} still use guessed billing dates. Real dates make reminders exact.`,
      cta: 'Set real dates',
      path: `/subscriptions/${estimated[0].id}/edit`,
    }
  }
  return { kind: 'all-clear', icon: 'check', tone: 'mint', title: 'Nothing needs you today', body: 'Every renewal in the next month is reviewed. Look ahead whenever you like.', cta: 'Look at the timeline', path: '/timeline' }
}

/** Seven dots, Monday to Sunday of the current week, filled when the user checked in that day. */
export function weekDots(checkIns: string[], weekStartsOn: 0 | 1): { day: string; label: string; checked: boolean; isToday: boolean; future: boolean }[] {
  const today = new Date()
  const dow = (today.getDay() + 7 - weekStartsOn) % 7
  const start = new Date(today)
  start.setDate(today.getDate() - dow)
  const set = new Set(checkIns)
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = toISO(d)
    return { day: iso, label: formatDate(iso, 'EEEEE'), checked: set.has(iso), isToday: iso === todayISO(), future: iso > todayISO() }
  })
}

/** Things the user did today, counted from timestamps so nothing extra needs storing. */
export function winsToday(input: { notes: CancellationNote[]; checks: RenewalCheck[]; subs: Subscription[] }): number {
  const today = todayISO()
  const decisions = input.checks.reduce((n, c) => n + c.decisions.filter((d) => localDay(d.decidedAt) === today).length, 0)
  const notesDone = input.notes.filter((n) => n.status === 'done' && localDay(n.updatedAt) === today).length
  const checksDone = input.checks.filter((c) => c.completedAt && localDay(c.completedAt) === today).length
  const added = input.subs.filter((s) => localDay(s.createdAt) === today).length
  return decisions + notesDone + checksDone + added
}

/** What happened between the last visit and now, for a warm "welcome back" after a gap. */
export function sinceLastVisit(input: { lastVisit: string | null; subs: Subscription[]; notes: CancellationNote[]; changes: PriceChange[] }): { gapDays: number; text: string | null; tone: 'coral' | 'mint' } {
  const { lastVisit, subs, notes, changes } = input
  if (!lastVisit) return { gapDays: 0, text: null, tone: 'mint' }
  const gapDays = -daysUntil(lastVisit)
  if (gapDays < 2) return { gapDays, text: null, tone: 'mint' }
  const today = todayISO()
  // Charges that went out while away: walk back from each next renewal.
  let wentOut = 0
  let amount = 0
  for (const s of subs) {
    if (!isCounted(s)) continue
    const prev = new Date(s.nextRenewalDate)
    const cycleDays = s.billingCycle === 'weekly' ? 7 : s.billingCycle === 'monthly' ? 30 : s.billingCycle === 'quarterly' ? 91 : 365
    prev.setDate(prev.getDate() - cycleDays)
    const iso = toISO(prev)
    if (iso >= lastVisit && iso < today) {
      wentOut += 1
      amount += s.amount
    }
  }
  const dueNotes = notes.filter((n) => n.status === 'open' && n.remindOn && n.remindOn <= today).length
  const newIncreases = changes.filter((c) => c.newAmount > c.previousAmount && c.effectiveDate >= lastVisit).length
  const parts: string[] = []
  parts.push(wentOut === 0 ? 'no charges went out' : `${wentOut} ${wentOut === 1 ? 'renewal' : 'renewals'} went out as expected (${formatMoney(amount, subs[0]?.currency ?? 'USD')})`)
  if (dueNotes > 0) parts.push(`${dueNotes} ${dueNotes === 1 ? 'reminder is' : 'reminders are'} waiting`)
  if (newIncreases > 0) parts.push(`${newIncreases} price ${newIncreases === 1 ? 'increase' : 'increases'} recorded`)
  return { gapDays, text: `Welcome back. Since ${formatDate(lastVisit, 'EEE d MMM')}: ${parts.join(', ')}.`, tone: dueNotes > 0 ? 'coral' : 'mint' }
}

/** A small, fresh reward that rotates daily: an insight, a milestone or a recommendation. */
export function dailyReward(input: { subs: Subscription[]; notes: CancellationNote[]; changes: PriceChange[]; checkIns: string[]; currency: string; limit: number | null; lead: number }): Reward | null {
  const { subs, notes, changes, checkIns, currency, limit, lead } = input
  const pool: Reward[] = []
  const progress = notesProgress(notes, subs, lead)
  if (progress.done > 0 && DECISION_MILESTONES.includes(progress.done)) pool.push({ icon: 'star', tone: 'mint', label: 'Milestone', text: `${progress.done} ${progress.done === 1 ? 'decision' : 'decisions'} made. Every one of them was money you chose on purpose.`, path: '/notes' })
  if (progress.freedMonthly > 0) {
    const reached = [...FREED_MILESTONES].reverse().find((m) => progress.freedMonthly >= m)
    if (reached) pool.push({ icon: 'trendDown', tone: 'mint', label: 'Milestone', text: `${formatMoney(progress.freedMonthly, currency)} a month no longer leaves your account. That is ${formatMoney(progress.freedMonthly * 12, currency, { compact: true })} a year.`, path: '/notes' })
  }
  for (const h of headlineInsights(subs, changes, currency, limit)) pool.push({ icon: h.icon, tone: h.tone, label: 'Insight', text: h.text, path: h.to })
  const unused = subs.filter((s) => s.status === 'paused')
  if (unused.length > 0) {
    const m = unused.reduce((s, x) => s + toMonthly(x.amount, x.billingCycle), 0)
    pool.push({ icon: 'pause', tone: 'navy', label: 'Recommendation', text: `${unused.map((u) => u.name).join(', ')} ${unused.length === 1 ? 'is' : 'are'} paused. If that stays true next month, cancelling saves ${formatMoney(m, currency)} a month.`, path: `/subscriptions/${unused[0].id}` })
  }
  const counted = subs.filter(isCounted)
  const annual = counted.filter((s) => s.billingCycle === 'monthly' && toMonthly(s.amount, s.billingCycle) >= 10)
  if (annual.length > 0) {
    const s = annual.sort((a, b) => b.amount - a.amount)[0]
    pool.push({ icon: 'wallet', tone: 'navy', label: 'Recommendation', text: `${s.name} is billed monthly at ${formatMoney(s.amount, s.currency)}. Some services discount annual billing; worth a look before the next charge if you plan to keep it.`, path: `/subscriptions/${s.id}` })
  }
  if (checkIns.length >= 3) pool.push({ icon: 'calendar', tone: 'mint', label: 'Habit', text: `You have checked in on ${checkIns.length} ${checkIns.length === 1 ? 'day' : 'days'}. A quick look keeps ${formatMoney(monthlyEquivalent(subs), currency)} a month under your control instead of on autopilot.`, path: '/insights' })
  if (pool.length === 0) return null
  const dayIndex = Math.floor(Date.now() / 86400000)
  return pool[dayIndex % pool.length]
}
