import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Card, Skeleton } from '@/components/ui/Primitives'
import { ANALYTICS_EVENTS, EVENT_LABELS, type AnalyticsEvent } from '@/lib/analytics'
import { FIRST_WEEK_EXPERIMENT } from '@/lib/experiment'
import NotFound from '@/pages/NotFound'

interface Summary {
  totals: Record<string, number>
  last7: Record<string, number>
  prior7: Record<string, number>
  days: { day: string; counts: Record<string, number> }[]
  ownerKeyRequired: boolean
}

const OWNER_KEY_STORAGE = 'subscription-tracker.owner.analytics-key'

/** Conversion rows: each rate names its numerator and denominator so nobody has to guess what 40% means. */
const RATES: { id: string; label: string; numerator: AnalyticsEvent; denominator: AnalyticsEvent }[] = [
  { id: 'onboarding', label: 'Onboarding completion', numerator: 'onboarding_completed', denominator: 'onboarding_started' },
  { id: 'core', label: 'First core action', numerator: 'first_core_action', denominator: 'onboarding_completed' },
  { id: 'd2', label: 'Day-two return', numerator: 'day_two_return', denominator: 'onboarding_completed' },
  { id: 'd7', label: 'Day-seven return', numerator: 'day_seven_return', denominator: 'onboarding_completed' },
  { id: 'pview', label: 'Premium viewed', numerator: 'premium_view', denominator: 'onboarding_completed' },
  { id: 'pconv', label: 'Premium conversion', numerator: 'premium_conversion', denominator: 'premium_view' },
]

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')

export default function OwnerAnalytics() {
  const gate = (import.meta.env.VITE_STORE_PREVIEW_KEY as string | undefined)?.trim()
  const provided = new URLSearchParams(window.location.search).get('key')
  const allowed = import.meta.env.DEV || (!!gate && provided === gate)
  const [ownerKey, setOwnerKey] = useState(() => {
    try {
      return sessionStorage.getItem(OWNER_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analytics/summary', { headers: ownerKey ? { 'X-Owner-Key': ownerKey } : {}, cache: 'no-store' })
      if (res.status === 401) {
        setSummary(null)
        setError('The server wants the owner key (OWNER_KEY on the API server). Enter it below; it is kept for this tab only.')
        return
      }
      if (!res.ok) throw new Error(`Server answered ${res.status}`)
      setSummary((await res.json()) as Summary)
      try {
        if (ownerKey) sessionStorage.setItem(OWNER_KEY_STORAGE, ownerKey)
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the summary')
    } finally {
      setLoading(false)
    }
  }, [ownerKey])

  useEffect(() => {
    if (allowed) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  const biggestDrop = useMemo(() => {
    if (!summary) return null
    const funnel: { label: string; from: AnalyticsEvent; to: AnalyticsEvent }[] = [
      { label: 'Started → completed onboarding', from: 'onboarding_started', to: 'onboarding_completed' },
      { label: 'Completed onboarding → first core action', from: 'onboarding_completed', to: 'first_core_action' },
      { label: 'Completed onboarding → day-two return', from: 'onboarding_completed', to: 'day_two_return' },
      { label: 'Day-two return → day-seven return', from: 'day_two_return', to: 'day_seven_return' },
      { label: 'Premium viewed → converted', from: 'premium_view', to: 'premium_conversion' },
    ]
    let worst: { label: string; lost: number; rate: string } | null = null
    for (const step of funnel) {
      const a = summary.totals[step.from] ?? 0
      const b = summary.totals[step.to] ?? 0
      if (a === 0) continue
      const lost = a - b
      if (!worst || lost > worst.lost) worst = { label: step.label, lost, rate: pct(b, a) }
    }
    // Nobody lost anywhere yet is not a drop-off; say so rather than crowning a 100% step.
    return worst && worst.lost > 0 ? worst : null
  }, [summary])

  if (!allowed) return <NotFound />
  const x = FIRST_WEEK_EXPERIMENT

  return (
    <div className="min-h-dvh bg-canvas pb-16">
      <div className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-4 py-5">
          <Logo size={40} tile={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-400">Owner only · counts, never people</p>
            <h1 className="text-[1.375rem] font-bold leading-tight">Milestone analytics</h1>
          </div>
          <Link to="/__launch" className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-3 text-[0.8125rem] font-semibold">
            Launch
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-5 px-4 pt-5">
        <Card className="border-mint-100 bg-mint-50 p-4">
          <p className="text-[0.875rem] leading-snug text-navy-900">
            Each milestone is sent once per profile as an event name and a day, nothing else: no identifier, no account, no amounts, no names. The server keeps a count per event per day. That is all this page can show.
          </p>
        </Card>

        {error && (
          <Card className="border-coral-100 bg-coral-50 p-4" role="alert">
            <p className="text-[0.875rem] font-semibold text-coral-700">{error}</p>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <TextField label="Owner key" type="password" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} autoComplete="off" />
              </div>
              <Button variant="mint" onClick={load} loading={loading}>
                Unlock
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Milestones · all time and last 7 days</p>
            <Button size="sm" variant="ghost" onClick={load} loading={loading} leading={<Icon name="refresh" size={16} />}>
              Refresh
            </Button>
          </div>
          <ul className="mt-2 divide-y divide-line" data-counts>
            {ANALYTICS_EVENTS.map((e) => (
              <li key={e} className="flex items-center gap-3 py-2.5" data-event={e}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">{EVENT_LABELS[e].title}</span>
                  <span className="block text-[0.75rem] leading-snug text-muted">{EVENT_LABELS[e].when}</span>
                </span>
                {summary ? (
                  <span className="text-right">
                    <span className="tabular block text-[1.125rem] font-bold text-navy-900" data-total>
                      {summary.totals[e] ?? 0}
                    </span>
                    <span className="tabular block text-[0.75rem] text-muted">{summary.last7[e] ?? 0} in 7 days</span>
                  </span>
                ) : (
                  <Skeleton className="h-6 w-12" />
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Conversion · all time</p>
          <ul className="mt-2 divide-y divide-line" data-rates>
            {RATES.map((r) => {
              const n = summary?.totals[r.numerator] ?? 0
              const d = summary?.totals[r.denominator] ?? 0
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5" data-rate={r.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold text-ink">{r.label}</span>
                    <span className="block text-[0.75rem] leading-snug text-muted" data-denominator>
                      {EVENT_LABELS[r.numerator].title} ÷ {EVENT_LABELS[r.denominator].title} · {n} of {d}
                    </span>
                  </span>
                  <span className={`tabular text-[1.125rem] font-bold ${d > 0 ? 'text-navy-900' : 'text-faint'}`} data-pct>
                    {summary ? pct(n, d) : '…'}
                  </span>
                </li>
              )
            })}
          </ul>
          {summary && !Object.values(summary.totals).some((v) => v > 0) && (
            <p className="mt-3 rounded-xl bg-navy-50 px-3 py-2 text-[0.8125rem] leading-snug text-navy-900" data-empty>
              No milestones yet. Rates show a dash until the denominator has at least one event, so nothing here can read as 0% or 100% by accident.
            </p>
          )}
        </Card>

        <Card className={`p-4 ${biggestDrop ? 'border-coral-100' : ''}`}>
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-coral-700">Biggest drop-off</p>
          {biggestDrop ? (
            <p className="mt-1 text-[0.9375rem] leading-snug text-ink" data-biggest>
              <span className="font-semibold">{biggestDrop.label}</span>: {biggestDrop.lost} people lost, {biggestDrop.rate} carried through.
            </p>
          ) : (
            <p className="mt-1 text-[0.875rem] text-muted" data-no-drop>
              {summary && (summary.totals.onboarding_started ?? 0) > 0 ? 'No drop-off measured yet: everyone counted so far carried through every step. Check back once more people have used the app.' : 'Needs at least one onboarding start before a drop-off can be measured.'} The experiment below targets the step new habit apps usually lose most people at.
            </p>
          )}
        </Card>

        <Card className="overflow-hidden" data-experiment>
          <div className="bg-navy-900 p-4 text-white">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-400">First-week experiment · one change</p>
            <p className="mt-1 text-[1.125rem] font-bold leading-tight">{x.name}</p>
            <p className="mt-1 text-[0.8125rem] text-navy-100">Targets: {x.targetDropOff.label}</p>
          </div>
          <dl className="divide-y divide-line">
            <Row term="Hypothesis" desc={x.hypothesis} />
            <Row term="The one change" desc={x.change} />
            <Row term="What stays the same" desc={x.notChanging} />
            <Row term="Success metric" desc={`${x.successMetric.label} = ${EVENT_LABELS[x.successMetric.numerator].title} ÷ ${EVENT_LABELS[x.successMetric.denominator].title}. ${x.successMetric.baselineNote} Target: ${x.successMetric.target}`} data="success" />
            <Row term="Guardrail" desc={`${x.guardrail.label} = ${EVENT_LABELS[x.guardrail.numerator].title} ÷ ${EVENT_LABELS[x.guardrail.denominator].title}. ${x.guardrail.rule}`} />
            <Row term="Duration" desc={x.duration} />
            <Row term="Decision rule" desc={x.decision} />
          </dl>
          {summary && (
            <p className="border-t border-line px-4 py-3 text-[0.8125rem] text-muted" data-experiment-now>
              Right now: {x.successMetric.label} {pct(summary.totals[x.successMetric.numerator] ?? 0, summary.totals[x.successMetric.denominator] ?? 0)} ({summary.totals[x.successMetric.numerator] ?? 0} of {summary.totals[x.successMetric.denominator] ?? 0}); last 7 days {pct(summary.last7[x.successMetric.numerator] ?? 0, summary.last7[x.successMetric.denominator] ?? 0)}, prior 7 days {pct(summary.prior7[x.successMetric.numerator] ?? 0, summary.prior7[x.successMetric.denominator] ?? 0)}.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function Row({ term, desc, data }: { term: string; desc: string; data?: string }) {
  return (
    <div className="px-4 py-3" data-row={data}>
      <dt className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">{term}</dt>
      <dd className="mt-0.5 text-[0.9375rem] leading-relaxed text-ink">{desc}</dd>
    </div>
  )
}
