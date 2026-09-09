import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHECK_FRESH_DAYS, CHECK_WINDOW_DAYS, discardCheck, startCheck } from '@/db/repo'
import { ConfirmSheet } from '@/components/ui/Sheet'
import { useActiveCheck, useLatestCompletedCheck } from '@/hooks/useData'
import type { Subscription } from '@/db/schema'
import { daysFromToday, daysUntil, formatDate, renewalsInRange, todayISO, toISO } from '@/lib/dates'

/** Local calendar day of an ISO timestamp (the stored value is UTC). */
const localDay = (iso: string) => toISO(new Date(iso))
import { formatMoney } from '@/lib/money'
import { Button, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, ProgressBar } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'

/** The dashboard's primary action: check the next 30 days of renewals. Shows before, during and after states. */
export function CheckCard({ subs, currency }: { subs: Subscription[]; currency: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const active = useActiveCheck()
  const latest = useLatestCompletedCheck()
  const [starting, setStarting] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  if (active === undefined || latest === undefined) return null
  const upcoming = renewalsInRange(subs, todayISO(), daysFromToday(CHECK_WINDOW_DAYS))
  const due = upcoming.reduce((s, o) => s + o.amount, 0)

  const start = async () => {
    setStarting(true)
    try {
      await startCheck()
      navigate('/check')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the check')
      setStarting(false)
    }
  }

  if (active) {
    const total = Math.max(upcoming.length, active.decisions.length)
    return (
      <Card className="border-navy-800 bg-navy-900 p-4 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-navy-900">
            <Icon name="clock" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold">Renewal check in progress</p>
            <p className="text-[0.8125rem] text-navy-100">
              {active.decisions.length} of {total} reviewed · your progress is saved
            </p>
            <div className="mt-3">
              <ProgressBar value={active.decisions.length} max={total} tone="mint" />
            </div>
          </div>
        </div>
        <Button full variant="mint" className="mt-4" onClick={() => navigate('/check')} leading={<Icon name="arrowRight" size={18} />}>
          Resume check
        </Button>
        <div className="mt-1 text-center">
          <TextLink icon={null} className="mx-auto text-navy-100" onClick={() => setConfirmDiscard(true)}>
            Discard this check
          </TextLink>
        </div>
        <ConfirmSheet
          open={confirmDiscard}
          onClose={() => setConfirmDiscard(false)}
          title="Discard this check?"
          body="Decisions you already made (reminders set, plans cancelled) stay in place. Only the unfinished check is removed, and you can start a fresh one any time."
          confirmLabel="Discard"
          onConfirm={async () => {
            try {
              await discardCheck(active.id!)
              toast.info('Check discarded')
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not discard')
            } finally {
              setConfirmDiscard(false)
            }
          }}
        />
      </Card>
    )
  }

  const fresh = latest?.completedAt && daysUntil(localDay(latest.completedAt)) >= -CHECK_FRESH_DAYS
  // Renewals that appeared after the last check (new or edited subscriptions) need a look before "all clear" holds.
  const decided = new Set((latest?.decisions ?? []).map((d) => d.key))
  const unchecked = fresh ? upcoming.filter((o) => !decided.has(`${o.subscription.id}:${o.date}`)) : []
  if (fresh && latest && unchecked.length > 0) {
    const amount = unchecked.reduce((s, o) => s + o.amount, 0)
    return (
      <Card className="border-coral-100 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-100 text-coral-700">
            <Icon name="bell" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-navy-900">
              {unchecked.length} new {unchecked.length === 1 ? 'renewal' : 'renewals'} since your last check
            </p>
            <p className="text-[0.8125rem] text-muted">
              {unchecked.map((o) => o.subscription.name).slice(0, 3).join(', ')}
              {unchecked.length > 3 ? ` and ${unchecked.length - 3} more` : ''} · {formatMoney(amount, currency)} not yet reviewed.
            </p>
          </div>
        </div>
        <Button full variant="mint" className="mt-4" loading={starting} onClick={start} leading={<Icon name="arrowRight" size={18} />}>
          Check {unchecked.length === 1 ? 'it' : 'them'} now
        </Button>
      </Card>
    )
  }
  if (fresh && latest) {
    const ago = -daysUntil(localDay(latest.completedAt!))
    const s = latest.summary
    return (
      <Card className="border-mint-100 bg-mint-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-navy-900">
            <Icon name="check" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-navy-900">All clear · checked {ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}</p>
            <p className="text-[0.8125rem] text-muted">
              {s ? `${s.reviewed} ${s.reviewed === 1 ? 'renewal' : 'renewals'} reviewed${s.reminded ? ` · ${s.reminded} ${s.reminded === 1 ? 'reminder' : 'reminders'}` : ''}${s.cancelled ? ` · ${s.cancelled} cancelled` : ''}` : 'Nothing was due.'}
              {' · next check '}
              {formatDate(daysFromToday(CHECK_FRESH_DAYS - ago), 'EEE d MMM')}
            </p>
          </div>
          <TextLink icon={null} onClick={start} className="shrink-0">
            {starting ? 'Starting…' : 'Check again'}
          </TextLink>
        </div>
      </Card>
    )
  }

  if (upcoming.length === 0) {
    return (
      <Card className="flex items-center gap-3 border-mint-100 bg-mint-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-navy-900">
          <Icon name="check" size={20} />
        </span>
        <div className="flex-1">
          <p className="text-[0.9375rem] font-semibold text-navy-900">Nothing renews in the next {CHECK_WINDOW_DAYS} days</p>
          <p className="text-[0.8125rem] text-muted">{subs.length === 0 ? 'Add a subscription and we will watch its renewals.' : 'Enjoy the quiet. We will flag the next one here.'}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-mint-400">
          <Icon name="sparkle" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-navy-900">Check your next {CHECK_WINDOW_DAYS} days</p>
          <p className="text-[0.8125rem] text-muted">
            {upcoming.length} {upcoming.length === 1 ? 'renewal' : 'renewals'} worth {formatMoney(due, currency)}. One tap each, about a minute in total.
            {latest?.completedAt ? ` Last checked ${formatDate(localDay(latest.completedAt), 'd MMM')}.` : ''}
          </p>
        </div>
      </div>
      <Button full variant="mint" className="mt-4" loading={starting} onClick={start} leading={<Icon name="arrowRight" size={18} />}>
        Start check
      </Button>
    </Card>
  )
}
