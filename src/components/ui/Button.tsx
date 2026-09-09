import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'mint' | 'coral' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg' | 'sm'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  full?: boolean
  leading?: ReactNode
}

const variantClass: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 disabled:bg-navy-200',
  mint: 'bg-mint-500 text-navy-900 hover:bg-mint-400 active:bg-mint-600 disabled:bg-mint-100 disabled:text-muted',
  coral: 'bg-coral-500 text-navy-900 hover:bg-coral-400 active:bg-coral-600 disabled:bg-coral-100 disabled:text-muted',
  secondary: 'bg-navy-50 text-navy-900 hover:bg-navy-100 active:bg-navy-200 disabled:text-faint',
  ghost: 'bg-transparent text-navy-900 hover:bg-navy-50 active:bg-navy-100 disabled:text-faint',
  danger: 'bg-coral-50 text-coral-700 hover:bg-coral-100 active:bg-coral-100 disabled:text-faint',
}
const sizeClass: Record<Size, string> = {
  sm: 'h-11 px-4 text-sm rounded-xl',
  md: 'h-12 px-5 text-[0.9375rem] rounded-2xl',
  lg: 'h-14 px-6 text-base rounded-2xl',
}

export function Button({ variant = 'primary', size = 'md', loading, full, leading, className = '', children, disabled, ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors select-none disabled:cursor-not-allowed ${variantClass[variant]} ${sizeClass[size]} ${full ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : leading}
      {children}
    </button>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

type IconButtonVariant = 'ghost' | 'muted' | 'primary' | 'light'
const iconVariant: Record<IconButtonVariant, string> = {
  ghost: 'text-navy-900 hover:bg-navy-50 active:bg-navy-100',
  muted: 'text-muted hover:bg-navy-50 active:bg-navy-100',
  primary: 'bg-navy-900 text-white shadow-float hover:bg-navy-800 active:bg-navy-950',
  light: 'bg-white/10 text-white hover:bg-white/15 active:bg-white/20',
}

/** Round 44px tap target for a single icon. Always pass an accessible label. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 22,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: IconButtonVariant; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${iconVariant[variant]} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
      {children}
    </button>
  )
}

/** Small inline action used in section titles and card footers. */
export function TextLink({
  children,
  icon = 'chevronRight',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName | null }) {
  return (
    <button type="button" className={`flex min-h-11 items-center gap-1 text-[0.8125rem] font-semibold text-navy-700 hover:text-navy-900 ${className}`} {...rest}>
      {icon === 'plus' && <Icon name="plus" size={16} />}
      {children}
      {icon === 'chevronRight' && <Icon name="chevronRight" size={16} />}
    </button>
  )
}

/** Selectable filter pill. */
export function Chip({ selected, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`h-11 rounded-full px-3.5 text-[0.8125rem] font-semibold transition-colors ${
        selected ? 'bg-navy-900 text-white active:bg-navy-800' : 'border border-line bg-white text-muted hover:bg-navy-50 active:bg-navy-100'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Floating primary action, sits above the bottom navigation. */
export function Fab({ icon = 'plus', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-40">
      <div className="mx-auto flex max-w-[480px] justify-end px-4">
        <button
          type="button"
          className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-navy-900 pl-4 pr-5 text-[0.9375rem] font-semibold text-white shadow-float transition-colors hover:bg-navy-800 active:bg-navy-950"
          {...rest}
        >
          <Icon name={icon} size={22} />
          {children}
        </button>
      </div>
    </div>
  )
}
