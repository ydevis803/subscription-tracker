import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { recordVisit, startCheck } from '@/db/repo'
import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { useScopeKey } from '@/auth/AuthContext'
import { dailyReward, nextAction, sinceLastVisit, weekDots, winsToday } from '@/lib/daily'
import { formatDate, todayISO } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'
import { StreakRow } from './StreakRow'

const toneBox = { coral: 'bg-coral-100 text-coral-700', mint: 'bg-mint-100 text-mint-700', navy: 'bg-navy-50 text-navy-700' } as const

/** The daily loop: one next action, visible progress, a small fresh reward, and a kind word after a gap. */
export function TodayCard({
  subs,
  notes,
  changes,
  settings,
  active,
  latest,
  currency,
}: {
  subs: Subscription[]
  notes: CancellationNote[]
  changes: PriceChange[]
  settings: Settings
  active: RenewalCheck | null
  latest: RenewalCheck | null
  currency: string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const key = useScopeKey()
  const checks = useLiveQuery(() => db.renewalChecks.toArray(), [key]) ?? []
  const [previousVisit, setPreviousVisit] = useState<string | null | undefined>(undefined)
  const [starting, setStarting] = useState(false)

  // Record today's visit once per scope; remember the previous visit for the welcome-back line.
  useEffect(() => {
    let cancelled = false
    recordVisit()
      .then((prev) => !cancelled && setPreviousVisit(prev))
      .catch(() => !cancelled && setPreviousVisit(null))
    return () => {
      cancelled = true
    }
  }, [key])

  const lead = settings.defaultReminderDays
  const action = useMemo(() => nextAction({ subs, notes, active, latest, lead }), [subs, notes, active, latest, lead])
  const dots = useMemo(() => weekDots(settings.checkIns ?? [], settings.weekStartsOn), [settings.checkIns, settings.weekStartsOn])
  const wins = useMemo(() => winsToday({ notes, checks, subs }), [notes, checks, subs])
  const away = useMemo(() => sinceLastVisit({ lastVisit: previousVisit ?? null, subs, notes, changes }), [previousVisit, subs, notes, changes])
  const reward = useMemo(
    () => dailyReward({ subs, notes, changes, checkIns: settings.checkIns ?? [], currency, limit: settings.monthlyBudget ?? null, lead }),
    [subs, notes, changes, settings.checkIns, currency, settings.monthlyBudget, lead],
  )
  const weekCount = dots.filter((d) => d.checked).length

  const go = async () => {
    if (action.kind === 'start-check' || action.kind === 'confirm-renewal') {
      setStarting(true)
      try {
        await startCheck()
        navigate('/check')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not start the check')
        setStarting(false)
      }
      return
    }
    navigate(action.path)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4">
        <p className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-wide text-faint">Today · {formatDate(todayISO(), 'EEE d MMM')}</p>
        <div className="flex shrink-0 items-center gap-2" aria-label={`Checked in ${weekCount} of 7 days this week`}>
          <span className="flex gap-1">
            {dots.map((d) => (
              <span
                key={d.day}
                title={formatDate(d.day, 'EEE d')}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  d.checked ? 'bg-mint-500 text-navy-900' : d.isToday ? 'border-2 border-mint-500 text-mint-700' : d.future ? 'bg-navy-50 text-faint' : 'border border-navy-100 text-faint'
                }`}
              >
                {d.label}
              </span>
            ))}
          </span>
          <span className="text-[12px] font-semibold text-muted">{weekCount}/7</span>
        </div>
      </div>

      {away.text && (
        <p className={`mx-4 mt-3 rounded-xl px-3 py-2 text-[13px] leading-snug ${away.tone === 'coral' ? 'bg-coral-50 text-coral-700' : 'bg-mint-50 text-mint-700'}`}>{away.text}</p>
      )}

      <div className="mt-3 flex items-start gap-3 px-4">
        <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneBox[action.tone]}`}>
          <Icon name={action.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Next up</p>
          <p className="text-[16px] font-bold leading-tight text-navy-900">{action.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{action.body}</p>
        </div>
      </div>
      <div className="px-4 pt-3">
        <Button full variant={action.tone === 'coral' ? 'coral' : 'mint'} loading={starting} onClick={go} leading={<Icon name="arrowRight" size={18} />}>
          {action.cta}
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px]">
        <span className="flex items-center gap-1.5 text-muted">
          <Icon name="check" size={14} className={wins > 0 ? 'text-mint-700' : 'text-faint'} />
          {wins === 0 ? 'First win of the day is one tap away' : `${wins} ${wins === 1 ? 'win' : 'wins'} today`}
        </span>
      </div>

      <StreakRow subs={subs} notes={notes} changes={changes} checks={checks} settings={settings} />

      {reward && (
        <button type="button" onClick={() => reward.path && navigate(reward.path)} className={`flex w-full items-start gap-3 border-t border-line px-4 py-3 text-left ${reward.path ? 'active:bg-navy-50' : ''}`}>
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneBox[reward.tone]}`}>
            <Icon name={reward.icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-faint">Fresh today · {reward.label}</span>
            <span className="block text-[13px] leading-snug text-ink">{reward.text}</span>
          </span>
          {reward.path && <Icon name="chevronRight" size={16} className="mt-2 shrink-0 text-faint" />}
        </button>
      )}
    </Card>
  )
}
