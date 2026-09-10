import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/apiBase'

/**
 * Connectivity as the app experiences it: the browser's own online flag, plus whether the last request to
 * our server actually got through. `api.ts` reports each failure and success here.
 */
type Listener = (online: boolean) => void
const listeners = new Set<Listener>()
let serverReachable = true

function notify() {
  const online = isOnline()
  for (const l of listeners) l(online)
}

export function isOnline(): boolean {
  return (typeof navigator === 'undefined' || navigator.onLine) && serverReachable
}

/** Called by the API layer: a request failed at the network level. */
export function reportOffline(): void {
  if (!serverReachable) return
  serverReachable = false
  notify()
}

/** Called by the API layer: a request reached the server (any HTTP status counts). */
export function reportOnline(): void {
  if (serverReachable) return
  serverReachable = true
  notify()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
}

/** Ask the server for anything cheap. Resolves true when it answers, false when the network is down. */
export async function probeConnection(): Promise<boolean> {
  try {
    const res = await fetch(apiUrl('/api/auth/me'), { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
    await res.arrayBuffer().catch(() => undefined)
    reportOnline()
    return true
  } catch {
    reportOffline()
    return false
  }
}

export function useConnectivity(): boolean {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => {
    listeners.add(setOnline)
    setOnline(isOnline())
    return () => {
      listeners.delete(setOnline)
    }
  }, [])
  return online
}
