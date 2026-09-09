import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeChallengeDay, setChallengeHidden, startChallenge } from '@/db/repo'
import type { CancellationNote, PriceChange, RenewalCheck, Settings, Subscription } from '@/db/schema'
import { CHALLENGE_DAYS_TOTAL, challengeState, countEstimated, type ChallengeContext } from '@/lib/challenge'
import { formatDate, toISO } from '@/lib/dates'
import { Button, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'

/** Seven progress dots: done (mint), current (ringed), locked (faint). */
export function ChallengeDots({ settings, size = 'md' }: { settings: Settings | undefined; size?: 'sm' | 'md' }) {
  const state = challengeState(settings)
  const dim = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={`${state.completedCount} of ${CHALLENGE_DAYS_TOTAL} days done`}>
      {state.days.map((d) => (
        <span
          key={d.def.day}
          className={`${dim} rounded-full ${d.status === 'done' ? 'bg-mint-500' : d.status === 'current' ? 'bg-white ring-2 ring-mint-500' : 'bg-navy-100'}`}
          title={`Day ${d.def.day}: ${d.def.title}`}
        />
      ))}
    </span>
  )
}

/**
 * The seven-day starter challenge on Home. Starts itself on first sight so Day 1 is available at once, completes each
 * day from real data (never a manual tick), unlocks the next immediately, and never punishes a late return.
 */
export function ChallengeCard({ subs, notes, changes, checks, settings, currency }: { subs: Subscription[]; notes: CancellationNote[]; changes: PriceChange[]; checks: RenewalCheck[]; settings: Settings; currency: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)
  const starting = useRef(false)
  const completing = useRef<number | null>(null)
  const ctx = useMemo<ChallengeContext>(() => ({ subs, notes, changes, checks, settings, currency }), [subs, notes, changes, checks, settings, currency])
  const state = challengeState(settings)

  // Start the challenge the first time Home shows it. Day 1 needs nothing else.
  useEffect(() => {
    if (state.started || starting.current) return
    starting.current = true
    void startChallenge(countEstimated(subs))
  }, [state.started, subs])

  // The current day completes itself the moment its task is reflected in the data.
  useEffect(() => {
    if (!state.started || state.hidden || !state.current) return
    const day = state.current
    if (!day.done(ctx) || completing.current === day.day) return
    completing.current = day.day
    void completeChallengeDay(day.day).then((fresh) => {
      if (!fresh) return
      const next = day.day < CHALLENGE_DAYS_TOTAL ? `Day ${day.day + 1} is unlocked. Keep going or come back tomorrow.` : 'That was the last one. Nice work.'
      toast.success(`Day ${day.day} done. ${next}`)
    })
  }, [state.started, state.hidden, state.current, ctx, toast])

  if (!state.started || state.hidden) return null

  const current = state.current
  const lastDone = state.lastDone
  const lastDoneAt = lastDone ? state.days[lastDone.day - 1].doneAt : null

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mint-700">Seven-day starter</p>
            <p className="text-[1rem] font-bold leading-tight text-navy-900">{state.complete ? 'Challenge complete' : `Day ${current!.day} of ${CHALLENGE_DAYS_TOTAL}`}</p>
          </div>
          <ChallengeDots settings={settings} />
        </div>

        {lastDone && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-mint-50 px-3 py-2 text-[0.8125rem] leading-snug text-navy-900">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-mint-700" />
            <span>
              <span className="font-semibold">Day {lastDone.day} win{lastDoneAt ? ` · ${formatDate(toISO(new Date(lastDoneAt)), 'd MMM')}` : ''}:</span> {lastDone.win(ctx)}
            </span>
          </p>
        )}

        {current ? (
          <div className="mt-3 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
              <Icon name={current.icon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-bold leading-tight text-navy-900">{current.title}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{current.body}</p>
              <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink">
                <span className="font-semibold">About {current.minutes} min:</span> {current.task}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[0.8125rem] leading-snug text-muted">Seven small habits, all in place. Your weekly summary keeps the score from here.</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {current ? (
            <Button variant="mint" className="flex-1" onClick={() => navigate(current.path)} leading={<Icon name="arrowRight" size={18} />}>
              {current.cta}
            </Button>
          ) : (
            <Button variant="mint" className="flex-1" onClick={() => navigate('/week')} leading={<Icon name="chart" size={18} />}>
              See your week
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? 'Less' : 'All days'}
          </Button>
        </div>
      </div>

      {showAll && (
        <ul className="border-t border-line">
          {state.days.map((d) => (
            <li key={d.def.day} className={`flex items-start gap-3 px-4 py-2.5 ${d.status === 'locked' ? 'opacity-60' : ''}`}>
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold ${d.status === 'done' ? 'bg-mint-500 text-navy-900' : d.status === 'current' ? 'bg-navy-900 text-mint-400' : 'bg-navy-50 text-faint'}`}>
                {d.status === 'done' ? <Icon name="check" size={14} /> : d.def.day}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-semibold text-ink">{d.def.title}</span>
                <span className="block text-[0.75rem] leading-snug text-muted">
                  {d.status === 'done' ? d.def.win(ctx) : d.status === 'current' ? `${d.def.task} · about ${d.def.minutes} min` : `Unlocks after day ${d.def.day - 1} · about ${d.def.minutes} min`}
                </span>
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-[0.75rem] text-faint">Days never expire. Miss a week and simply pick up where you left off.</span>
            <TextLink
              icon={null}
              className="shrink-0"
              onClick={async () => {
                await setChallengeHidden(true)
                toast.info('Challenge hidden. Bring it back from Profile any time.')
              }}
            >
              Hide
            </TextLink>
          </li>
        </ul>
      )}
    </Card>
  )
}
