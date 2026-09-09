import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { useNotes, usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { updateSettings } from '@/db/repo'
import { headlineInsights } from '@/lib/insights'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { renewalsInRange, toISO, daysUntil } from '@/lib/dates'
import { categoryOf } from '@/lib/categories'
import { isPremium } from '@/lib/plan'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card, EmptyState, SectionTitle, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'
import { TextLink } from '@/components/ui/Button'
import { CategoryBars, Donut, categoryTotals } from '@/components/app/CategoryBreakdown'
import { LockedCard } from '@/components/app/Paywall'
import type { CategoryId, SubscriptionStatus } from '@/db/schema'
import { CYCLE_OPTIONS, matchesCategories, matchesCycle, matchesStatuses, presentCategories, type CycleFilter } from '@/lib/filters'
import { ChipRow, FilterToggle, FilteredEmpty, ResultsBar, useSessionView } from '@/components/app/Filters'

interface InsightsView {
  categories: CategoryId[]
  cycle: CycleFilter
  statuses: SubscriptionStatus[]
  panelOpen: boolean
}
const DEFAULT_INSIGHTS_VIEW: InsightsView = { categories: [], cycle: 'any', statuses: [], panelOpen: false }
const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trials' },
  { value: 'paused', label: 'Paused' },
]

export default function Insights() {
  const navigate = useNavigate()
  const subs = useSubscriptions()
  const profile = useProfile()
  const priceChanges = usePriceChanges()
  const notes = useNotes()
  const currency = profile?.currency ?? 'USD'
  const premium = isPremium(profile)
  const settings = useSettings()
  const insightsOn = settings?.insightsEnabled !== false
  const headlines = useMemo(() => (subs && priceChanges ? headlineInsights(subs, priceChanges, currency, settings?.monthlyBudget ?? null) : []), [subs, priceChanges, currency, settings?.monthlyBudget])
  const [view, patch, reset] = useSessionView<InsightsView>('insights', DEFAULT_INSIGHTS_VIEW)
  const activeCount = (view.categories.length ? 1 : 0) + (view.cycle !== 'any' ? 1 : 0) + (view.statuses.length ? 1 : 0)
  const filtersActive = activeCount > 0
  const activeLabels = [
    view.categories.length ? view.categories.map((c) => categoryOf(c).name).join(', ') : null,
    view.cycle !== 'any' ? CYCLE_OPTIONS.find((o) => o.value === view.cycle)!.label : null,
    view.statuses.length ? view.statuses.map((s) => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s).join(', ') : null,
  ].filter((x): x is string => !!x)
  const categoryOptions = useMemo(() => presentCategories((subs ?? []).filter(isCounted)), [subs])

  // Everything below is computed from the filtered set, so the monthly total answers "how much on X".
  const scoped = useMemo(() => {
    if (!subs) return undefined
    const pausedIncluded = view.statuses.includes('paused')
    return subs
      .filter((s) => (pausedIncluded ? s.status !== 'cancelled' : isCounted(s)))
      .filter((s) => matchesStatuses(s, view.statuses) && matchesCategories(s, view.categories) && matchesCycle(s, view.cycle))
      .map((s) => (pausedIncluded && s.status === 'paused' ? { ...s, status: 'active' as const } : s))
  }, [subs, view.statuses, view.categories, view.cycle])

  const model = useMemo(() => {
    if (!scoped || !priceChanges || !notes) return null
    const subs = scoped
    const counted = subs.filter(isCounted)
    const monthly = monthlyEquivalent(subs)
    const totals = categoryTotals(subs)
    const biggest = [...counted].sort((a, b) => toMonthly(b.amount, b.billingCycle) - toMonthly(a.amount, a.billingCycle)).slice(0, 5)
    const byCycle = {
      monthlyLike: counted.filter((s) => s.billingCycle === 'monthly' || s.billingCycle === 'weekly').reduce((s, x) => s + toMonthly(x.amount, x.billingCycle), 0),
      annualLike: counted.filter((s) => s.billingCycle === 'yearly' || s.billingCycle === 'quarterly').reduce((s, x) => s + toMonthly(x.amount, x.billingCycle), 0),
    }
    const projection = Array.from({ length: 12 }).map((_, i) => {
      const m = addMonths(startOfMonth(new Date()), i)
      const occ = renewalsInRange(subs, toISO(startOfMonth(m)), toISO(endOfMonth(m)))
      return { label: format(m, 'MMM'), total: occ.reduce((s, o) => s + o.amount, 0), count: occ.length }
    })
    const yearAgoIncreases = priceChanges.filter((p) => daysUntil(p.effectiveDate) >= -365)
    let increaseMonthly = 0
    const increaseRows: { name: string; delta: number; color: string; id: number }[] = []
    for (const p of yearAgoIncreases) {
      const s = subs.find((x) => x.id === p.subscriptionId)
      if (!s || !isCounted(s)) continue
      const d = toMonthly(p.newAmount - p.previousAmount, s.billingCycle)
      increaseMonthly += d
      const row = increaseRows.find((r) => r.id === s.id)
      if (row) row.delta += d
      else increaseRows.push({ name: s.name, delta: d, color: categoryOf(s.categoryId).color, id: s.id! })
    }
    increaseRows.sort((a, b) => b.delta - a.delta)
    const unused = subs
      .filter((s) => s.status === 'paused' || s.status === 'trial' || notes.some((n) => n.subscriptionId === s.id && n.status === 'open' && (n.reason === 'not-using' || n.reason === 'too-expensive')))
      .map((s) => ({ sub: s, monthly: toMonthly(s.amount, s.billingCycle) }))
    const unusedMonthly = unused.reduce((s, u) => s + u.monthly, 0)
    return { counted, monthly, totals, biggest, byCycle, projection, increaseMonthly, increaseRows, unused, unusedMonthly }
  }, [scoped, priceChanges, notes])

  const maxProj = model ? Math.max(...model.projection.map((p) => p.total), 1) : 1

  return (
    <div>
      <PageHeader title="Insights" large subtitle={model && insightsOn ? `${formatMoney(model.monthly * 12, currency, { compact: true })} a year across ${model.counted.length} subscriptions` : undefined} />
      {settings && !insightsOn ? (
        <Page>
          <Card>
            <EmptyState
              icon="chart"
              tone="navy"
              title="Spending insights are off"
              body="Your monthly total and renewals still work everywhere. Breakdowns, highlights and trends are hidden until you turn insights back on. Nothing is deleted."
              actionLabel="Turn on insights"
              onAction={() => updateSettings({ insightsEnabled: true })}
            />
            <p className="px-6 pb-6 text-center text-[13px] text-muted">You can also change this under Settings → Display.</p>
          </Card>
        </Page>
      ) : (
      <Page className="space-y-5">
        {headlines.length > 0 && !filtersActive && (
          <section>
            <SectionTitle>Highlights</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {headlines.map((h, i) => {
                const inner = (
                  <>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${h.tone === 'coral' ? 'bg-coral-100 text-coral-700' : h.tone === 'mint' ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-navy-700'}`}>
                      <Icon name={h.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{h.text}</span>
                    {h.to && <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />}
                  </>
                )
                return h.to ? (
                  <button key={i} type="button" onClick={() => navigate(h.to!)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-navy-50">
                    {inner}
                  </button>
                ) : (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    {inner}
                  </div>
                )
              })}
            </Card>
          </section>
        )}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FilterToggle open={view.panelOpen} count={activeCount} onClick={() => patch({ panelOpen: !view.panelOpen })} />
            <span className="text-[13px] text-muted">Narrow the monthly total by category, cycle or status.</span>
          </div>
          {view.panelOpen && (
            <Card className="fade space-y-4 p-4">
              {categoryOptions.length > 0 && <ChipRow label="Category" options={categoryOptions} value={view.categories} onChange={(v) => patch({ categories: v as CategoryId[] })} />}
              <ChipRow label="Billing cycle" options={CYCLE_OPTIONS} value={view.cycle} onChange={(v) => patch({ cycle: v as CycleFilter })} />
              <ChipRow label="Include" options={STATUS_OPTIONS} value={view.statuses} onChange={(v) => patch({ statuses: v as SubscriptionStatus[] })} />
            </Card>
          )}
          {subs && subs.filter(isCounted).length > 0 && (
            <ResultsBar shown={model?.counted.length ?? 0} total={subs.filter((s) => s.status !== 'cancelled').length} noun="subscriptions in this total" active={filtersActive} onClear={reset} />
          )}
        </div>
        {!model ? (
          <>
            <Skeleton className="h-48" />
            <Skeleton className="h-40" />
          </>
        ) : model.counted.length === 0 && filtersActive ? (
          <FilteredEmpty query="" filters={activeLabels} noun="subscriptions" onClear={reset} />
        ) : model.counted.length === 0 ? (
          <Card>
            <EmptyState icon="chart" tone="navy" title="Insights arrive with your first subscription" body="Once a few subscriptions are in, this page shows where the money goes, what got dearer and what could be trimmed." actionLabel="Add subscription" onAction={() => navigate('/subscriptions/new')} />
          </Card>
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-4">
                <Donut totals={model.totals} currency={currency} size={140} />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Per month</p>
                    <p className="tabular text-xl font-bold text-navy-900">{formatMoney(model.monthly, currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Per year</p>
                    <p className="tabular text-xl font-bold text-navy-900">{formatMoney(model.monthly * 12, currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Per day</p>
                    <p className="tabular text-[15px] font-semibold text-muted">{formatMoney((model.monthly * 12) / 365, currency)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <CategoryBars totals={model.totals} currency={currency} />
              </div>
            </Card>

            <section>
              <SectionTitle>Billing mix</SectionTitle>
              <Card className="p-4">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-navy-50">
                  <span style={{ width: `${(model.byCycle.monthlyLike / (model.monthly || 1)) * 100}%` }} className="bg-mint-500" />
                  <span style={{ width: `${(model.byCycle.annualLike / (model.monthly || 1)) * 100}%` }} className="bg-navy-600" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-2.5 w-2.5 rounded-full bg-mint-500" /> Monthly and weekly
                    </span>
                    <span className="tabular block text-[15px] font-bold text-navy-900">{formatMoney(model.byCycle.monthlyLike, currency)}/mo</span>
                  </div>
                  <div>
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-2.5 w-2.5 rounded-full bg-navy-600" /> Annual and quarterly
                    </span>
                    <span className="tabular block text-[15px] font-bold text-navy-900">{formatMoney(model.byCycle.annualLike, currency)}/mo</span>
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-muted">Annual plans are easy to forget. They are spread evenly here, but land as one charge on the calendar.</p>
              </Card>
            </section>

            <section>
              <SectionTitle>Price changes</SectionTitle>
              {(() => {
                const changeCount = (priceChanges ?? []).length
                return (
              <Card className="overflow-hidden">
                <button type="button" onClick={() => navigate('/history')} className="flex w-full items-center gap-3 p-4 text-left active:bg-navy-50">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${changeCount === 0 ? 'bg-navy-50 text-navy-700' : model.increaseMonthly > 0 ? 'bg-coral-100 text-coral-700' : 'bg-mint-100 text-mint-700'}`}>
                    <Icon name={model.increaseMonthly > 0 ? 'trend' : 'trendDown'} size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">
                      {changeCount === 0 ? 'No price changes recorded yet' : `${changeCount} ${changeCount === 1 ? 'price change' : 'price changes'} recorded`}
                    </span>
                    <span className="block text-[13px] text-muted">
                      {changeCount === 0
                        ? 'Log one when a plan gets dearer, and every edit to an amount is kept automatically.'
                        : model.increaseMonthly > 0
                          ? `Increases in the last year add ${formatMoney(model.increaseMonthly, currency)} a month. See the full history.`
                          : 'No increases in the last year. See the full history.'}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
                </button>
              </Card>
                )
              })()}
            </section>

            <section>
              <SectionTitle>Biggest line items</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {model.biggest.map((s) => {
                  const m = toMonthly(s.amount, s.billingCycle)
                  return (
                    <button key={s.id} onClick={() => navigate(`/subscriptions/${s.id}`)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-navy-50">
                      <ServiceMark name={s.name} color={categoryOf(s.categoryId).color} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[14px] font-semibold text-ink">{s.name}</span>
                        <span className="block text-[12px] text-muted">{Math.round((m / model.monthly) * 100)}% of monthly total</span>
                      </span>
                      <span className="tabular text-[14px] font-bold text-navy-900">{formatMoney(m, currency)}/mo</span>
                    </button>
                  )
                })}
              </Card>
            </section>

            <section>
              <SectionTitle
                action={
                  !premium ? (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-navy-700">
                      <Icon name="crown" size={14} /> Premium
                    </span>
                  ) : undefined
                }
              >
                Next 12 months
              </SectionTitle>
              {premium ? (
                <Card className="p-4">
                  <div className="flex items-end gap-1.5">
                    {model.projection.map((p, i) => (
                      <div key={p.label} className="flex flex-1 flex-col items-center gap-1" title={`${p.label}: ${formatMoney(p.total, currency)}`}>
                        <span className="tabular text-[9px] font-semibold text-muted">{p.total >= 1000 ? formatMoney(p.total, currency, { compact: true }) : Math.round(p.total)}</span>
                        <div className="flex h-24 w-full items-end">
                          <div className={`w-full rounded-t-md ${i === 0 ? 'bg-coral-500' : 'bg-navy-600'}`} style={{ height: `${Math.max(4, (p.total / maxProj) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-faint">{p.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[13px] text-muted">
                    Actual charges by month. Your most expensive month is{' '}
                    <span className="font-semibold text-navy-900">
                      {model.projection.reduce((a, b) => (b.total > a.total ? b : a)).label} ({formatMoney(Math.max(...model.projection.map((p) => p.total)), currency)})
                    </span>
                    .
                  </p>
                </Card>
              ) : (
                <LockedCard title="12-month projection" body="See which months hit hardest when annual plans land." />
              )}
            </section>

            <section>
              <SectionTitle>Price increases</SectionTitle>
              {premium ? (
                <Card className="p-4">
                  {model.increaseRows.length === 0 ? (
                    <p className="text-[14px] text-muted">No price changes recorded in the last 12 months. Log one from any subscription's page.</p>
                  ) : (
                    <>
                      <p className="text-[14px] text-ink">
                        Increases in the last year cost you <span className="font-bold text-coral-700">{formatMoney(model.increaseMonthly, currency)}/mo</span> more, or{' '}
                        <span className="font-bold text-coral-700">{formatMoney(model.increaseMonthly * 12, currency)}</span> a year.
                      </p>
                      <ul className="mt-3 space-y-2">
                        {model.increaseRows.map((r) => (
                          <li key={r.id} className="flex items-center justify-between text-[14px]">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                              {r.name}
                            </span>
                            <span className={`tabular font-semibold ${r.delta > 0 ? 'text-coral-700' : 'text-mint-700'}`}>
                              {r.delta > 0 ? '+' : ''}
                              {formatMoney(r.delta, currency)}/mo
                            </span>
                          </li>
                        ))}
                      </ul>
                      <TextLink className="mt-2" onClick={() => navigate('/history')}>
                        Full price history
                      </TextLink>
                    </>
                  )}
                </Card>
              ) : (
                <LockedCard title="Price-increase impact" body="Find out how much more you pay than when you signed up." />
              )}
            </section>

            <section>
              <SectionTitle>Possible savings</SectionTitle>
              {premium ? (
                <Card className="p-4">
                  {model.unused.length === 0 ? (
                    <p className="text-[14px] text-muted">Nothing flagged. Paused plans, trials and notes marked “not using” or “too expensive” show up here.</p>
                  ) : (
                    <>
                      <p className="text-[14px] text-ink">
                        Up to <span className="font-bold text-mint-700">{formatMoney(model.unusedMonthly, currency)}/mo</span> could be saved by acting on these:
                      </p>
                      <ul className="mt-3 divide-y divide-line">
                        {model.unused.map((u) => (
                          <li key={u.sub.id}>
                            <button onClick={() => navigate(`/subscriptions/${u.sub.id}`)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                              <ServiceMark name={u.sub.name} color={categoryOf(u.sub.categoryId).color} size={32} />
                              <span className="flex-1 text-[14px] font-semibold text-ink">{u.sub.name}</span>
                              <span className="text-[12px] text-muted">{u.sub.status === 'paused' ? 'Paused' : u.sub.status === 'trial' ? 'Trial' : 'Flagged'}</span>
                              <span className="tabular text-[14px] font-semibold text-navy-900">{formatMoney(u.monthly, currency)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Card>
              ) : (
                <LockedCard title="Unused subscription detector" body="Spots paused plans, trials and things you flagged as not worth it." />
              )}
            </section>
          </>
        )}
      </Page>
      )}
    </div>
  )
}
