import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { daysFromToday, todayISO, toISO } from '@/lib/dates'

/** Local calendar day of a stored (UTC) timestamp. */
export const localDay = (iso: string) => toISO(new Date(iso))

/** Plain-language list of what counts, shown to the user. Keep in sync with activeDays(). */
export const COUNTS_AS_ACTIVE = [
  'Reviewing a renewal in a check (keep, remind or cancel)',
  'Deciding a note: done, cancel or snooze',
  'Adding, editing, pausing or cancelling a subscription',
  'Marking a renewal as paid',
  'Logging a price change',
  'Setting or changing your monthly limit',
]
export const DOES_NOT_COUNT = ['Opening the app or browsing', 'Changing filters, sorting or settings switches']

/**
 * Every local day with at least one meaningful action. Built from record timestamps, so a day is a set
 * member exactly once no matter how many actions it held, and nothing can be counted twice.
 */
export function activeDays(input: { subs: Subscription[]; notes: CancellationNote[]; changes: PriceChange[]; checks: RenewalCheck[]; settings: Settings | undefined }): Set<string> {
  const days = new Set<string>()
  const add = (iso?: string | null) => {
    if (iso) days.add(localDay(iso))
  }
  for (const s of input.subs) {
    add(s.createdAt)
    if (s.updatedAt !== s.createdAt) add(s.updatedAt)
    add(s.cancelledAt ? `${s.cancelledAt}T12:00:00` : null)
  }
  for (const n of input.notes) {
    add(n.createdAt)
    if (n.updatedAt !== n.createdAt) add(n.updatedAt)
  }
  for (const p of input.changes) add(p.createdAt)
  for (const c of input.checks) {
    for (const d of c.decisions) add(d.decidedAt)
    add(c.completedAt)
  }
  for (const h of input.settings?.monthlyBudgetHistory ?? []) add(h.changedAt)
  return days
}

export interface StreakState {
  current: number
  /** Today has no action yet; the streak lives on yesterday. */
  pendingToday: boolean
  /** Yesterday was missed and the one-day grace is holding the streak; an action today keeps it. */
  recovery: boolean
  /** The current run has already used its one-day grace. */
  graceUsed: boolean
  graceDay: string | null
  /** Last seven local days, oldest first. */
  week: { day: string; active: boolean; grace: boolean; isToday: boolean }[]
  /** Longest run ever seen in the data (same grace rule). */
  longestSeen: number
}

/** Walk back from `start` counting active days, allowing a single one-day gap in the run. */
function runFrom(start: string, days: Set<string>): { length: number; graceDay: string | null } {
  let length = 0
  let graceDay: string | null = null
  let cursor = new Date(start + 'T12:00:00')
  let guard = 0
  while (guard++ < 400) {
    const iso = toISO(cursor)
    if (days.has(iso)) length += 1
    else {
      const prev = new Date(cursor)
      prev.setDate(prev.getDate() - 1)
      if (graceDay === null && length > 0 && days.has(toISO(prev))) graceDay = iso
      else break
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return { length, graceDay }
}

export function computeStreak(days: Set<string>): StreakState {
  const today = todayISO()
  const yesterday = daysFromToday(-1)
  const twoAgo = daysFromToday(-2)
  let current = 0
  let pendingToday = false
  let recovery = false
  let graceDay: string | null = null
  if (days.has(today)) {
    const r = runFrom(today, days)
    current = r.length
    graceDay = r.graceDay
  } else if (days.has(yesterday)) {
    const r = runFrom(yesterday, days)
    current = r.length
    graceDay = r.graceDay
    pendingToday = true
  } else if (days.has(twoAgo)) {
    // Yesterday was missed. The run may still stand on its single grace, provided it has not been used.
    const r = runFrom(twoAgo, days)
    if (r.graceDay === null) {
      current = r.length
      graceDay = yesterday
      recovery = true
      pendingToday = true
    }
  }
  const week = Array.from({ length: 7 }).map((_, i) => {
    const day = daysFromToday(i - 6)
    return { day, active: days.has(day), grace: day === graceDay, isToday: day === today }
  })
  // Longest run ever, scanning every active day as a possible end point.
  let longestSeen = 0
  for (const d of days) longestSeen = Math.max(longestSeen, runFrom(d, days).length)
  return { current, pendingToday, recovery, graceUsed: graceDay !== null, graceDay, week, longestSeen }
}
