import type { ReactNode } from 'react'
import { IconButton } from '@/components/ui/Button'
import { useSmartBack } from '@/lib/navigation'

export function PageHeader({
  title,
  subtitle,
  back,
  backTo,
  right,
  large,
}: {
  title: string
  subtitle?: string
  back?: boolean
  backTo?: string
  right?: ReactNode
  large?: boolean
}) {
  const goBack = useSmartBack()
  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur safe-top">
      <div className="mx-auto flex max-w-[480px] items-center gap-2 px-4 pt-3 pb-2">
        {back && (
          <IconButton icon="chevronLeft" size={24} label="Back" className="-ml-2" onClick={() => goBack(backTo ?? '/')} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className={`break-words font-bold leading-tight text-navy-900 ${large ? 'text-[1.625rem]' : 'text-lg'}`}>{title}</h1>
          {subtitle && <p className="break-words text-[0.8125rem] text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}
