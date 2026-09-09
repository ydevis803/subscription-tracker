import type { Profile, RenewalCheck, Settings } from '@/db/schema'
import { daysUntil, todayISO, toISO } from '@/lib/dates'

/** Days to wait before asking again after "Not now". */
export const RATING_COOLDOWN_DAYS = 60
/** After this many "Not now" answers the prompt never returns. */
export const RATING_MAX_ASKS = 3
/** Scores at or above this open the store rating placeholder; below it, the private feedback form. */
export const RATING_HIGH_SCORE = 4

export function ratingPromptOf(settings: Settings | undefined) {
  return settings?.ratingPrompt ?? { askedAt: [], dismissedAt: null, outcome: null, score: null, answeredAt: null }
}

/** The store listing, when one exists. Empty means the CTA is a placeholder that thanks the user and records the intent. */
export function storeUrl(): string {
  return ((import.meta.env.VITE_STORE_URL as string | undefined) ?? '').trim()
}

export interface RatingInput {
  profile: Profile | undefined
  settings: Settings | undefined
  checks: RenewalCheck[]
  /** From problemState(): the user is dealing with something; never ask then. */
  problem: string | null
  today?: string
}

/**
 * Why the prompt is not showing right now, or null when it should. Rules:
 * - a meaningful repeat success: renewal checks completed on at least two different days, one of them today;
 * - never on the day the profile was created (first launch);
 * - never during a problem state;
 * - once answered (rated or feedback given) it never returns;
 * - at most RATING_MAX_ASKS asks, at least RATING_COOLDOWN_DAYS apart; an ask stays visible for the rest of
 *   the day it first appeared so a reload does not make it vanish, unless "Not now" was tapped.
 */
export function ratingPromptBlocker(input: RatingInput): string | null {
  const today = input.today ?? todayISO()
  const p = ratingPromptOf(input.settings)
  if (p.outcome) return 'answered'
  const last = p.askedAt[p.askedAt.length - 1]
  const askedToday = !!last && toISO(new Date(last)) === today
  if (p.askedAt.length >= RATING_MAX_ASKS && !askedToday) return 'max-asks'
  if (p.dismissedAt && daysUntil(toISO(new Date(p.dismissedAt)), today) > -RATING_COOLDOWN_DAYS) return 'cooldown'
  if (last && !askedToday && daysUntil(toISO(new Date(last)), today) > -RATING_COOLDOWN_DAYS) return 'cooldown'
  if (!input.profile || !input.settings) return 'loading'
  if (toISO(new Date(input.profile.createdAt)) === today) return 'first-launch'
  if (input.problem) return `problem:${input.problem}`
  const days = new Set(input.checks.filter((c) => c.completedAt).map((c) => toISO(new Date(c.completedAt!))))
  if (days.size < 2) return 'no-repeat-success'
  if (!days.has(today)) return 'not-today'
  return null
}

export function ratingPromptVisible(input: RatingInput): boolean {
  return ratingPromptBlocker(input) === null
}

/** Plain-language summary of the cap, shown next to the prompt so the rule is visible. */
export const RATING_CAP_TEXT = `Asked at most ${RATING_MAX_ASKS} times, never twice within ${RATING_COOLDOWN_DAYS} days, and never again once you answer.`
