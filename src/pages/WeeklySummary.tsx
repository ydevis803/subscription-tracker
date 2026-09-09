import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { useScopeKey } from '@/auth/AuthContext'
import { startCheck } from '@/db/repo'
import { useActiveCheck, useLatestCompletedCheck, useNotes, usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { weeklySummary } from '@/lib/weekly'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { InviteLink } from '@/components/app/InviteCard'
import { Icon } from '@/components/ui/Icon'
import { Card, SectionTitle, Skeleton } from '@/components/ui/Primitives'
import { SegmentedControl } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

const toneBox = { coral: 'bg-coral-100 text-coral-700', mint: 'bg-mint-100 text-mint-700', navy: 'bg-navy-50 text-navy-700' } as const

export default function WeeklySummary() {
  const navigate = useNavigate()
  const toast = useToast()
  const key = useScopeKey()
  const subs = useSubscriptions()
  const notes = useNotes()
  const changes = usePriceChanges()
  const settings = useSettings()
  const profile = useProfile()
  const active = useActiveCheck()
  const latest = useLatestCompletedCheck()
  const checks = useLiveQuery(() => db.renewalChecks.toArray(), [key])
  const [offset, setOffset] = useState<0 | -1>(0)
  const [starting, setStarting] = useState(false)
  const currency = profile?.currency ?? 'USD'

  const summary = useMemo(
    () => (subs && notes && changes && settings && checks && active !== undefined && latest !== undefined ? weeklySummary({ subs, notes, changes, checks, settings, active, latest, currency, offset }) : null),
    [subs, notes, changes, settings, checks, active, latest, currency, offset],
  )

  const go = async () => {
    if (!summary) return
    const r = summary.recommendation
    if (r.kind === 'start-check' || r.kind === 'confirm-renewal') {
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
    navigate(r.path)
  }

  const maxDay = summary ? Math.max(1, ...summary.completed.byDay.map((d) => d.count)) : 1
  const c = summary?.completed
  const items = c
    ? [
        [c.checks, 'renewal check completed', 'renewal checks completed'],
        [c.decisions, 'renewal reviewed', 'renewals reviewed'],
        [c.notesDecided, 'note decided', 'notes decided'],
        [c.notesAdded, 'note written', 'notes written'],
        [c.subsAdded, 'subscription added', 'subscriptions added'],
        [c.subsCancelled, 'subscription cancelled', 'subscriptions cancelled'],
        [c.priceChanges, 'price change logged', 'price changes logged'],
        [c.limitChanges, 'limit change', 'limit changes'],
      ].filter(([n]) => (n as number) > 0)
    : []

  return (
    <div>
      <PageHeader title="Your week" large back backTo="/" subtitle={summary ? summary.range.label : undefined} />
      <Page className="space-y-5">
        <SegmentedControl
          value={offset === 0 ? 'this' : 'last'}
          onChange={(v) => setOffset(v === 'this' ? 0 : -1)}
          options={[
            { value: 'this', label: 'This week' },
            { value: 'last', label: 'Last week' },
          ]}
        />
        {!summary ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <section>
              <SectionTitle>1 · What you completed</SectionTitle>
              <Card className="p-4">
                {summary.completed.total === 0 ? (
                  <>
                    <p className="text-[0.9375rem] font-semibold text-navy-900">{summary.range.isCurrent ? 'A quiet week so far' : 'A quiet week'}</p>
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
                      {summary.range.isCurrent
                        ? 'Nothing logged yet. That is fine: one small action, like reviewing a renewal or deciding a note, is enough to make the week count.'
                        : 'No actions were recorded that week. Your subscriptions carried on being tracked, and the recommendation below is the best place to pick up.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="tabular text-[1.75rem] font-bold leading-none text-navy-900">
                      {summary.completed.total} <span className="text-[0.9375rem] font-semibold text-muted">{summary.completed.total === 1 ? 'action' : 'actions'}</span>
                    </p>
                    <p className="mt-1 text-[0.8125rem] text-muted">
                      on {summary.completed.activeDays} {summary.completed.activeDays === 1 ? 'day' : 'days'} · {summary.range.label}
                    </p>
                    <div className="mt-3 flex items-end gap-1.5" aria-label="Actions by day">
                      {summary.completed.byDay.map((d) => (
                        <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                          <span className="tabular text-[0.625rem] font-semibold text-muted">{d.count || ''}</span>
                          <div className="flex h-12 w-full items-end">
                            <div className={`w-full rounded-t-md ${d.future ? 'bg-navy-50' : d.count > 0 ? 'bg-mint-500' : 'bg-navy-100'}`} style={{ height: `${d.count > 0 ? Math.max(12, (d.count / maxDay) * 100) : 6}%` }} />
                          </div>
                          <span className={`text-[0.625rem] font-semibold ${d.isToday ? 'text-navy-900' : 'text-faint'}`}>{d.label}</span>
                        </div>
                      ))}
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {items.map(([n, one, many]) => (
                        <li key={many as string}>
                          <span className="inline-flex h-11 items-center rounded-full border border-line bg-white px-3.5 text-[0.8125rem] font-semibold text-muted">
                            {n as number} {(n as number) === 1 ? (one as string) : (many as string)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </section>

            <section>
              <SectionTitle>2 · How you changed</SectionTitle>
              <Card className="p-4">
                {Math.abs(summary.change.delta) < 0.005 ? (
                  <>
                    <p className="text-[0.9375rem] font-semibold text-navy-900">Monthly total held at {formatMoney(summary.change.totalEnd, currency)}</p>
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">Nothing was added, cancelled or repriced {summary.range.isCurrent ? 'this week' : 'that week'}. Steady is good.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[0.9375rem] font-semibold text-navy-900">
                      Monthly total {summary.change.delta < 0 ? 'down' : 'up'} {formatMoney(Math.abs(summary.change.delta), currency)}
                    </p>
                    <div className="mt-3 flex items-end gap-3">
                      {[
                        { label: 'Week start', value: summary.change.totalStart, cls: 'bg-navy-600' },
                        { label: summary.range.isCurrent ? 'Now' : 'Week end', value: summary.change.totalEnd, cls: summary.change.delta < 0 ? 'bg-mint-500' : 'bg-coral-500' },
                      ].map((b) => {
                        const max = Math.max(summary.change.totalStart, summary.change.totalEnd, 1)
                        return (
                          <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                            <span className="tabular text-[0.8125rem] font-semibold text-navy-900">{formatMoney(b.value, currency)}</span>
                            <div className="flex h-16 w-full items-end">
                              <div className={`w-full rounded-t-md ${b.cls}`} style={{ height: `${Math.max(8, (b.value / max) * 100)}%` }} />
                            </div>
                            <span className="text-[0.6875rem] font-medium text-faint">{b.label}</span>
                          </div>
                        )
                      })}
                    </div>
                    <ul className="mt-3 space-y-1 text-[0.8125rem] text-muted">
                      {summary.change.freedMonthly > 0 && (
                        <li className="flex items-center gap-2">
                          <Icon name="trendDown" size={14} className="text-mint-700" /> Cancelled plans freed {formatMoney(summary.change.freedMonthly, currency)} a month
                        </li>
                      )}
                      {summary.change.addedMonthly > 0 && (
                        <li className="flex items-center gap-2">
                          <Icon name="plus" size={14} className="text-navy-700" /> New subscriptions added {formatMoney(summary.change.addedMonthly, currency)} a month
                        </li>
                      )}
                      {summary.change.increasesMonthly > 0 && (
                        <li className="flex items-center gap-2">
                          <Icon name="trend" size={14} className="text-coral-700" /> Price increases added {formatMoney(summary.change.increasesMonthly, currency)} a month
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </Card>
            </section>

            <section>
              <SectionTitle>3 · Recommended next</SectionTitle>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneBox[summary.recommendation.tone]}`}>
                    <Icon name={summary.recommendation.icon} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[1rem] font-bold leading-tight text-navy-900">{summary.recommendation.title}</p>
                    <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{summary.recommendation.body}</p>
                    {summary.recommendation.why && <p className="mt-1.5 text-[0.75rem] text-faint">Why: {summary.recommendation.why}</p>}
                  </div>
                </div>
                <Button full variant={summary.recommendation.tone === 'coral' ? 'coral' : 'mint'} className="mt-3" loading={starting} onClick={go} leading={<Icon name="arrowRight" size={18} />}>
                  {summary.recommendation.cta}
                </Button>
                {summary.completed.total > 0 && summary.change.delta <= 0.005 && summary.recommendation.tone !== 'coral' && <InviteLink className="mt-1" label="Share the app with a friend" />}
              </Card>
            </section>
          </>
        )}
      </Page>
    </div>
  )
}
