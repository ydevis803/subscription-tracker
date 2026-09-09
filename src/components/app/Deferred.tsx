import { useEffect, useState, type ReactNode } from 'react'

/**
 * Renders a placeholder for the first paint and mounts the real content once the browser is idle, so the
 * top of Home (total, next charges, today's action) is on screen before heavier cards are computed.
 * The placeholder must match the final card's size so nothing jumps when it swaps in.
 */
export function Deferred({ placeholder, children }: { placeholder: ReactNode; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 300 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => setReady(true), 32)
    return () => window.clearTimeout(t)
  }, [])
  return <>{ready ? children : placeholder}</>
}
