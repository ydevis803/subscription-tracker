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
  if (pathname.startsWith('/total')) return '/'
  if (pathname.startsWith('/calendar') || pathname.startsWith('/timeline')) return '/calendar'
  if (pathname.startsWith('/insights') || pathname.startsWith('/history')) return '/insights'
  if (pathname.startsWith('/profile') || pathname.startsWith('/settings') || pathname.startsWith('/premium')) return '/profile'
  return '/'
}

export function BottomNav() {
  const { pathname } = useLocation()
  const active = activeTabFor(pathname)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur safe-bottom" aria-label="Main">
      <div className="mx-auto flex max-w-[480px]">
        {items.map((it) => {
          const isActive = active === it.to
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-navy-900' : 'text-faint hover:text-muted'
              }`}
            >
              <span className={`flex h-7 w-11 items-center justify-center rounded-full ${isActive ? 'bg-mint-100 text-mint-700' : ''}`}>
                <Icon name={it.icon} size={22} />
              </span>
              {it.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
