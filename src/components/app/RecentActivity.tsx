import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearActivity, clearAllActivity } from '@/db/repo'
import type { ActivityEntry } from '@/db/schema'
import { useSettings } from '@/hooks/useData'
import { formatRelative, toISO } from '@/lib/dates'
import { Button, IconButton, TextLink } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Card, EmptyState } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'

const ICON: Record<ActivityEntry['kind'], IconName> = { check: 'clock', timeline: 'trend', calendar: 'calendar', total: 'wallet' }

function when(iso: string): string {
  const day = toISO(new Date(iso)) // local calendar day, not the UTC one
  const rel = formatRelative(day)
  if (rel === 'Today') {
    const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`
  }
  return rel.toLowerCase()
}

/**
 * "Pick up where you left off": the most recent saved position that is not the in-progress renewal
 * check (that one already has its own card), plus a history sheet where items can be cleared one by one.
 */
export function ContinueCard() {
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const items = settings?.recentActivity ?? []
  if (!settings || items.length === 0) return null
  const next = items.find((e) => e.status !== 'in-progress') ?? null
  const unfinished = items.filter((e) => e.status === 'in-progress').length

  const clear = async (key: string) => {
    try {
      await clearActivity(key)
      toast.info('Removed from history. Nothing else was deleted.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear')
    }
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Pick up where you left off</p>
          <TextLink icon={null} className="h-8" onClick={() => setOpen(true)}>
            History ({items.length})
          </TextLink>
        </div>
        {next ? (
          <button type="button" onClick={() => navigate(next.path)} className="mt-2 flex w-full items-center gap-3 text-left">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${next.status === 'done' ? 'bg-mint-100 text-mint-700' : 'bg-navy-900 text-mint-400'}`}>
              <Icon name={next.status === 'done' ? 'check' : ICON[next.kind]} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">
                {next.title}
                {next.status === 'done' ? ' · completed' : ''}
              </span>
              <span className="block text-[13px] text-muted">
                {next.subtitle} · {when(next.at)}
              </span>
            </span>
            <span className="flex h-10 items-center gap-1 rounded-full bg-navy-900 px-3 text-[13px] font-semibold text-white">
              {next.status === 'done' ? 'View' : 'Continue'} <Icon name="arrowRight" size={14} />
            </span>
          </button>
        ) : (
          <p className="mt-2 text-[13px] text-muted">
            {unfinished > 0 ? 'Your renewal check is waiting above.' : 'Nothing saved yet.'}
          </p>
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="Recent activity">
        {items.length === 0 ? (
          <EmptyState icon="clock" tone="navy" title="No history yet" body="Positions you return to, like a timeline view or a finished renewal check, show up here." />
        ) : (
          <>
            <p className="text-[13px] text-muted">Clearing an item only removes it from this list. Your subscriptions, checks and notes stay exactly as they are.</p>
            <ul className="mt-3 divide-y divide-line">
              {items.map((e) => (
                <li key={e.key} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${e.status === 'in-progress' ? 'bg-coral-100 text-coral-700' : e.status === 'done' ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-navy-700'}`}>
                    <Icon name={e.status === 'done' ? 'check' : ICON[e.kind]} size={18} />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate(e.path)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-[14px] font-semibold text-ink">
                      {e.title}
                      <span className={`ml-1.5 text-[11px] font-semibold uppercase tracking-wide ${e.status === 'in-progress' ? 'text-coral-700' : e.status === 'done' ? 'text-mint-700' : 'text-faint'}`}>
                        {e.status === 'in-progress' ? 'in progress' : e.status === 'done' ? 'completed' : 'saved view'}
                      </span>
                    </span>
                    <span className="block text-[12px] text-muted">
                      {e.subtitle} · {when(e.at)}
                    </span>
                  </button>
                  <IconButton icon="x" size={16} label={`Clear ${e.title}`} variant="muted" onClick={() => clear(e.key)} />
                </li>
              ))}
            </ul>
            <Button full variant="ghost" className="mt-2 text-coral-700" onClick={() => clearAllActivity().then(() => toast.info('History cleared. Nothing else was deleted.'))}>
              Clear all history
            </Button>
          </>
        )}
      </Sheet>
    </>
  )
}
