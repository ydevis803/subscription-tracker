import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useChallengeVisit } from '@/lib/useChallengeVisit'
import { describeError } from '@/lib/errors'
import { useNavigate } from 'react-router-dom'
import { setMonthlyBudget } from '@/db/repo'
import { usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { categoryOf } from '@/lib/categories'
import { CYCLE_LABEL, currencySymbol, formatMoney, isCounted, monthlyEquivalent, suggestBudget, toMonthly, validateBudget } from '@/lib/money'
import { monthlyTotalHistory } from '@/lib/history'
import { formatDate } from '@/lib/dates'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, EmptyState, ProgressBar, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'

const RULES: { cycle: string; rule: string }[] = [
  { cycle: 'Monthly', rule: 'counts as is' },
  { cycle: 'Yearly', rule: 'divided by 12' },
  { cycle: 'Quarterly', rule: 'divided by 3' },
  { cycle: 'Weekly', rule: 'times 52, divided by 12' },
]

export default function MonthlyTotal() {
  const navigate = useNavigate()
  useChallengeVisit('total')
  const toast = useToast()
  const subs = useSubscriptions()
  const settings = useSettings()
  const profile = useProfile()
  const priceChanges = usePriceChanges()
  const currency = profile?.currency ?? 'USD'
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const model = useMemo(() => {
    if (!subs || !priceChanges) return null
    const counted = subs.filter(isCounted)
    const total = monthlyEquivalent(subs)
    const shares = counted
      .map((s) => ({ sub: s, monthly: toMonthly(s.amount, s.billingCycle) }))
      .sort((a, b) => b.monthly - a.monthly)
    const history = monthlyTotalHistory(subs, priceChanges, 6)
    const previous = history.length >= 2 ? history[history.length - 2] : null
    const delta = previous ? total - previous.total : null
    const paused = subs.filter((s) => s.status === 'paused').length
    const cancelled = subs.filter((s) => s.status === 'cancelled').length
    return { counted, total, shares, history, previous, delta, paused, cancelled }
  }, [subs, priceChanges])

  const budget = settings?.monthlyBudget ?? null
  const fieldValue = draft ?? (budget === null ? '' : String(budget))
  const suggestion = model ? suggestBudget(model.total) : null
  const limitHistory = useMemo(() => [...(settings?.monthlyBudgetHistory ?? [])].reverse(), [settings])
  const belowTotal = (() => {
    if (!model || draft === null) return false
    const { parsed, error: err } = validateBudget(draft, currency)
    return !err && parsed !== null && parsed < model.total
  })()

  const inFlight = useRef(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (draft === null || inFlight.current) return
    const { error: err, parsed } = validateBudget(draft, currency)
    setError(err)
    if (err) return
    inFlight.current = true
    setSaving(true)
    try {
      await setMonthlyBudget(parsed)
      toast.success(parsed === null ? 'Limit cleared' : `Limit set to ${formatMoney(parsed, currency)} a month`)
      setDraft(null)
    } catch (e2) {
      toast.error(describeError(e2, 'save the limit'))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const maxHistory = model ? Math.max(...model.history.map((p) => p.total), 1) : 1

  return (
    <div>
      <PageHeader title="Monthly total" large back backTo="/" subtitle={model ? `${model.counted.length} ${model.counted.length === 1 ? 'subscription counts' : 'subscriptions count'} toward it` : undefined} />
      <Page className="space-y-4">
        {!model || !settings ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-48" />
          </>
        ) : (
          <>
            <div className="rounded-3xl bg-navy-900 p-5 text-white">
              <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-mint-400">Right now</p>
              <p className="tabular mt-1 text-[2.5rem] font-bold leading-none">{formatMoney(model.total, currency)}</p>
              <p className="mt-2 text-[0.875rem] text-navy-100">
                a month · {formatMoney(model.total * 12, currency, { compact: true })} a year · about {formatMoney((model.total * 12) / 365, currency)} a day
              </p>
              {model.delta !== null && model.previous && (
                <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.8125rem] font-semibold ${model.delta > 0.005 ? 'bg-coral-500/20 text-coral-300' : model.delta < -0.005 ? 'bg-mint-500/15 text-mint-300' : 'bg-white/10 text-navy-100'}`}>
                  <Icon name={model.delta > 0.005 ? 'trend' : model.delta < -0.005 ? 'trendDown' : 'check'} size={14} />
                  {model.delta > 0.005 ? `${formatMoney(model.delta, currency)} more than ${model.previous.label}` : model.delta < -0.005 ? `${formatMoney(-model.delta, currency)} less than ${model.previous.label}` : `Same as ${model.previous.label}`}
                </p>
              )}
              {budget !== null && (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[0.8125rem]">
                    <span className="text-navy-100">Limit {formatMoney(budget, currency)}</span>
                    <span className={`font-semibold ${model.total > budget ? 'text-coral-400' : 'text-mint-400'}`}>{model.total > budget ? `${formatMoney(model.total - budget, currency)} over` : `${formatMoney(budget - model.total, currency)} left`}</span>
                  </div>
                  <ProgressBar value={model.total} max={budget} tone={model.total > budget ? 'coral' : 'mint'} />
                </div>
              )}
            </div>

            <Card className="p-4">
              <p className="text-[0.9375rem] font-bold text-navy-900">How this number is made</p>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
                Every active subscription (and trial) is turned into what it costs per month, then added up. Paused and cancelled plans are left out
                {model.paused + model.cancelled > 0 ? ` (${model.paused} paused, ${model.cancelled} cancelled right now)` : ''}.
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {RULES.map((r) => (
                  <li key={r.cycle} className="rounded-xl bg-navy-50 px-3 py-2 text-[0.8125rem]">
                    <span className="block font-semibold text-navy-900">{r.cycle}</span>
                    <span className="text-muted">{r.rule}</span>
                  </li>
                ))}
              </ul>
              {model.counted.length === 0 ? (
                <EmptyState icon="list" tone="navy" title="Nothing counts yet" body="Add a subscription and its monthly share appears here." actionLabel="Add subscription" onAction={() => navigate('/subscriptions/new')} />
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-line">
                    {(showAll ? model.shares : model.shares.slice(0, 4)).map(({ sub, monthly }) => (
                      <li key={sub.id}>
                        <button type="button" onClick={() => navigate(`/subscriptions/${sub.id}`)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                          <ServiceMark name={sub.name} color={categoryOf(sub.categoryId).color} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.875rem] font-semibold text-ink">{sub.name}</span>
                            <span className="block text-[0.75rem] text-muted">
                              {formatMoney(sub.amount, sub.currency)} per {CYCLE_LABEL[sub.billingCycle]}
                              {sub.billingCycle !== 'monthly' ? ` → ${formatMoney(monthly, currency)} a month` : ''}
                            </span>
                          </span>
                          <span className="tabular text-[0.875rem] font-bold text-navy-900">{formatMoney(monthly, currency)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {model.shares.length > 4 && (
                    <TextLink icon={null} onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Show fewer' : `Show all ${model.shares.length}`}
                    </TextLink>
                  )}
                </>
              )}
            </Card>

            <Card className="p-4">
              <p className="text-[0.9375rem] font-bold text-navy-900">Your monthly limit</p>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
                A ceiling you choose. The dashboard shows how close each month gets to it. It never blocks anything.
              </p>
              <form onSubmit={save} className="mt-3 space-y-3" noValidate>
                <label className="block">
                  <span className="mb-1.5 block text-[0.8125rem] font-semibold text-navy-800">Limit per month</span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-[0.9375rem] font-semibold text-muted">{currencySymbol(currency)}</span>
                    <input
                      inputMode="decimal"
                      placeholder="No limit"
                      value={fieldValue}
                      onChange={(e) => {
                        setDraft(e.target.value)
                        setError(null)
                      }}
                      aria-invalid={!!error}
                      aria-describedby="limit-help"
                      className={`h-13 w-full rounded-2xl border bg-white pl-12 pr-4 text-[1rem] focus:border-navy-600 focus:ring-4 focus:ring-navy-600/10 ${error ? 'border-coral-500' : 'border-line'}`}
                    />
                  </span>
                  <span id="limit-help" className={`mt-1.5 block text-[0.8125rem] ${error ? 'font-medium text-coral-700' : belowTotal ? 'font-medium text-coral-700' : 'text-muted'}`} role={error ? 'alert' : undefined}>
                    {error ?? (belowTotal ? `That is below your current total of ${formatMoney(model.total, currency)}. You would start the month over the limit.` : 'Whole amounts or two decimals. Leave empty for no limit.')}
                  </span>
                </label>
                {suggestion !== null && budget === null && draft === null && (
                  <button type="button" onClick={() => setDraft(String(suggestion))} className="flex h-11 items-center gap-2 rounded-full bg-mint-100 px-4 text-[0.8125rem] font-semibold text-mint-700">
                    <Icon name="sparkle" size={16} /> Suggested: {formatMoney(suggestion, currency, { compact: true })} based on today's total
                  </button>
                )}
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" loading={saving} disabled={draft === null}>
                    {draft !== null && draft.trim() === '' && budget !== null ? 'Clear limit' : 'Save limit'}
                  </Button>
                  {draft !== null && (
                    <Button type="button" variant="ghost" onClick={() => { setDraft(null); setError(null) }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
              {limitHistory.length > 0 && (
                <div className="mt-4">
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Limit history</p>
                  <ul className="mt-1 divide-y divide-line" aria-label="Limit history, newest first">
                    {limitHistory.slice(0, 6).map((h, i) => (
                      <li key={h.changedAt + i} className="flex items-center justify-between py-2 text-[0.8125rem]">
                        <span className="text-ink">{h.amount === null ? 'Limit cleared' : `Set to ${formatMoney(h.amount, currency)}`}</span>
                        <span className="text-muted">{formatDate(h.changedAt.slice(0, 10), 'd MMM yyyy')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <p className="text-[0.9375rem] font-bold text-navy-900">Last six months</p>
              <p className="mt-1 text-[0.8125rem] text-muted">Rebuilt from start dates, cancellations and price changes, so it is only as complete as what you have entered.</p>
              <div className="mt-4 flex items-end gap-2">
                {model.history.map((p) => (
                  <div key={p.key} className="flex flex-1 flex-col items-center gap-1" title={`${p.label}: ${formatMoney(p.total, currency)}`}>
                    <span className="tabular text-[0.625rem] font-semibold text-muted">{formatMoney(p.total, currency, { compact: true }).replace(/\.00$/, '')}</span>
                    <div className="flex h-20 w-full items-end">
                      <div className={`w-full rounded-t-md ${p.isCurrent ? 'bg-mint-500' : 'bg-navy-600'}`} style={{ height: `${Math.max(4, (p.total / maxHistory) * 100)}%` }} />
                    </div>
                    <span className={`text-[0.6875rem] font-medium ${p.isCurrent ? 'text-navy-900' : 'text-faint'}`}>{p.label}</span>
                  </div>
                ))}
              </div>
              <ul className="mt-3 divide-y divide-line" aria-label="Monthly totals, newest first">
                {[...model.history].reverse().map((p) => (
                  <li key={p.key} className="flex items-center justify-between py-2 text-[0.8125rem]">
                    <span className={p.isCurrent ? 'font-semibold text-navy-900' : 'text-ink'}>
                      {p.label} {p.key.slice(0, 4)}
                      {p.isCurrent ? ' · now' : ''}
                    </span>
                    <span className="text-muted">
                      {p.count} {p.count === 1 ? 'plan' : 'plans'} · <span className="tabular font-semibold text-navy-900">{formatMoney(p.total, currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </Page>
    </div>
  )
}
