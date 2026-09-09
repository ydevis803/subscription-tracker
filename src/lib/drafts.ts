import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'subscription-tracker.draft:'
/** Drafts older than this are dropped rather than restored. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface Stored<T> {
  at: string
  value: T
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored<T>
    if (!parsed || typeof parsed.at !== 'string' || Date.now() - new Date(parsed.at).getTime() > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

export function writeDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: new Date().toISOString(), value } satisfies Stored<T>))
  } catch {
    // Storage full or blocked: the in-memory state still holds the draft for this session.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/**
 * Form state that survives a refresh, a lost connection or an accidental Back. Every change is written to
 * localStorage (never passwords: callers keep those out of the draft), restored on the next mount, and
 * cleared by the caller once the save succeeds.
 *
 * Returns the state, a setter, whether a draft was restored, and helpers to clear or discard it.
 */
export function useDraft<T extends object>(key: string | null, initial: T, isMeaningful: (v: T) => boolean = () => true) {
  const [restored, setRestored] = useState(false)
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial
    const saved = readDraft<T>(key)
    if (saved && isMeaningful(saved)) return { ...initial, ...saved }
    return initial
  })
  const restoredKey = useRef<string | null>(null)
  // Restore when the key is known (it can arrive late, e.g. once the record being edited has loaded).
  useEffect(() => {
    if (!key || restoredKey.current === key) return
    restoredKey.current = key
    const saved = readDraft<T>(key)
    if (saved && isMeaningful(saved)) {
      setValue((v) => ({ ...v, ...saved }))
      setRestored(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const writtenKey = useRef<string | null>(null)
  useEffect(() => {
    if (!key) return
    if (writtenKey.current !== key) {
      writtenKey.current = key // the first value under a key is the initial one; only later edits are drafts
      return
    }
    const t = window.setTimeout(() => {
      if (isMeaningful(value)) writeDraft(key, value)
      else clearDraft(key)
    }, 200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value])

  const clear = useCallback(() => {
    if (key) clearDraft(key)
    setRestored(false)
  }, [key])

  const discard = useCallback(() => {
    if (key) clearDraft(key)
    setRestored(false)
    setValue(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { value, setValue, restored, clear, discard }
}
