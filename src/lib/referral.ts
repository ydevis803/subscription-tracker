import type { CancellationNote, PriceChange, Profile, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { daysUntil, todayISO, toISO } from '@/lib/dates'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import type { IconName } from '@/components/ui/Icon'

/**
 * The link an invitation carries. It is the address this copy of the app is served from, so it always
 * opens somewhere real. `VITE_APP_URL` overrides it for a published build.
 */
export function appLink(): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.trim().replace(/\/+$/, '')
  const base = configured || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/?ref=friend`
}

export interface InvitationInput {
  profile: Profile | undefined
  subs: Subscription[]
  changes: PriceChange[]
  notes: CancellationNote[]
  /** Mention the sender's own numbers (count, monthly total, freed money). Off keeps the message generic. */
  includeNumbers: boolean
}

/** A personal invitation for someone who wants control of their monthly digital spending. Always ends with the app link. */
export function invitationMessage(input: InvitationInput): string {
  const { profile, subs, changes, notes, includeNumbers } = input
  const currency = profile?.currency ?? 'USD'
  const counted = subs.filter(isCounted)
  const monthly = monthlyEquivalent(subs)
  const increases = changes.filter((c) => c.newAmount > c.previousAmount && daysUntil(c.effectiveDate) >= -365 && counted.some((s) => s.id === c.subscriptionId))
  const freed = subs.filter((s) => s.status === 'cancelled' && notes.some((n) => n.subscriptionId === s.id && n.status === 'done')).reduce((sum, s) => sum + toMonthly(s.amount, s.billingCycle), 0)

  const lines: string[] = []
  lines.push('Hi! I use Subscription Tracker to see every recurring charge before it quietly renews.')
  if (includeNumbers && counted.length > 0) {
    let mine = `It keeps my ${counted.length} ${counted.length === 1 ? 'subscription' : 'subscriptions'} and ${formatMoney(monthly, currency)} a month in one place`
    const extras: string[] = []
    if (increases.length > 0) extras.push(`caught ${increases.length} price ${increases.length === 1 ? 'rise' : 'rises'}`)
    if (freed > 0) extras.push(`helped me free up ${formatMoney(freed, currency)} a month`)
    if (extras.length) mine += `, and it has ${extras.join(' and ')}`
    lines.push(mine + '.')
  } else {
    lines.push('It shows the monthly total, warns before each renewal and keeps cancellation notes where you will see them.')
  }
  lines.push(`The first ${FREE_SUBSCRIPTION_LIMIT === 10 ? 'ten' : FREE_SUBSCRIPTION_LIMIT} subscriptions are free, no card needed.`)
  lines.push(`Try it here: ${appLink()}`)
  const name = profile?.name?.trim()
  if (name) lines.push(`— ${name}`)
  return lines.join('\n')
}

// ---------- Cosmetic badges ----------

export interface InviteBadge {
  id: 'first-invite' | 'three-invites'
  title: string
  icon: IconName
  /** Invitations needed. */
  at: number
  howTo: string
}

/** Rewards are cosmetic only. Nothing here promises money. */
export const INVITE_BADGES: InviteBadge[] = [
  { id: 'first-invite', title: 'Good influence', icon: 'sparkle', at: 1, howTo: 'Share your first invitation.' },
  { id: 'three-invites', title: 'Circle of savers', icon: 'users', at: 3, howTo: 'Share three invitations.' },
]

export interface InviteProgress {
  count: number
  earned: InviteBadge[]
  next: InviteBadge | null
  /** Highest badge earned, for the Profile pill. */
  top: InviteBadge | null
  lastAt: string | null
}

export function inviteProgress(settings: Settings | undefined): InviteProgress {
  const invites = settings?.invites ?? []
  const count = invites.length
  const earned = INVITE_BADGES.filter((b) => count >= b.at)
  const next = INVITE_BADGES.find((b) => count < b.at) ?? null
  return { count, earned, next, top: earned[earned.length - 1] ?? null, lastAt: invites[invites.length - 1]?.at ?? null }
}

// ---------- When to offer sharing ----------

export interface MomentInput {
  subs: Subscription[]
  notes: CancellationNote[]
  changes: PriceChange[]
  checks: RenewalCheck[]
  settings: Settings | undefined
  monthlyBudget: number | null
  syncStatus?: string
}

/** Something went well today: a completed renewal check, a milestone or a settled decision. */
export function positiveMomentToday(input: MomentInput): boolean {
  const today = todayISO()
  const sameDay = (iso: string | null | undefined) => !!iso && toISO(new Date(iso)) === today
  if (input.checks.some((c) => c.completedAt && sameDay(c.completedAt))) return true
  if (Object.values(input.settings?.milestonesSeen ?? {}).some(sameDay)) return true
  if (input.notes.some((n) => n.status === 'done' && sameDay(n.updatedAt))) return true
  return false
}

/** Has the user ever reached a positive moment? Gates the standing entry on Profile. */
export function everHadPositiveMoment(input: Pick<MomentInput, 'checks' | 'settings' | 'notes'>): boolean {
  if (input.checks.some((c) => !!c.completedAt)) return true
  if (Object.keys(input.settings?.milestonesSeen ?? {}).length > 0) return true
  if (input.notes.some((n) => n.status === 'done')) return true
  return (input.settings?.invites?.length ?? 0) > 0
}

/** A problem the user should deal with first. No invitation prompt appears while one of these is true. */
export function problemState(input: MomentInput): string | null {
  const monthly = monthlyEquivalent(input.subs)
  if (input.monthlyBudget !== null && monthly > input.monthlyBudget) return 'over-budget'
  if (input.syncStatus === 'error') return 'sync-error'
  const today = todayISO()
  if (input.notes.some((n) => n.status === 'open' && n.remindOn && n.remindOn < today)) return 'overdue-note'
  const counted = input.subs.filter(isCounted)
  if (input.changes.some((c) => c.newAmount > c.previousAmount && daysUntil(c.effectiveDate) >= -7 && counted.some((s) => s.id === c.subscriptionId))) return 'recent-increase'
  if (input.subs.some((s) => s.status === 'trial' && s.trialEndsAt && daysUntil(s.trialEndsAt) >= 0 && daysUntil(s.trialEndsAt) <= 3)) return 'trial-ending'
  return null
}

const NUDGE_QUIET_DAYS = 14

/** The Home invite card: only after a positive moment, never during a problem, and not again for a while once used or dismissed. */
export function inviteNudgeVisible(input: MomentInput): boolean {
  if (!positiveMomentToday(input)) return false
  if (problemState(input)) return false
  const s = input.settings
  if (s?.inviteNudgeDismissed && daysUntil(s.inviteNudgeDismissed) > -NUDGE_QUIET_DAYS) return false
  const last = s?.invites?.[s.invites.length - 1]?.at
  if (last && daysUntil(toISO(new Date(last))) > -NUDGE_QUIET_DAYS) return false
  return true
}

// ---------- Sharing ----------

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable'

/** Native share sheet where it exists (with the link as a real URL), otherwise the clipboard. */
export async function shareInvitation(text: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { share?: (data: { title: string; text: string; url?: string }) => Promise<void>; canShare?: (d: unknown) => boolean }
  if (nav.share) {
    try {
      await nav.share({ title: 'Subscription Tracker', text })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(text)) ? 'copied' : 'unavailable'
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
