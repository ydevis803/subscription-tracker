import { useCallback, useState, type ReactNode } from 'react'
import { Chip } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, EmptyState } from '@/components/ui/Primitives'

/** Remembers a screen's view (search, filters, sort) for the rest of the browser session. */
export function useSessionView<T extends object>(key: string, initial: T): [T, (patch: Partial<T>) => void, () => void] {
  const storageKey = `subscription-tracker.view.${key}`
  const [view, setView] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      return raw ? { ...initial, ...(JSON.parse(raw) as Partial<T>) } : initial
    } catch {
      return initial
    }
  })
  const persist = (next: T) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // session memory is a convenience only
    }
  }
  const patch = useCallback(
    (p: Partial<T>) =>
      setView((v) => {
        const next = { ...v, ...p }
        persist(next)
        return next
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  )
  const reset = useCallback(() => {
    setView(initial)
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  return [view, patch, reset]
}

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">
        <Icon name="search" size={18} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        className="h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-11 text-[1rem] placeholder:text-faint focus:border-navy-600 focus:ring-4 focus:ring-navy-600/10"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute inset-y-0 right-1 my-auto flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-navy-50">
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  )
}

export interface ChipOption<T extends string> {
  value: T
  label: string
  dot?: string
  count?: number
}

/** Single-select (value: T) or multi-select (value: T[]) chip row. */
export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ChipOption<T>[]
  value: T | T[]
  onChange: (next: T | T[]) => void
}) {
  const multi = Array.isArray(value)
  const isOn = (v: T) => (multi ? (value as T[]).includes(v) : value === v)
  const toggle = (v: T) => {
    if (!multi) return onChange(v)
    const list = value as T[]
    onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  }
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1.5 block text-[0.75rem] font-semibold uppercase tracking-wide text-faint">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} selected={isOn(o.value)} onClick={() => toggle(o.value)} className="flex items-center gap-1.5">
            {o.dot && <span className="h-2 w-2 rounded-full" style={{ background: o.dot }} />}
            {o.label}
            {o.count !== undefined && <span className={`text-[0.6875rem] ${isOn(o.value) ? 'text-mint-300' : 'text-faint'}`}>{o.count}</span>}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function SortSelect<T extends string>({ value, onChange, options, label = 'Sort' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} className="h-11 w-full appearance-none rounded-xl border border-line bg-white pl-3 pr-9 text-[0.875rem] font-medium">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}: {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}

/** Toggle for the collapsible filter panel, with the number of active filters. */
export function FilterToggle({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 text-[0.875rem] font-semibold transition-colors ${count > 0 ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-navy-800'}`}
    >
      <Icon name="settings" size={16} />
      Filters
      {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-mint-500 px-1 text-[0.6875rem] font-bold text-navy-900">{count}</span>}
      <Icon name="chevronDown" size={16} className={open ? 'rotate-180' : ''} />
    </button>
  )
}

/** "Showing 3 of 9" plus the one-tap Clear filters action. */
export function ResultsBar({ shown, total, noun, active, onClear, extra }: { shown: number; total: number; noun: string; active: boolean; onClear: () => void; extra?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 px-1">
      <span className="text-[0.8125rem] text-muted">
        {active ? (
          <>
            Showing <span className="font-semibold text-navy-900">{shown}</span> of {total} {noun}
          </>
        ) : (
          <>
            {total} {noun}
          </>
        )}
        {extra}
      </span>
      {active && (
        <button type="button" onClick={onClear} className="flex h-10 items-center gap-1 rounded-full bg-coral-50 px-3 text-[0.8125rem] font-semibold text-coral-700 hover:bg-coral-100">
          <Icon name="x" size={14} /> Clear filters
        </button>
      )}
    </div>
  )
}

/** Empty state for a filtered collection that explains how to get results back. */
export function FilteredEmpty({ query, filters, noun, onClear }: { query: string; filters: string[]; noun: string; onClear: () => void }) {
  const parts: string[] = []
  if (query.trim()) parts.push(`“${query.trim()}”`)
  if (filters.length) parts.push(filters.join(' · '))
  return (
    <Card>
      <EmptyState
        icon="search"
        tone="navy"
        title={`No ${noun} match`}
        body={parts.length ? `Nothing matches ${parts.join(' with ')}. Try a shorter search or fewer filters.` : 'Try a different search or fewer filters.'}
        actionLabel="Clear filters"
        onAction={onClear}
      />
    </Card>
  )
}
