import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GUEST_DB_NAME, SubscriptionTrackerDB, deleteScope, openScope } from '@/db/schema'
import { ensureInitialized, mergeSnapshot, replaceWithSnapshot, resetAllData, type Snapshot } from '@/db/repo'
import { api, ApiError, type AccountUser } from './api'
import { pullFromServer, pushToServer, resetSyncMemory, startAutoSync, type SyncState } from '@/sync/sync'

const USER_CACHE = 'subscription-tracker.account'

export type AuthStatus = 'loading' | 'guest' | 'signed-in'

export interface PendingMerge {
  /** Guest data found on this device when an existing account signed in. */
  guest: Snapshot
  count: number
}

interface AuthApi {
  status: AuthStatus
  user: AccountUser | null
  /** Changes whenever the active database changes; hooks use it to re-subscribe. */
  scopeKey: string
  sync: SyncState
  pendingMerge: PendingMerge | null
  signUp: (input: { email: string; password: string; name: string }) => Promise<void>
  signIn: (input: { email: string; password: string }) => Promise<void>
  resolveMerge: (keep: boolean) => Promise<void>
  signOut: () => Promise<void>
  updateName: (name: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  /** Permanently deletes the account and every record it owns, on the server and on this device. */
  deleteAccount: (password: string) => Promise<void>
  requestReset: (email: string) => Promise<void>
  resetPassword: (token: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthApi | null>(null)

function readCachedUser(): AccountUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE)
    return raw ? (JSON.parse(raw) as AccountUser) : null
  } catch {
    return null
  }
}
function cacheUser(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(USER_CACHE, JSON.stringify(user))
    else localStorage.removeItem(USER_CACHE)
  } catch {
    // ignore
  }
}

/** Read the guest database without changing the active scope. */
async function readGuestSnapshot(): Promise<Snapshot> {
  const guest = new SubscriptionTrackerDB(GUEST_DB_NAME)
  try {
    const [subscriptions, priceChanges, cancellationNotes, profile, settings, billingEvents] = await Promise.all([
      guest.subscriptions.toArray(),
      guest.priceChanges.toArray(),
      guest.cancellationNotes.toArray(),
      guest.profile.get(1),
      guest.settings.get(1),
      guest.billingEvents.toArray(),
    ])
    return { subscriptions, priceChanges, cancellationNotes, profile, settings, billingEvents }
  } finally {
    guest.close()
  }
}

async function clearGuestDatabase(): Promise<void> {
  const guest = new SubscriptionTrackerDB(GUEST_DB_NAME)
  try {
    await guest.transaction('rw', [guest.subscriptions, guest.priceChanges, guest.cancellationNotes, guest.profile, guest.settings, guest.billingEvents], async () => {
      await Promise.all([guest.subscriptions.clear(), guest.priceChanges.clear(), guest.cancellationNotes.clear(), guest.profile.clear(), guest.settings.clear(), guest.billingEvents.clear()])
    })
  } finally {
    guest.close()
  }
  try {
    localStorage.removeItem('subscription-tracker.onboarding-draft')
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AccountUser | null>(null)
  const [scopeKey, setScopeKey] = useState('guest')
  const [sync, setSync] = useState<SyncState>({ status: 'idle', at: null })
  const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null)
  const stopSync = useRef<() => void>(() => undefined)

  const enterScope = useCallback(async (next: AccountUser | null) => {
    stopSync.current()
    resetSyncMemory()
    openScope(next ? next.id : null)
    await ensureInitialized()
    setUser(next)
    cacheUser(next)
    setStatus(next ? 'signed-in' : 'guest')
    setScopeKey(next ? `user-${next.id}-${Date.now()}` : `guest-${Date.now()}`)
    if (next) stopSync.current = startAutoSync(setSync)
    else setSync({ status: 'idle', at: null })
  }, [])

  // Resolve the session on load. A network failure with a cached account keeps that account usable offline.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = readCachedUser()
      try {
        const { user: me } = await api.me()
        if (cancelled) return
        openScope(me.id)
        await ensureInitialized()
        try {
          await pullFromServer()
        } catch {
          // keep local copy
        }
        await enterScope(me)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 401) {
          if (cached) await deleteScope(cached.id).catch(() => undefined)
          await enterScope(null)
        } else if (cached) {
          await enterScope(cached)
          setSync({ status: 'offline', at: null })
        } else {
          await enterScope(null)
        }
      }
    })()
    return () => {
      cancelled = true
      stopSync.current()
    }
  }, [enterScope])

  const signUp = useCallback(
    async (input: { email: string; password: string; name: string }) => {
      const guest = await readGuestSnapshot()
      const { user: created } = await api.signUp(input)
      openScope(created.id)
      await ensureInitialized()
      // A brand-new account takes over whatever this device was tracking as a guest.
      const hasGuestData = guest.subscriptions.length > 0 || guest.profile?.onboardingComplete
      if (hasGuestData) {
        await replaceWithSnapshot({ ...guest, profile: guest.profile ? { ...guest.profile, name: guest.profile.name || input.name } : undefined })
      } else {
        const { updateProfile } = await import('@/db/repo')
        await updateProfile({ name: input.name })
      }
      resetSyncMemory()
      await pushToServer().catch(() => undefined)
      await clearGuestDatabase()
      await enterScope(created)
    },
    [enterScope],
  )

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const guest = await readGuestSnapshot()
      const { user: account } = await api.signIn(input)
      openScope(account.id)
      await ensureInitialized()
      resetSyncMemory()
      const hadServerData = await pullFromServer()
      if (guest.subscriptions.length > 0) {
        if (!hadServerData) {
          // First sign-in on the only device that has data: just adopt it.
          await replaceWithSnapshot({ ...guest, profile: guest.profile ? { ...guest.profile, name: guest.profile.name || account.name } : undefined })
          await pushToServer().catch(() => undefined)
          await clearGuestDatabase()
          await enterScope(account)
        } else {
          setPendingMerge({ guest, count: guest.subscriptions.length })
          setUser(account)
          cacheUser(account)
        }
        return
      }
      await clearGuestDatabase()
      await enterScope(account)
    },
    [enterScope],
  )

  const resolveMerge = useCallback(
    async (keep: boolean) => {
      if (!pendingMerge || !user) return
      if (keep) {
        await mergeSnapshot(pendingMerge.guest)
        await pushToServer().catch(() => undefined)
      }
      await clearGuestDatabase()
      setPendingMerge(null)
      await enterScope(user)
    },
    [pendingMerge, user, enterScope],
  )

  const signOut = useCallback(async () => {
    const current = user
    stopSync.current()
    try {
      await pushToServer()
    } catch {
      // best effort
    }
    try {
      await api.signOut()
    } catch {
      // the local session is removed regardless
    }
    if (current) await deleteScope(current.id).catch(() => undefined)
    openScope(null)
    await resetAllData().catch(() => undefined)
    await enterScope(null)
  }, [user, enterScope])

  const updateName = useCallback(async (name: string) => {
    const { user: updated } = await api.updateName(name)
    setUser(updated)
    cacheUser(updated)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.changePassword(currentPassword, newPassword)
  }, [])

  const deleteAccount = useCallback(
    async (password: string) => {
      const current = user
      stopSync.current()
      await api.deleteAccount(password)
      if (current) await deleteScope(current.id).catch(() => undefined)
      openScope(null)
      await resetAllData().catch(() => undefined)
      await enterScope(null)
    },
    [user, enterScope],
  )

  const requestReset = useCallback(async (email: string) => {
    await api.forgot(email)
  }, [])

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      const { user: account } = await api.reset(token, password)
      openScope(account.id)
      await ensureInitialized()
      resetSyncMemory()
      await pullFromServer().catch(() => undefined)
      await clearGuestDatabase()
      await enterScope(account)
    },
    [enterScope],
  )

  const value = useMemo<AuthApi>(
    () => ({ status, user, scopeKey, sync, pendingMerge, signUp, signIn, resolveMerge, signOut, updateName, changePassword, deleteAccount, requestReset, resetPassword }),
    [status, user, scopeKey, sync, pendingMerge, signUp, signIn, resolveMerge, signOut, updateName, changePassword, deleteAccount, requestReset, resetPassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function useScopeKey(): string {
  return useContext(AuthContext)?.scopeKey ?? 'guest'
}
