import { useMemo, useState } from 'react'
import { FilteredEmpty, ResultsBar, SearchField, SortSelect, useSessionView } from '@/components/app/Filters'
import { Chip, IconButton } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { PriceChangeSheet } from './SubscriptionDetail'

interface HistoryView {
  query: string
  direction: 'all' | 'up' | 'down'
  sort: 'newest' | 'biggest'
}
const DEFAULT_HISTORY_VIEW: HistoryView = { query: '', direction: 'all', sort: 'newest' }
import { useNavigate } from 'react-router-dom'
import { usePriceChanges, useProfile, useSubscriptions } from '@/hooks/useData'
import { categoryOf } from '@/lib/categories'
import { formatMoney, isCounted, toMonthly } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card, EmptyState, ListSkeleton, ServiceMark } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'

export default function PriceHistory() {
  const navigate = useNavigate()
  const changes = usePriceChanges()
  const subs = useSubscriptions()
  const profile = useProfile()
  const currency = profile?.currency ?? 'USD'
  const [view, patch, reset] = useSessionView<HistoryView>('history', DEFAULT_HISTORY_VIEW)
  const [picker, setPicker] = useState(false)
  const [target, setTarget] = useState<number | null>(null)
  const targetSub = subs?.find((s) => s.id === target)
  const pickable = (subs ?? []).filter((s) => s.status !== 'cancelled')
  const filtersActive = view.query.trim() !== '' || view.direction !== 'all' || view.sort !== 'newest'

  const model = useMemo(() => {
    if (!changes || !subs) return null
    const subById = new Map(subs.map((s) => [s.id!, s]))
    let driftMonthly = 0
    let increases = 0
    let decreases = 0
    for (const c of changes) {
      const s = subById.get(c.subscriptionId)
      if (!s) continue
      if (c.newAmount > c.previousAmount) increases++
      else decreases++
      if (isCounted(s)) driftMonthly += toMonthly(c.newAmount - c.previousAmount, s.billingCycle)
    }
    const all = changes
      .map((c) => ({ change: c, sub: subById.get(c.subscriptionId) }))
      .filter((r): r is { change: (typeof changes)[number]; sub: NonNullable<typeof r.sub> } => !!r.sub)
    const q = view.query.trim().toLowerCase()
    const rows = all.filter(
      (r) =>
        (view.direction === 'all' || (view.direction === 'up' ? r.change.newAmount > r.change.previousAmount : r.change.newAmount < r.change.previousAmount)) &&
        (!q || r.sub.name.toLowerCase().includes(q) || r.change.note.toLowerCase().includes(q)),
    )
    if (view.sort === 'biggest') rows.sort((a, b) => Math.abs(b.change.newAmount - b.change.previousAmount) - Math.abs(a.change.newAmount - a.change.previousAmount))
    return { rows, all, driftMonthly, increases, decreases }
  }, [changes, subs, view])

  return (
    <div>
      <PageHeader
        title="Price history"
        back
        backTo="/insights"
        subtitle={model ? `${model.increases} ${model.increases === 1 ? 'increase' : 'increases'} · ${model.decreases} ${model.decreases === 1 ? 'decrease' : 'decreases'}` : undefined}
        right={<IconButton icon="plus" label="Log a price change" variant="primary" onClick={() => setPicker(true)} />}
      />
      <Page className="space-y-4">
        {!model ? (
          <ListSkeleton rows={4} />
        ) : model.all.length === 0 ? (
          <Card>
            <EmptyState
              icon="trend"
              tone="navy"
              title="No price changes yet"
              body={pickable.length === 0 ? 'Add a subscription first. Every edit to an amount is then recorded here with the date and reason.' : 'Every edit to an amount is recorded here automatically. You can also log a change a provider announced.'}
              actionLabel={pickable.length === 0 ? 'Add subscription' : 'Log a price change'}
              onAction={() => (pickable.length === 0 ? navigate('/subscriptions/new') : setPicker(true))}
            />
          </Card>
        ) : (
          <>
            <SearchField value={view.query} onChange={(q) => patch({ query: q })} placeholder="Search by service or reason" label="Search price history" />
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { value: 'all', label: 'All changes' },
                  { value: 'up', label: 'Increases' },
                  { value: 'down', label: 'Decreases' },
                ] as const
              ).map((o) => (
                <Chip key={o.value} selected={view.direction === o.value} onClick={() => patch({ direction: o.value })}>
                  {o.label}
                </Chip>
              ))}
              <div className="min-w-[150px] flex-1">
                <SortSelect
                  value={view.sort}
                  onChange={(s) => patch({ sort: s })}
                  options={[
                    { value: 'newest', label: 'Newest' },
                    { value: 'biggest', label: 'Biggest change' },
                  ]}
                />
              </div>
            </div>
            <ResultsBar shown={model.rows.length} total={model.all.length} noun={model.all.length === 1 ? 'change' : 'changes'} active={filtersActive} onClear={reset} />
            {model.rows.length === 0 ? (
              <FilteredEmpty query={view.query} filters={view.direction === 'up' ? ['Increases'] : view.direction === 'down' ? ['Decreases'] : []} noun="price changes" onClear={reset} />
            ) : null}
            <Card className={`p-4 ${model.driftMonthly > 0 ? 'border-coral-100 bg-coral-50' : 'border-mint-100 bg-mint-50'}`}>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Price drift on active plans</p>
              <p className={`tabular mt-1 text-[28px] font-bold ${model.driftMonthly > 0 ? 'text-coral-700' : 'text-mint-700'}`}>
                {model.driftMonthly > 0 ? '+' : ''}
                {formatMoney(model.driftMonthly, currency)}/mo
              </p>
              <p className="text-[13px] text-muted">
                {model.driftMonthly > 0
                  ? `You pay ${formatMoney(model.driftMonthly * 12, currency)} more per year than at the original prices.`
                  : 'Your active plans cost the same or less than when you started.'}
              </p>
            </Card>
            <Card className="divide-y divide-line overflow-hidden">
              {model.rows.map(({ change, sub }) => {
                const up = change.newAmount > change.previousAmount
                const diff = change.newAmount - change.previousAmount
                const pct = Math.round((diff / change.previousAmount) * 100)
                return (
                  <button key={change.id} onClick={() => navigate(`/subscriptions/${sub.id}`)} className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left active:bg-navy-50">
                    <ServiceMark name={sub.name} color={categoryOf(sub.categoryId).color} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-semibold text-ink">{sub.name}</span>
                      <span className="block text-[13px] text-muted">
                        {formatMoney(change.previousAmount, sub.currency)} → {formatMoney(change.newAmount, sub.currency)} · {formatDate(change.effectiveDate, 'MMM yyyy')}
                      </span>
                      {change.note && <span className="block text-[12px] text-faint">{change.note}</span>}
                    </span>
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${up ? 'bg-coral-100 text-coral-700' : 'bg-mint-100 text-mint-700'}`}>
                      <Icon name={up ? 'trend' : 'trendDown'} size={12} />
                      {up ? '+' : ''}
                      {pct}%
                    </span>
                  </button>
                )
              })}
            </Card>
          </>
        )}
      </Page>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Which subscription changed price?">
        {pickable.length === 0 ? (
          <EmptyState icon="list" tone="navy" title="Nothing to log" body="Add a subscription first." actionLabel="Add subscription" onAction={() => navigate('/subscriptions/new')} />
        ) : (
          <ul className="divide-y divide-line">
            {pickable.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicker(false)
                    setTarget(s.id!)
                  }}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                >
                  <ServiceMark name={s.name} color={categoryOf(s.categoryId).color} size={36} />
                  <span className="flex-1 text-[15px] font-semibold text-ink">{s.name}</span>
                  <span className="tabular text-[13px] text-muted">{formatMoney(s.amount, s.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {targetSub && <PriceChangeSheet open={target !== null} onClose={() => setTarget(null)} subscriptionId={targetSub.id!} currentAmount={targetSub.amount} currency={targetSub.currency} />}
    </div>
  )
}
