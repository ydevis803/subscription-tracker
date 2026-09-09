import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}
interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter.current
    setItems((list) => [...list, { id, kind, message }])
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3200)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 safe-top" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`rise pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-float ${
              t.kind === 'success'
                ? 'bg-navy-900 text-white'
                : t.kind === 'error'
                  ? 'bg-coral-500 text-white'
                  : 'bg-white text-ink border border-line'
            }`}
            role="status"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                t.kind === 'success' ? 'bg-mint-500 text-navy-900' : t.kind === 'error' ? 'bg-white/20' : 'bg-navy-50 text-navy-700'
              }`}
            >
              <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={16} />
            </span>
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
