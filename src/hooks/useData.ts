import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Profile, type Settings, type Subscription } from '@/db/schema'
import { useScopeKey } from '@/auth/AuthContext'

export function useProfile(): Profile | undefined {
  const key = useScopeKey()
  return useLiveQuery(() => db.profile.get(1), [key])
}

export function useSettings(): Settings | undefined {
  const key = useScopeKey()
  return useLiveQuery(() => db.settings.get(1), [key])
}

export function useSubscriptions(): Subscription[] | undefined {
  const key = useScopeKey()
  return useLiveQuery(() => db.subscriptions.orderBy('nextRenewalDate').toArray(), [key])
}

/** undefined while loading, null when the record does not exist, otherwise the subscription. */
export function useSubscription(id: number | undefined): Subscription | null | undefined {
  const key = useScopeKey()
  return useLiveQuery(async () => (id === undefined || Number.isNaN(id) ? null : ((await db.subscriptions.get(id)) ?? null)), [id, key])
}

export function usePriceChanges(subscriptionId?: number) {
  const key = useScopeKey()
  return useLiveQuery(
    () =>
      subscriptionId === undefined
        ? db.priceChanges.orderBy('effectiveDate').reverse().toArray()
        : db.priceChanges.where('[subscriptionId+effectiveDate]').between([subscriptionId, Dexie.minKey], [subscriptionId, Dexie.maxKey]).reverse().toArray(),
    [subscriptionId, key],
  )
}

export function useNotes(subscriptionId?: number) {
  const key = useScopeKey()
  return useLiveQuery(
    () =>
      subscriptionId === undefined
        ? db.cancellationNotes.toArray()
        : db.cancellationNotes.where('subscriptionId').equals(subscriptionId).toArray(),
    [subscriptionId, key],
  )
}

export function useActiveCheck() {
  const key = useScopeKey()
  return useLiveQuery(async () => (await db.renewalChecks.filter((c) => c.completedAt === null).toArray()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null, [key])
}

export function useLatestCompletedCheck() {
  const key = useScopeKey()
  return useLiveQuery(async () => (await db.renewalChecks.filter((c) => c.completedAt !== null).toArray()).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0] ?? null, [key])
}

export function useBillingEvents() {
  const key = useScopeKey()
  return useLiveQuery(() => db.billingEvents.orderBy('occurredAt').reverse().toArray(), [key])
}
