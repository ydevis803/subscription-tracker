import type { HTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { Button } from './Button'

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const hasBg = /\bbg-/.test(className)
  return (
    <div className={`rounded-2xl border border-line shadow-card ${hasBg ? '' : 'bg-surface'} ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between px-1">
      <h2 className="text-[15px] font-bold text-navy-900">{children}</h2>
      {action}
    </div>
  )
}

export function Badge({
  tone = 'navy',
  children,
  className = '',
}: {
  tone?: 'navy' | 'mint' | 'coral' | 'amber' | 'gray'
  children: ReactNode
  className?: string
}) {
  const tones = {
    navy: 'bg-navy-50 text-navy-800',
    mint: 'bg-mint-100 text-mint-700',
    coral: 'bg-coral-100 text-coral-700',
    amber: 'bg-amber-100 text-amber-800',
    gray: 'bg-gray-100 text-gray-600',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${tones[tone]} ${className}`}>{children}</span>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </Card>
      ))}
    </div>
  )
}

export function EmptyState({
  icon = 'sparkle',
  title,
  body,
  actionLabel,
  onAction,
  tone = 'mint',
}: {
  icon?: IconName
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
  tone?: 'mint' | 'navy' | 'coral'
}) {
  const tones = { mint: 'bg-mint-100 text-mint-700', navy: 'bg-navy-50 text-navy-700', coral: 'bg-coral-100 text-coral-700' }
  return (
    <div className="fade flex flex-col items-center px-6 py-10 text-center">
      <span className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${tones[tone]}`}>
        <Icon name={icon} size={28} />
      </span>
      <h3 className="text-lg font-bold text-navy-900">{title}</h3>
      <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-muted">{body}</p>
      {actionLabel && onAction && (
        <Button className="mt-5" variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', body, onRetry }: { title?: string; body: string; onRetry?: () => void }) {
  return (
    <div className="fade flex flex-col items-center px-6 py-10 text-center" role="alert">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-coral-100 text-coral-700">
        <Icon name="alert" size={28} />
      </span>
      <h3 className="text-lg font-bold text-navy-900">{title}</h3>
      <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-muted">{body}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" onClick={onRetry} leading={<Icon name="refresh" size={18} />}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function ServiceMark({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const letters = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const text = letters.length >= 2 ? (letters[0][0] + letters[1][0]).toUpperCase() : (letters[0] ?? '?').slice(0, 2).toUpperCase()
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {text}
    </span>
  )
}

export function Row({
  onClick,
  children,
  className = '',
  chevron = true,
}: {
  onClick?: () => void
  children: ReactNode
  className?: string
  chevron?: boolean
}) {
  const Comp: 'button' | 'div' = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors ${onClick ? 'active:bg-navy-50' : ''} ${className}`}
    >
      {children}
      {onClick && chevron && <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />}
    </Comp>
  )
}

export function Divider() {
  return <div className="h-px bg-line" />
}

export function ProgressBar({ value, max, tone = 'mint' }: { value: number; max: number; tone?: 'mint' | 'coral' | 'navy' }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  const colors = { mint: 'bg-mint-500', coral: 'bg-coral-500', navy: 'bg-navy-600' }
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-50" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
