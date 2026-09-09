/**
 * Turn any thrown value into a message that says what happened and what to do next.
 * Typed input is never cleared by callers on failure, so the message can promise that.
 */
export function describeError(e: unknown, action: string): string {
  const name = e instanceof Error ? e.name : ''
  const message = e instanceof Error ? e.message : ''
  if (name === 'OfflineError') return `You appear to be offline, so we could not ${action}. Your entries are kept. Try again once you are connected.`
  if (name === 'ApiError') return message || `We could not ${action}. Please try again.`
  if (name === 'PlanLimitError') return message
  if (name === 'QuotaExceededError' || /quota/i.test(message)) return `Your browser's storage is full, so we could not ${action}. Free some space or export a backup, then try again.`
  if (name === 'VersionError' || /version/i.test(message)) return `Another tab is using an older version of the app, so we could not ${action}. Close other tabs and try again.`
  if (name === 'InvalidStateError' || /closed|blocked/i.test(message)) return `Local storage was unavailable for a moment, so we could not ${action}. Your entries are kept. Try again.`
  return `We could not ${action}${message ? ` (${message})` : ''}. Your entries are kept, so you can try again.`
}
