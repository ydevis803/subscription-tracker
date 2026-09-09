import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface Base {
  label: string
  hint?: string
  error?: string
  trailing?: ReactNode
  leading?: ReactNode
}

const base =
  'w-full rounded-2xl border bg-white px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-navy-600 focus:ring-4 focus:ring-navy-600/10'

function Wrap({ label, hint, error, children, htmlFor }: Base & { children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-[13px] font-semibold text-navy-800">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] font-medium text-coral-700" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

export function TextField({ label, hint, error, trailing, leading, className = '', ...rest }: Base & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrap label={label} hint={hint} error={error}>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-muted">{leading}</span>}
        <input
          className={`${base} h-13 ${leading ? 'pl-12' : ''} ${trailing ? 'pr-12' : ''} ${error ? 'border-coral-500' : 'border-line'} ${className}`}
          aria-invalid={!!error}
          {...rest}
        />
        {trailing && <span className="absolute inset-y-0 right-3 flex items-center text-muted">{trailing}</span>}
      </div>
    </Wrap>
  )
}

export function SelectField({ label, hint, error, className = '', children, ...rest }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrap label={label} hint={hint} error={error}>
      <div className="relative">
        <select
          className={`${base} h-13 appearance-none pr-10 ${error ? 'border-coral-500' : 'border-line'} ${className}`}
          aria-invalid={!!error}
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
    </Wrap>
  )
}

export function TextArea({ label, hint, error, className = '', ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrap label={label} hint={hint} error={error}>
      <textarea
        className={`${base} min-h-[96px] py-3 ${error ? 'border-coral-500' : 'border-line'} ${className}`}
        aria-invalid={!!error}
        {...rest}
      />
    </Wrap>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-4 py-2 text-left"
    >
      <span className="flex-1">
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-mint-500' : 'bg-navy-200'}`}>
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`}
        />
      </span>
    </button>
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex rounded-2xl bg-navy-50 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-11 flex-1 rounded-xl text-sm font-semibold transition-colors ${
            value === o.value ? 'bg-white text-navy-900 shadow-sm' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
