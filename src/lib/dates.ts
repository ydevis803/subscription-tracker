import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { BillingCycle, Subscription } from '@/db/schema'

export const ISO = 'yyyy-MM-dd'

export function todayISO(): string {
  return format(new Date(), ISO)
}

export function toISO(d: Date): string {
  return format(d, ISO)
}

export function fromISO(iso: string): Date {
  return startOfDay(parseISO(iso))
}

export function addCycle(iso: string, cycle: BillingCycle, n = 1): string {
  const d = fromISO(iso)
  switch (cycle) {
    case 'weekly':
      return toISO(addWeeks(d, n))
    case 'monthly':
      return toISO(addMonths(d, n))
    case 'quarterly':
      return toISO(addMonths(d, 3 * n))
    case 'yearly':
      return toISO(addYears(d, n))
  }
}

/** Advance a renewal date until it is today or later. */
export function rollForward(iso: string, cycle: BillingCycle, from: string = todayISO()): string {
  let next = iso
  let guard = 0
  while (isBefore(fromISO(next), fromISO(from)) && guard < 600) {
    next = addCycle(next, cycle)
    guard++
  }
  return next
}

export function daysUntil(iso: string, from: string = todayISO()): number {
  return differenceInCalendarDays(fromISO(iso), fromISO(from))
}

export function formatDate(iso: string, pattern = 'd MMM yyyy'): string {
  return format(fromISO(iso), pattern)
}

export function formatRelative(iso: string): string {
  const days = daysUntil(iso)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)} days ago`
  if (days < 7) return `In ${days} days`
  if (days < 30) return `In ${Math.round(days / 7)} wk${Math.round(days / 7) === 1 ? '' : 's'}`
  return formatDate(iso, 'd MMM')
}

/** formatRelative in lowercase for mid-sentence use; explicit dates keep their casing. */
export function relativeLower(iso: string): string {
  const r = formatRelative(iso)
  return /^\d/.test(r) ? r : r.toLowerCase()
}

export interface RenewalOccurrence {
  subscription: Subscription
  date: string
  amount: number
}

/** Expand every charge a subscription will make between two ISO dates (inclusive). */
export function occurrencesBetween(sub: Subscription, startISO: string, endISO: string): RenewalOccurrence[] {
  if (sub.status === 'cancelled' || sub.status === 'paused') return []
  const out: RenewalOccurrence[] = []
  const start = fromISO(startISO)
  const end = fromISO(endISO)
  let cursor = sub.nextRenewalDate
  let guard = 0
  while (guard < 400) {
    const d = fromISO(cursor)
    if (isAfter(d, end)) break
    if (!isBefore(d, start)) out.push({ subscription: sub, date: cursor, amount: sub.amount })
    cursor = addCycle(cursor, sub.billingCycle)
    guard++
  }
  return out
}

export function renewalsInRange(subs: Subscription[], startISO: string, endISO: string): RenewalOccurrence[] {
  return subs
    .flatMap((s) => occurrencesBetween(s, startISO, endISO))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.subscription.name.localeCompare(b.subscription.name)))
}

export function daysFromToday(n: number): string {
  return toISO(addDays(new Date(), n))
}

export function monthsFromToday(n: number): string {
  return toISO(addMonths(new Date(), n))
}
