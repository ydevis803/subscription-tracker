import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'

export function AppShell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <main className={`mx-auto min-h-dvh w-full max-w-[480px] sm:border-x sm:border-line sm:bg-canvas ${nav ? 'pb-28' : 'pb-10'}`}>{children}</main>
      {nav && <BottomNav />}
    </div>
  )
}

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rise px-4 ${className}`}>{children}</div>
}
