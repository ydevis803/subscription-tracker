import { Link, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '@/components/ui/Icon'

const items: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'list' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/insights', label: 'Insights', icon: 'chart' },
  { to: '/profile', label: 'Profile', icon: 'user' },
]

/** Which destination a path belongs to, so nested screens keep their parent tab lit. */
export function activeTabFor(pathname: string): string {
  if (pathname.startsWith('/subscriptions')) return '/subscriptions'
  if (pathname.startsWith('/total') || pathname.startsWith('/week')) return '/'
  if (pathname.startsWith('/calendar') || pathname.startsWith('/timeline')) return '/calendar'
  if (pathname.startsWith('/insights') || pathname.startsWith('/history')) return '/insights'
  if (pathname.startsWith('/profile') || pathname.startsWith('/settings') || pathname.startsWith('/premium') || pathname.startsWith('/reminders') || pathname.startsWith('/invite') || pathname.startsWith('/legal') || pathname.startsWith('/support') || pathname.startsWith('/account')) return '/profile'
  return '/'
}

/**
 * `activePath` and `static` let the store preview stage the nav inside a phone frame: the lit tab is chosen
 * by the caller and the items render as inert spans instead of router links.
 */
export function BottomNav({ activePath, static: isStatic = false }: { activePath?: string; static?: boolean } = {}) {
  const { pathname } = useLocation()
  const active = activeTabFor(activePath ?? pathname)
  const Item = isStatic ? ('span' as const) : Link
  return (
    <nav className={`${isStatic ? 'absolute' : 'fixed'} inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur safe-bottom`} aria-label="Main">
      <div className={`mx-auto flex max-w-[480px] ${isStatic ? '' : 'sm:border-x sm:border-line'}`}>
        {items.map((it) => {
          const isActive = active === it.to
          return (
            <Item
              key={it.to}
              to={it.to}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold transition-colors active:bg-navy-50 ${
                isActive ? 'text-navy-900' : 'text-faint hover:text-muted'
              }`}
            >
              <span className={`flex h-7 w-11 items-center justify-center rounded-full ${isActive ? 'bg-mint-100 text-mint-700' : ''}`}>
                <Icon name={it.icon} size={22} />
              </span>
              {it.label}
            </Item>
          )
        })}
      </div>
    </nav>
  )
}
