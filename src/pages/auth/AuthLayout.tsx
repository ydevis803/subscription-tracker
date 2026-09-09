import { useId } from 'react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Primitives'

export function AuthLayout({ title, subtitle, backTo = '/', children, footer }: { title: string; subtitle?: string; backTo?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[480px] pb-10">
        <PageHeader title={title} back backTo={backTo} />
        <Page className="space-y-4">
          {subtitle && <p className="px-1 text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>}
          <Card className="p-4">{children}</Card>
          {footer}
        </Page>
      </div>
    </div>
  )
}

export function PasswordField({
  label,
  value,
  onChange,
  error,
  show,
  onToggle,
  autoComplete,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  show: boolean
  onToggle: () => void
  autoComplete: string
  hint?: string
}) {
  const id = useId()
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8125rem] font-semibold text-navy-800">{label}</span>
      <span className="relative block">
        <input
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={`h-13 w-full rounded-2xl border bg-white pl-4 pr-20 text-[1rem] focus:border-navy-600 focus:ring-4 focus:ring-navy-600/10 ${error ? 'border-coral-500' : 'border-line'}`}
        />
        <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute inset-y-0 right-1 my-auto h-11 rounded-xl px-3 text-[0.8125rem] font-semibold text-navy-700 hover:bg-navy-50">
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-[0.8125rem] font-medium text-coral-700" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-1.5 block text-[0.8125rem] text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useNextPath(): string {
  const params = new URLSearchParams(window.location.search)
  const next = params.get('next') ?? '/'
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
