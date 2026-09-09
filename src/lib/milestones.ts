import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import type { IconName } from '@/components/ui/Icon'
import { formatMoney, monthlyEquivalent } from '@/lib/money'
import { activeDays, computeStreak } from '@/lib/streak'

export type MilestoneId = 'first-action' | 'day-3' | 'day-7' | 'first-check'

export interface MilestoneContext {
  subs: Subscription[]
  notes: CancellationNote[]
  changes: PriceChange[]
  checks: RenewalCheck[]
  settings: Settings
  currency: string
}

export interface Milestone {
  id: MilestoneId
  icon: IconName
  title: string
  /** Shown on the card and in the achievements list once earned. */
  body: (ctx: MilestoneContext) => string
  /** Shown in the achievements list while still locked. */
  howTo: string
  /** Prewritten text for the share sheet or clipboard. */
  share: (ctx: MilestoneContext) => string
  met: (ctx: MilestoneContext) => boolean
}

const money = (ctx: MilestoneContext) => formatMoney(monthlyEquivalent(ctx.subs), ctx.currency)
const streakOf = (ctx: MilestoneContext) => computeStreak(activeDays(ctx))
const firstCheck = (ctx: MilestoneContext) => ctx.checks.filter((c) => c.completedAt && c.summary && c.summary.reviewed > 0).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))[0]

/** In display priority: when several are newly met at once, the first in this list is shown. */
export const MILESTONES: Milestone[] = [
  {
    id: 'day-7',
    icon: 'star',
    title: 'Seven days in a row',
    body: () => 'A full week of looking after your money. Renewals now have nowhere to hide.',
    howTo: 'Do one meaningful thing on seven days in a row (one free miss allowed).',
    share: (ctx) => `Seven days in a row keeping my subscriptions in check: ${money(ctx)} a month, every renewal on one timeline. Nothing renews without me knowing.`,
    met: (ctx) => {
      const s = streakOf(ctx)
      return s.current >= 7 || s.longestSeen >= 7
    },
  },
  {
    id: 'first-check',
    icon: 'shield',
    title: 'Under control',
    body: (ctx) => {
      const c = firstCheck(ctx)
      return c?.summary ? `Your first renewal check: ${c.summary.reviewed} ${c.summary.reviewed === 1 ? 'renewal' : 'renewals'} worth ${formatMoney(c.summary.amountReviewed, ctx.currency)} reviewed, one tap each.` : 'Your first renewal check is done.'
    },
    howTo: 'Complete a renewal check from Home.',
    share: (ctx) => {
      const c = firstCheck(ctx)
      const n = c?.summary?.reviewed ?? 0
      return `Just reviewed ${n} upcoming ${n === 1 ? 'renewal' : 'renewals'} in about a minute and I'm all clear for the next 30 days. Monthly total: ${money(ctx)}.`
    },
    met: (ctx) => !!firstCheck(ctx),
  },
  {
    id: 'day-3',
    icon: 'sparkle',
    title: 'Three days in a row',
    body: () => 'Three days of small decisions. This is how a subscription stops being a surprise.',
    howTo: 'Do one meaningful thing on three days in a row.',
    share: (ctx) => `Three days in a row checking on my subscriptions. ${money(ctx)} a month, and I know exactly where every bit of it goes.`,
    met: (ctx) => {
      const s = streakOf(ctx)
      return s.current >= 3 || s.longestSeen >= 3
    },
  },
  {
    id: 'first-action',
    icon: 'check',
    title: 'First move made',
    body: (ctx) => `You took the first step toward controlling ${money(ctx)} a month of subscriptions. Everything else builds on this.`,
    howTo: 'Add a subscription, decide a note, review a renewal or set your limit.',
    share: (ctx) => `I just started tracking my subscriptions: ${money(ctx)} a month, with a reminder before every renewal. First move made.`,
    met: (ctx) => activeDays(ctx).size >= 1,
  },
]

export function milestoneById(id: string): Milestone | undefined {
  return MILESTONES.find((m) => m.id === id)
}
