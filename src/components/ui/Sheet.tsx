import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

let sheetCounter = 0
// A sheet that unmounts and immediately remounts (React StrictMode in development) must reuse its
// history entry instead of popping it, or the remounted sheet closes itself on the resulting popstate.
let pendingBack: { id: number; timer: number } | null = null

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  const entry = useRef<number | null>(null)
  // Callers usually pass an inline arrow; keep the latest one in a ref so the effect below runs once per open.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onClose = () => closeRef.current()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)

    // Push a history entry so the device/browser Back button closes the sheet instead of leaving the page.
    const base = (window.history.state as Record<string, unknown> | null) ?? {}
    let id: number
    if (pendingBack && base.sheet === pendingBack.id) {
      window.clearTimeout(pendingBack.timer)
      id = pendingBack.id
      pendingBack = null
    } else {
      id = ++sheetCounter
      const idx = typeof base.idx === 'number' ? base.idx : 0
      window.history.pushState({ ...base, idx: idx + 1, sheet: id }, '', window.location.href)
    }
    entry.current = id
    const onPop = () => {
      if (entry.current === id) {
        entry.current = null
        onClose()
      }
    }
    window.addEventListener('popstate', onPop)

    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      if (entry.current === id) {
        entry.current = null
        // Closed by a button: drop the entry we pushed, unless navigation already replaced it.
        // Deferred by a tick so an immediate remount can adopt the entry instead.
        if ((window.history.state as { sheet?: unknown } | null)?.sheet === id) {
          const timer = window.setTimeout(() => {
            pendingBack = null
            if ((window.history.state as { sheet?: unknown } | null)?.sheet === id) window.history.back()
          }, 0)
          pendingBack = { id, timer }
        }
      }
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="fade absolute inset-0 bg-navy-950/50" onClick={onClose} aria-label="Close" />
      <div className="sheet-up relative w-full max-w-[480px] rounded-t-3xl bg-surface shadow-float safe-bottom">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-navy-200" />
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          {title ? <h2 className="text-lg font-bold text-navy-900">{title}</h2> : <span />}
          <IconButton icon="x" size={20} label="Close" variant="muted" className="-mr-2" onClick={onClose} />
        </div>
        <div className="max-h-[80dvh] overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  loading,
}: {
  open: boolean
  onClose: () => void
  title: string
  body: string
  confirmLabel: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  loading?: boolean
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-[15px] leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex gap-3">
        <button onClick={onClose} className="h-12 flex-1 rounded-2xl bg-navy-50 font-semibold text-navy-900">
          Keep it
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`h-12 flex-1 rounded-2xl font-semibold text-white disabled:opacity-60 ${tone === 'danger' ? 'bg-coral-500' : 'bg-navy-900'}`}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
