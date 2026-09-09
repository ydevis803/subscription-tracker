import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { markTrialEndedSeen } from '@/db/repo'
import type { CancellationNote, PriceChange, Profile, Subscription } from '@/db/schema'
import { TRIAL_DAYS, trialState, price } from '@/lib/plan'
import { trialWin } from '@/lib/trialWins'
import { formatDate } from '@/lib/dates'
import { Button, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, ProgressBar } from '@/components/ui/Primitives'

/** During a trial: status with dates and progress, plus today's personalised premium win. */
export function TrialCard({ profile, subs, changes, notes, currency }: { profile: Profile; subs: Subscription[]; changes: PriceChange[]; notes: CancellationNote[]; currency: string }) {
  const navigate = useNavigate()
  const trial = trialState(profile)
  const win = useMemo(() => (trial.status === 'active' ? trialWin(trial.day, subs, changes, notes, currency) : null), [trial.status, trial.day, subs, changes, notes, currency])
  if (trial.status !== 'active' || !win) return null
  return (
    <Card className="overflow-hidden border-mint-100">
      <div className="bg-mint-50 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-navy-900">
            Premium trial · day {trial.day} of {TRIAL_DAYS}
          </p>
          <TextLink icon={null} className="h-8" onClick={() => navigate('/premium')}>
            Manage
          </TextLink>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={trial.day} max={TRIAL_DAYS} tone="mint" />
        </div>
        <p className="mt-1.5 text-[12px] text-muted">
          Started {formatDate(trial.startedOn!, 'EEE d MMM')} · ends {formatDate(trial.endsOn!, 'EEE d MMM')} ({trial.daysLeft} {trial.daysLeft === 1 ? 'day' : 'days'} left) · no card needed
        </p>
      </div>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
          <Icon name={win.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Today's Premium win</p>
          <p className="text-[15px] font-semibold leading-snug text-ink">{win.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{win.body}</p>
          <Button size="sm" variant="mint" className="mt-3" onClick={() => navigate(win.path)} leading={<Icon name="arrowRight" size={16} />}>
            {win.cta}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Shown once after a trial ends: nothing was removed, Premium is one tap away, free keeps working. */
export function TrialEndedCard({ profile, subsCount }: { profile: Profile; subsCount: number }) {
  const navigate = useNavigate()
  const trial = trialState(profile)
  if (trial.status !== 'ended' || profile.plan === 'premium' || profile.trialEndedSeen) return null
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <Icon name="crown" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Your Premium trial ended {formatDate(trial.endsOn!, 'EEE d MMM')}</p>
          <p className="text-[13px] leading-snug text-muted">
            All {subsCount} {subsCount === 1 ? 'subscription' : 'subscriptions'}, notes and history are exactly as you left them. The free plan keeps tracking; the yearly projection, impact report and unused detector are Premium, from {price('monthly')}/mo.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => navigate('/premium')}>
              Keep Premium
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void markTrialEndedSeen()}>
              Stay on free
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
