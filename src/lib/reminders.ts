import { addDays, format } from 'date-fns'
import type { Settings } from '@/db/schema'
import { todayISO, toISO } from '@/lib/dates'

export interface ReminderSchedule {
  /** Days of the week, 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** Local time, HH:MM (24h). */
  time: string
  paused: boolean
  /** ISO date; reminders resume automatically the day after. null = until resumed by hand. */
  pausedUntil: string | null
  /** Show a browser notification while the app is open in a tab. */
  browserNotifications: boolean
}

export const DEFAULT_SCHEDULE: ReminderSchedule = { days: [1, 3, 5], time: '09:00', paused: false, pausedUntil: null, browserNotifications: false }

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function scheduleOf(settings: Settings | undefined): ReminderSchedule {
  return { ...DEFAULT_SCHEDULE, ...(settings?.reminderSchedule ?? {}) }
}

/** Paused right now? A pause with an end date lifts itself the day after that date. */
export function isPaused(s: ReminderSchedule, today = todayISO()): boolean {
  if (!s.paused) return false
  if (s.pausedUntil && s.pausedUntil < today) return false
  return true
}

/** The user's time zone, named and with its current UTC offset, e.g. "Europe/Madrid (UTC+02:00)". */
export function timeZoneLabel(now = new Date()): string {
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time'
  const off = -now.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const mm = String(Math.abs(off) % 60).padStart(2, '0')
  return `${name.replace(/_/g, ' ')} (UTC${sign}${hh}:${mm})`
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return format(d, 'HH:mm')
}

/** Next reminder moment at or after `now` (local), or null when no day is selected or reminders are paused. */
export function nextReminder(s: ReminderSchedule, now = new Date()): Date | null {
  if (s.days.length === 0 || isPaused(s, toISO(now))) return null
  const [h, m] = s.time.split(':').map(Number)
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i)
    if (!s.days.includes(d.getDay())) continue
    const at = new Date(d)
    at.setHours(h, m, 0, 0)
    if (i === 0 && at.getTime() < now.getTime()) continue
    return at
  }
  return null
}

/** Today's reminder state for the dashboard. */
export function todayReminder(s: ReminderSchedule, now = new Date()): { kind: 'paused' | 'none' | 'due' | 'upcoming' | 'later'; at: Date | null; resumesOn: string | null } {
  if (isPaused(s, toISO(now))) return { kind: 'paused', at: null, resumesOn: s.pausedUntil ? toISO(addDays(new Date(s.pausedUntil + 'T12:00:00'), 1)) : null }
  if (s.days.length === 0) return { kind: 'none', at: null, resumesOn: null }
  const [h, m] = s.time.split(':').map(Number)
  const todayAt = new Date(now)
  todayAt.setHours(h, m, 0, 0)
  if (s.days.includes(now.getDay())) return { kind: todayAt.getTime() <= now.getTime() ? 'due' : 'upcoming', at: todayAt, resumesOn: null }
  return { kind: 'later', at: nextReminder(s, now), resumesOn: null }
}

export function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  if (sorted.length === 7) return 'Every day'
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => sorted.includes(d))) return 'Weekdays'
  if (sorted.length === 0) return 'No days chosen'
  return sorted.map((d) => DAY_LABELS[d]).join(' · ')
}
