import type { BillingCycle, CategoryId, Subscription, SubscriptionStatus } from '@/db/schema'
import { categoryOf } from '@/lib/categories'
import { CYCLE_NAME, toMonthly } from '@/lib/money'
import { daysUntil } from '@/lib/dates'

export type CycleFilter = 'any' | BillingCycle
export type RenewingFilter = 'any' | '7' | '30'
export type SubscriptionSort = 'renewal' | 'cost-desc' | 'cost-asc' | 'name' | 'added' | 'updated'

export const SORT_OPTIONS: { value: SubscriptionSort; label: string }[] = [
  { value: 'renewal', label: 'Next renewal' },
  { value: 'cost-desc', label: 'Highest cost' },
  { value: 'cost-asc', label: 'Lowest cost' },
  { value: 'name', label: 'Name A to Z' },
  { value: 'added', label: 'Recently added' },
  { value: 'updated', label: 'Recently changed' },
]

export const CYCLE_OPTIONS: { value: CycleFilter; label: string }[] = [
  { value: 'any', label: 'Any cycle' },
  { value: 'weekly', label: CYCLE_NAME.weekly },
  { value: 'monthly', label: CYCLE_NAME.monthly },
  { value: 'quarterly', label: CYCLE_NAME.quarterly },
  { value: 'yearly', label: CYCLE_NAME.yearly },
]

export const RENEWING_OPTIONS: { value: RenewingFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '7', label: 'Next 7 days' },
  { value: '30', label: 'Next 30 days' },
]

/** Partial, case-insensitive match across the fields people actually remember. */
export function matchesQuery(sub: Subscription, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [sub.name, categoryOf(sub.categoryId).name, sub.paymentMethod, sub.notes, sub.website, sub.amount.toFixed(2), CYCLE_NAME[sub.billingCycle], sub.status]
  return haystack.some((v) => v.toLowerCase().includes(q))
}

export function matchesCategories(sub: Subscription, categories: CategoryId[]): boolean {
  return categories.length === 0 || categories.includes(sub.categoryId)
}

export function matchesCycle(sub: Subscription, cycle: CycleFilter): boolean {
  return cycle === 'any' || sub.billingCycle === cycle
}

export function matchesRenewing(sub: Subscription, renewing: RenewingFilter): boolean {
  if (renewing === 'any') return true
  if (sub.status === 'cancelled' || sub.status === 'paused') return false
  const d = daysUntil(sub.nextRenewalDate)
  return d >= 0 && d <= Number(renewing)
}

export function matchesStatuses(sub: Subscription, statuses: SubscriptionStatus[]): boolean {
  return statuses.length === 0 || statuses.includes(sub.status)
}

export function sortSubscriptions(list: Subscription[], sort: SubscriptionSort): Subscription[] {
  const out = [...list]
  switch (sort) {
    case 'renewal':
      out.sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate))
      break
    case 'cost-desc':
      out.sort((a, b) => toMonthly(b.amount, b.billingCycle) - toMonthly(a.amount, a.billingCycle))
      break
    case 'cost-asc':
      out.sort((a, b) => toMonthly(a.amount, a.billingCycle) - toMonthly(b.amount, b.billingCycle))
      break
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'added':
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      break
    case 'updated':
      out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      break
  }
  return out
}

/** Categories that actually appear in a list, in catalogue order, with counts. */
export function presentCategories(subs: Subscription[]): { value: CategoryId; label: string; dot: string; count: number }[] {
  const counts = new Map<CategoryId, number>()
  for (const s of subs) counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1)
  return [...counts.entries()]
    .map(([id, count]) => ({ value: id, label: categoryOf(id).name, dot: categoryOf(id).color, count, order: categoryOf(id).sortOrder }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _o, ...rest }) => rest)
}
