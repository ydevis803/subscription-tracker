import { liveQuery } from 'dexie'
import { db } from '@/db/schema'
import { readSnapshot, replaceWithSnapshot, type Snapshot } from '@/db/repo'
import { api } from '@/auth/api'

let lastSynced = ''

/** Newest change timestamp anywhere in a snapshot, used to decide which side is ahead. */
function newestChange(snap: Snapshot): string {
  let max = ''
  const bump = (v?: string | null) => {
    if (v && v > max) max = v
  }
  bump(snap.profile?.updatedAt)
  bump(snap.settings?.updatedAt)
  for (const s of snap.subscriptions ?? []) bump(s.updatedAt)
  for (const p of snap.priceChanges ?? []) bump(p.updatedAt ?? p.createdAt)
  for (const n of snap.cancellationNotes ?? []) bump(n.updatedAt)
  for (const c of snap.renewalChecks ?? []) bump(c.updatedAt)
  return max
}

/**
 * Pull the account snapshot from the server into the active database. Returns false when the account has
 * no data yet. If the local copy has changes newer than the server (a reload before the debounced push
 * landed), the local copy wins and is pushed instead, so nothing the user just did is silently undone.
 */
export async function pullFromServer(): Promise<boolean> {
  const { snapshot } = await api.pull()
  if (!snapshot) return false
  const remote = snapshot as Snapshot
  const local = await readSnapshot()
  const localHasData = local.subscriptions.length > 0 || !!local.profile?.onboardingComplete
  if (localHasData && newestChange(local) > newestChange(remote)) {
    lastSynced = ''
    await pushToServer().catch(() => undefined)
    return true
  }
  await replaceWithSnapshot(remote)
  lastSynced = JSON.stringify(remote)
  return true
}

export async function pushToServer(): Promise<string> {
  const snap = await readSnapshot()
  const serialized = JSON.stringify(snap)
  if (serialized === lastSynced) return ''
  const { updatedAt } = await api.push(snap)
  lastSynced = serialized
  return updatedAt
}

export type SyncState = { status: 'idle' | 'syncing' | 'synced' | 'offline' | 'error'; at: string | null; message?: string }

/** Watches every table and pushes a debounced snapshot after each change. Returns an unsubscribe function. */
export function startAutoSync(onState: (s: SyncState) => void): () => void {
  let timer: number | undefined
  let stopped = false
  const observable = liveQuery(() =>
    Promise.all([db.subscriptions.toArray(), db.priceChanges.toArray(), db.cancellationNotes.toArray(), db.profile.get(1), db.settings.get(1), db.billingEvents.toArray(), db.renewalChecks.toArray()]),
  )
  // If the page is closed while a push is still debounced, send it with a beacon so nothing is lost.
  let dirty = false
  const flush = () => {
    if (!dirty || stopped) return
    dirty = false
    window.clearTimeout(timer)
    readSnapshot()
      .then((snap) => {
        const body = new Blob([JSON.stringify({ snapshot: snap })], { type: 'application/json' })
        navigator.sendBeacon('/api/data', body)
      })
      .catch(() => undefined)
  }
  window.addEventListener('pagehide', flush)
  const sub = observable.subscribe({
    next: () => {
      if (stopped) return
      dirty = true
      window.clearTimeout(timer)
      timer = window.setTimeout(async () => {
        dirty = false
        if (stopped) return
        try {
          onState({ status: 'syncing', at: null })
          const at = await pushToServer()
          onState({ status: 'synced', at: at || new Date().toISOString() })
        } catch (e) {
          const offline = e instanceof Error && e.name === 'OfflineError'
          onState({ status: offline ? 'offline' : 'error', at: null, message: e instanceof Error ? e.message : 'Sync failed' })
        }
      }, 1200)
    },
    error: () => undefined,
  })
  return () => {
    flush()
    stopped = true
    window.clearTimeout(timer)
    window.removeEventListener('pagehide', flush)
    sub.unsubscribe()
  }
}

export function resetSyncMemory() {
  lastSynced = ''
}
