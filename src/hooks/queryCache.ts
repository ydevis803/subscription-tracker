/**
 * Last known result of each data hook, keyed by hook and scope. A screen that was visited before paints
 * with this immediately while the live query re-reads IndexedDB, so repeated navigation never flashes a
 * skeleton. Cleared whenever the database scope changes or is erased.
 */
const cache = new Map<string, unknown>()

export function readCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined
}

export function writeCached(key: string, value: unknown): void {
  cache.set(key, value)
}

export function clearQueryCache(): void {
  cache.clear()
}
