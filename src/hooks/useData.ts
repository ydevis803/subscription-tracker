import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Profile, type Settings, type Subscription } from '@/db/schema'
import { useScopeKey } from '@/auth/AuthContext'
import { readCached, writeCached } from '@/hooks/queryCache'
import { useEffect } from 'react'

/** Live query that paints the last known result at once and updates when IndexedDB answers. */
function useCachedQuery<T>(name: string, querier: () => T | Promise<T>, deps: unknown[]): T | undefined {
  const key = `${name}:${deps.join('|')}`
  const result = useLiveQuery(querier, deps, readCached<T>(key))
  useEffect(() => {
    if (result !== undefined) writeCached(key, result)
  }, [key, result])
  return result
}

export function useProfile(): Profile | undefined {
  const key = useScopeKey()
  return useCachedQuery('profile', () => db.profile.get(1), [key])
}

export function useSettings(): Settings | undefined {
  const key = useScopeKey()
  return useCachedQuery('settings', () => db.settings.get(1), [key])
}

export function useSubscriptions(): Subscription[] | undefined {
  const key = useScopeKey()
  return useCachedQuery('subscriptions', () => db.subscriptions.orderBy('nextRenewalDate').toArray(), [key])
}

/** undefined while loading, null when the record does not exist, otherwise the subscription. */
export function useSubscription(id: number | undefined): Subscription | null | undefined {
  const key = useScopeKey()
  return useLiveQuery(async () => (id === undefined || Number.isNaN(id) ? null : ((await db.subscriptions.get(id)) ?? null)), [id, key])
}

export function usePriceChanges(subscriptionId?: number) {
  const key = useScopeKey()
  return useCachedQuery(
    'priceChanges',
    () =>
      subscriptionId === undefined
        ? db.priceChanges.orderBy('effectiveDate').reverse().toArray()
        : db.priceChanges.where('[subscriptionId+effectiveDate]').between([subscriptionId, Dexie.minKey], [subscriptionId, Dexie.maxKey]).reverse().toArray(),
    [subscriptionId, key],
  )
}

export function useNotes(subscriptionId?: number) {
  const key = useScopeKey()
  return useCachedQuery(
    'notes',
    () =>
      subscriptionId === undefined
        ? db.cancellationNotes.toArray()
        : db.cancellationNotes.where('subscriptionId').equals(subscriptionId).toArray(),
    [subscriptionId, key],
  )
}

export function useActiveCheck() {
  const key = useScopeKey()
  return useCachedQuery('activeCheck', async () => (await db.renewalChecks.filter((c) => c.completedAt === null).toArray()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null, [key])
}

export function useLatestCompletedCheck() {
  const key = useScopeKey()
  return useCachedQuery('latestCheck', async () => (await db.renewalChecks.filter((c) => c.completedAt !== null).toArray()).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0] ?? null, [key])
}

export function useBillingEvents() {
  const key = useScopeKey()
  return useCachedQuery('billingEvents', () => db.billingEvents.orderBy('occurredAt').reverse().toArray(), [key])
}

/** All renewal checks, newest first by start. Cached like the other hooks. */
export function useAllChecks() {
  const key = useScopeKey()
  return useCachedQuery('allChecks', () => db.renewalChecks.toArray(), [key])
}
