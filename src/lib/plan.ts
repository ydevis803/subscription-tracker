import { FREE_SUBSCRIPTION_LIMIT, type Profile, type Subscription } from '@/db/schema'

export class PlanLimitError extends Error {
  constructor() {
    super(`Free plan includes up to ${FREE_SUBSCRIPTION_LIMIT} subscriptions.`)
    this.name = 'PlanLimitError'
  }
}

export function isPremium(profile: Profile | undefined | null): boolean {
  return profile?.plan === 'premium'
}

/** Subscriptions that count toward the free limit: everything not cancelled. */
export function countedForLimit(subs: Subscription[]): number {
  return subs.filter((s) => s.status !== 'cancelled').length
}

export function remainingFreeSlots(subs: Subscription[]): number {
  return Math.max(0, FREE_SUBSCRIPTION_LIMIT - countedForLimit(subs))
}

export function canAddSubscription(profile: Profile | undefined | null, subs: Subscription[]): boolean {
  return isPremium(profile) || countedForLimit(subs) < FREE_SUBSCRIPTION_LIMIT
}

export const PREMIUM_FEATURES = [
  'Unlimited subscriptions',
  'Spending trends and 12-month projection',
  'Price-increase impact report',
  'Unused subscription detector',
  'Export your data any time',
]
