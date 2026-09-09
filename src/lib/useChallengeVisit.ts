import { useEffect } from 'react'
import { markChallengeVisit } from '@/db/repo'
import { useSettings } from '@/hooks/useData'

/** Tell the seven-day challenge that this feature screen was opened. A no-op unless a challenge has started. */
export function useChallengeVisit(key: string): void {
  const settings = useSettings()
  const started = !!settings?.challenge
  useEffect(() => {
    if (!started) return
    void markChallengeVisit(key)
  }, [key, started])
}
