import { useEffect, useMemo, useState } from 'react'
import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { raiseBestStreak } from '@/db/repo'
import { activeDays, computeStreak, COUNTS_AS_ACTIVE, DOES_NOT_COUNT } from '@/lib/streak'
import { formatDate } from '@/lib/dates'
import { IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'

/** Streak of days with at least one meaningful action, with a seven-day view and one-day grace. */
export function StreakRow({ subs, notes, changes, checks, settings }: { subs: Subscription[]; notes: CancellationNote[]; changes: PriceChange[]; checks: RenewalCheck[]; settings: Settings }) {
  const [info, setInfo] = useState(false)
  const days = useMemo(() => activeDays({ subs, notes, changes, checks, settings }), [subs, notes, changes, checks, settings])
  const streak = useMemo(() => computeStreak(days), [days])
  const best = Math.max(settings.bestStreak ?? 0, streak.current, streak.longestSeen)

  // Persist a new best so it can never be lost, even if old records are deleted later.
  useEffect(() => {
    if (best > (settings.bestStreak ?? 0)) void raiseBestStreak(best)
  }, [best, settings.bestStreak])

  const status = streak.recovery
    ? `Missed yesterday. Your ${streak.current}-day streak is safe this once. One action today keeps it going.`
    : streak.pendingToday
      ? `${streak.current}-day streak. One action today makes it ${streak.current + 1}.`
      : streak.current === 0
        ? 'No streak yet. One meaningful action today starts one.'
        : streak.graceUsed
          ? `${streak.current}-day streak, with its one free miss already used. Keep going.`
          : `${streak.current}-day streak. Nice and steady.`

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${streak.current > 0 ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-navy-700'}`}>
            <Icon name="sparkle" size={16} />
          </span>
          <span className="whitespace-nowrap text-[14px] font-semibold text-navy-900">
            {streak.current} day{streak.current === 1 ? '' : 's'} in a row
            <span className="ml-2 text-[12px] font-semibold text-muted">best {best}</span>
          </span>
        </div>
        <IconButton icon="info" size={16} label="What counts toward the streak" variant="muted" className="h-9 w-9 shrink-0" onClick={() => setInfo(true)} />
      </div>
      <div className="mt-2 flex items-start gap-3">
        <span className="mt-1.5 flex shrink-0 gap-1" aria-label="Last seven days">
          {streak.week.map((d) => (
            <span
              key={d.day}
              title={`${formatDate(d.day, 'EEE d MMM')}${d.active ? ' · counted' : d.grace ? ' · free miss' : ''}`}
              className={`h-2.5 w-2.5 rounded-full ${d.active ? 'bg-mint-500' : d.grace ? 'border-2 border-coral-400' : d.isToday ? 'border-2 border-mint-500' : 'bg-navy-100'}`}
            />
          ))}
        </span>
        <p className={`min-w-0 text-[13px] leading-snug ${streak.recovery ? 'font-medium text-coral-700' : 'text-muted'}`}>{status}</p>
      </div>

      <Sheet open={info} onClose={() => setInfo(false)} title="What counts">
        <p className="text-[14px] leading-relaxed text-muted">A day counts once when you do at least one of these. Doing more on the same day does not add extra days.</p>
        <ul className="mt-3 space-y-2">
          {COUNTS_AS_ACTIVE.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[14px] text-ink">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-100 text-mint-700">
                <Icon name="check" size={12} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-faint">Does not count</p>
        <ul className="mt-1.5 space-y-1.5">
          {DOES_NOT_COUNT.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[14px] text-muted">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-50 text-faint">
                <Icon name="x" size={12} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-2xl bg-coral-50 p-3 text-[13px] leading-relaxed text-coral-700">
          <span className="font-semibold">One free miss.</span> Each streak can skip a single day and carry on, as long as you do something the day after. Two missed days in a row start a fresh streak. Your best streak is kept for good.
        </div>
        <p className="mt-3 text-[12px] text-faint">Days are counted in your local time zone.</p>
      </Sheet>
    </div>
  )
}
