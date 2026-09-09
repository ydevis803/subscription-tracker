import { useCallback } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'

/**
 * Browsers cap a tab's history (Chrome: 50 entries). At the cap, pushState no longer creates a real entry,
 * so history.go(-n) can walk straight out of the app into an earlier site. We notice the cap by watching
 * whether history.length grows on PUSH navigations and, while capped, use plain navigation instead of go().
 */
const CAP_KEY = 'subscription-tracker.history-capped'
let lastLength = typeof window === 'undefined' ? 0 : window.history.length

export function noteNavigation(type: 'PUSH' | 'POP' | 'REPLACE'): void {
  const len = window.history.length
  if (type === 'PUSH' && len <= lastLength) {
    try {
      sessionStorage.setItem(CAP_KEY, '1')
    } catch {
      // ignore
    }
  }
  lastLength = len
}

/** True when a push in this tab failed to add a history entry (the tab is at the browser's history cap). */
export function isHistoryCapped(): boolean {
  try {
    return sessionStorage.getItem(CAP_KEY) === '1'
  } catch {
    return false
  }
}

/** Push a history entry and report whether the browser really added one. */
export function pushEntry(state: unknown, url?: string): boolean {
  const before = window.history.length
  window.history.pushState(state, '', url ?? window.location.href)
  const added = window.history.length > before
  if (!added) {
    try {
      sessionStorage.setItem(CAP_KEY, '1')
    } catch {
      // ignore
    }
  }
  return added
}

/** Position of the current entry in this tab's in-app history (react-router keeps it in history.state). */
export function historyIndex(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : 0
}

/**
 * Back that keeps context: steps back through real history when the user arrived from inside the app,
 * and falls back to a sensible parent route only when the page was opened directly (deep link, refresh).
 */
export function useSmartBack() {
  const navigate = useNavigate()
  return useCallback(
    (fallback: string, steps = 1) => {
      if (historyIndex() >= steps && !isHistoryCapped()) navigate(-steps)
      else navigate(fallback, { replace: true })
    },
    [navigate],
  )
}

/** Navigate away while a bottom sheet is open without leaving the sheet's history entry behind. */
export function leaveSheet(navigate: NavigateFunction, path: string) {
  const inSheet = !!(window.history.state as { sheet?: unknown } | null)?.sheet
  navigate(path, { replace: inSheet })
}
