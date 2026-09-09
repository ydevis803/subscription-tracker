import type { CancellationNote, Subscription } from '@/db/schema'
import { daysUntil, todayISO } from '@/lib/dates'
import { toMonthly } from '@/lib/money'

export const DECISION_MILESTONES = [1, 3, 5, 10, 20, 50]
export const FREED_MILESTONES = [10, 25, 50, 100, 250, 500]

export interface NotesProgress {
  total: number
  done: number
  open: number
  overdue: number
  dueSoon: number
  pct: number
  /** Monthly money no longer leaving because a noted plan was cancelled. */
  freedMonthly: number
  nextDecisionMilestone: number | null
  nextFreedMilestone: number | null
  /** The most urgent open note: overdue first, then soonest reminder, then oldest. */
  nextUp: { note: CancellationNote; sub: Subscription } | null
  decidedThisWeek: number
}

export function notesProgress(notes: CancellationNote[], subs: Subscription[], leadDays = 3): NotesProgress {
  const subById = new Map(subs.map((s) => [s.id!, s]))
  const rows = notes.map((n) => ({ note: n, sub: subById.get(n.subscriptionId) })).filter((r): r is { note: CancellationNote; sub: Subscription } => !!r.sub)
  const done = rows.filter((r) => r.note.status === 'done')
  const open = rows.filter((r) => r.note.status === 'open')
  const today = todayISO()
  const overdue = open.filter((r) => r.note.remindOn && r.note.remindOn < today)
  const dueSoon = open.filter((r) => r.note.remindOn && r.note.remindOn >= today && daysUntil(r.note.remindOn) <= leadDays)
  const freedSubs = new Set(done.filter((r) => r.sub.status === 'cancelled').map((r) => r.sub.id!))
  const freedMonthly = [...freedSubs].reduce((s, id) => {
    const sub = subById.get(id)!
    return s + toMonthly(sub.amount, sub.billingCycle)
  }, 0)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const decidedThisWeek = done.filter((r) => r.note.updatedAt >= weekAgo).length
  const sorted = [...open].sort((a, b) => {
    const ar = a.note.remindOn ?? '9999-12-31'
    const br = b.note.remindOn ?? '9999-12-31'
    return ar.localeCompare(br) || a.note.createdAt.localeCompare(b.note.createdAt)
  })
  return {
    total: rows.length,
    done: done.length,
    open: open.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    pct: rows.length === 0 ? 0 : Math.round((done.length / rows.length) * 100),
    freedMonthly,
    nextDecisionMilestone: DECISION_MILESTONES.find((m) => m > done.length) ?? null,
    nextFreedMilestone: FREED_MILESTONES.find((m) => m > freedMonthly) ?? null,
    nextUp: sorted[0] ?? null,
    decidedThisWeek,
  }
}
