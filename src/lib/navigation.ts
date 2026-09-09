import { useCallback } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'

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
      if (historyIndex() >= steps) navigate(-steps)
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
