import { liveQuery } from 'dexie'
import { apiUrl } from '@/lib/apiBase'
import { db } from '@/db/schema'
import { readSnapshot, replaceWithSnapshot, type Snapshot } from '@/db/repo'
import { api } from '@/auth/api'

let lastSynced = ''

/** The server validator for the copy we last pulled or pushed, per local database. */
const tagKey = () => `subscription-tracker.pull-tag:${db.name}`
function readTag(): string | null {
  try {
    return localStorage.getItem(tagKey())
  } catch {
    return null
  }
}
function writeTag(tag: string | null) {
  try {
    if (tag) localStorage.setItem(tagKey(), tag)
    else localStorage.removeItem(tagKey())
  } catch {
    // ignore
  }
}

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
  const local = await readSnapshot()
  const localHasData = local.subscriptions.length > 0 || !!local.profile?.onboardingComplete
  // Only ask for "unchanged?" when we actually hold a copy; an empty database must always download.
  const result = await api.pull(localHasData ? readTag() : null)
  if (result.unchanged) {
    // Server and local agree, so the first auto-sync tick has nothing to push either.
    lastSynced = JSON.stringify(local)
    return true
  }
  const { snapshot } = result
  if (!snapshot) return false
  const remote = snapshot as Snapshot
  if (localHasData && newestChange(local) > newestChange(remote)) {
    lastSynced = ''
    await pushToServer().catch(() => undefined)
    return true
  }
  await replaceWithSnapshot(remote)
  lastSynced = JSON.stringify(remote)
  writeTag(result.etag)
  return true
}

export async function pushToServer(): Promise<string> {
  const snap = await readSnapshot()
  const serialized = JSON.stringify(snap)
  if (serialized === lastSynced) return ''
  const { updatedAt } = await api.push(snap)
  lastSynced = serialized
  writeTag(updatedAt ? `"${updatedAt}"` : null)
  return updatedAt
}

export type SyncState = { status: 'idle' | 'syncing' | 'synced' | 'offline' | 'error'; at: string | null; message?: string }

/** Set by startAutoSync so the offline banner can push a pending backup on demand. */
let pushNow: (() => Promise<void>) | null = null

/** Push whatever is pending right now (no-op when auto-sync is not running). Resolves once the attempt is over. */
export async function retrySync(): Promise<void> {
  if (pushNow) await pushNow()
}

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
        navigator.sendBeacon(apiUrl('/api/data'), body)
      })
      .catch(() => undefined)
  }
  window.addEventListener('pagehide', flush)
  const attempt = async () => {
    dirty = false
    if (stopped) return
    try {
      onState({ status: 'syncing', at: null })
      const at = await pushToServer()
      onState({ status: 'synced', at: at || new Date().toISOString() })
    } catch (e) {
      // The change stays in IndexedDB and lastSynced is untouched, so the next attempt sends it again.
      dirty = true
      const offline = e instanceof Error && e.name === 'OfflineError'
      onState({ status: offline ? 'offline' : 'error', at: null, message: e instanceof Error ? e.message : 'Sync failed' })
    }
  }
  pushNow = async () => {
    window.clearTimeout(timer)
    await attempt()
  }
  // When the browser regains a connection, send anything that failed while it was away.
  const onOnline = () => {
    if (dirty && !stopped) void attempt()
  }
  window.addEventListener('online', onOnline)
  const sub = observable.subscribe({
    next: () => {
      if (stopped) return
      dirty = true
      window.clearTimeout(timer)
      timer = window.setTimeout(attempt, 1200)
    },
    error: () => undefined,
  })
  return () => {
    flush()
    stopped = true
    pushNow = null
    window.clearTimeout(timer)
    window.removeEventListener('pagehide', flush)
    window.removeEventListener('online', onOnline)
    sub.unsubscribe()
  }
}

export function resetSyncMemory() {
  lastSynced = ''
  writeTag(null)
}
