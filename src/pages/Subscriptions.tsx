import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotes, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import type { CategoryId, SubscriptionStatus } from '@/db/schema'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { formatMoney, monthlyEquivalent } from '@/lib/money'
import { canAddSubscription, countedForLimit, isPremium } from '@/lib/plan'
import { categoryOf } from '@/lib/categories'
import {
  CYCLE_OPTIONS,
  RENEWING_OPTIONS,
  SORT_OPTIONS,
  matchesCategories,
  matchesCycle,
  matchesQuery,
  matchesRenewing,
  presentCategories,
  sortSubscriptions,
  type CycleFilter,
  type RenewingFilter,
  type SubscriptionSort,
} from '@/lib/filters'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card, EmptyState, ListSkeleton } from '@/components/ui/Primitives'
import { loadSamples } from '@/db/repo'
import { useToast } from '@/components/ui/Toast'
import { Chip, Fab } from '@/components/ui/Button'
import { SubscriptionRow } from '@/components/app/SubscriptionRow'
import { PaywallSheet, UpgradeBanner } from '@/components/app/Paywall'
import { ChipRow, FilterToggle, FilteredEmpty, ResultsBar, SearchField, SortSelect, useSessionView } from '@/components/app/Filters'

type StatusFilter = 'all' | SubscriptionStatus

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trials' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface View {
  query: string
  status: StatusFilter
  categories: CategoryId[]
  cycle: CycleFilter
  renewing: RenewingFilter
  sort: SubscriptionSort
  panelOpen: boolean
}

const DEFAULT_VIEW: View = { query: '', status: 'all', categories: [], cycle: 'any', renewing: 'any', sort: 'renewal', panelOpen: false }

export default function Subscriptions() {
  const navigate = useNavigate()
  const subs = useSubscriptions()
  const profile = useProfile()
  const settings = useSettings()
  const notes = useNotes()
  const [view, patch, reset] = useSessionView<View>('subscriptions', DEFAULT_VIEW)
  const [paywall, setPaywall] = useState(false)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const toast = useToast()

  const explore = async () => {
    setLoadingSamples(true)
    try {
      await loadSamples()
      toast.success('Ten sample subscriptions added. Edit or delete them any time.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load samples')
    } finally {
      setLoadingSamples(false)
    }
  }

  const openNoteIds = useMemo(() => new Set((notes ?? []).filter((n) => n.status === 'open').map((n) => n.subscriptionId)), [notes])

  // The base list respects the "show cancelled" setting unless the user explicitly asks for cancelled ones.
  const base = useMemo(() => {
    if (!subs) return undefined
    const showCancelled = settings?.showCancelledInList ?? false
    return view.status === 'all' && !showCancelled ? subs.filter((s) => s.status !== 'cancelled') : subs
  }, [subs, settings, view.status])

  const list = useMemo(() => {
    if (!base) return undefined
    const filtered = base.filter(
      (s) =>
        (view.status === 'all' || s.status === view.status) &&
        matchesCategories(s, view.categories) &&
        matchesCycle(s, view.cycle) &&
        matchesRenewing(s, view.renewing) &&
        matchesQuery(s, view.query),
    )
    return sortSubscriptions(filtered, view.sort)
  }, [base, view])

  const categoryOptions = useMemo(() => presentCategories(base ?? []), [base])
  const activeCount = (view.status !== 'all' ? 1 : 0) + (view.categories.length ? 1 : 0) + (view.cycle !== 'any' ? 1 : 0) + (view.renewing !== 'any' ? 1 : 0)
  const filtersActive = activeCount > 0 || view.query.trim() !== '' || view.sort !== 'renewal'
  const activeLabels = [
    view.status !== 'all' ? STATUS_OPTIONS.find((o) => o.value === view.status)!.label : null,
    view.categories.length ? view.categories.map((c) => categoryOf(c).name).join(', ') : null,
    view.cycle !== 'any' ? CYCLE_OPTIONS.find((o) => o.value === view.cycle)!.label : null,
    view.renewing !== 'any' ? RENEWING_OPTIONS.find((o) => o.value === view.renewing)!.label : null,
  ].filter((x): x is string => !!x)

  const clear = () => reset()
  const used = subs ? countedForLimit(subs) : 0
  const currency = profile?.currency ?? 'USD'

  const onAdd = () => {
    if (!subs) return
    if (canAddSubscription(profile, subs)) navigate('/subscriptions/new')
    else setPaywall(true)
  }

  return (
    <div>
      <PageHeader title="Subscriptions" large subtitle={subs ? `${used} tracked · ${formatMoney(monthlyEquivalent(subs), currency)} per month` : undefined} />
      <Page className="space-y-4 pb-20">
        <SearchField value={view.query} onChange={(q) => patch({ query: q })} placeholder="Search name, card, notes or price" label="Search subscriptions" />

        <div className="flex flex-wrap gap-2" aria-label="Filter by status">
          {STATUS_OPTIONS.map((o) => (
            <Chip key={o.value} selected={view.status === o.value} onClick={() => patch({ status: o.value })}>
              {o.label}
            </Chip>
          ))}
        </div>

        <div className="flex gap-2">
          <FilterToggle open={view.panelOpen} count={activeCount - (view.status !== 'all' ? 1 : 0)} onClick={() => patch({ panelOpen: !view.panelOpen })} />
          <div className="flex-1">
            <SortSelect value={view.sort} onChange={(s) => patch({ sort: s })} options={SORT_OPTIONS} />
          </div>
        </div>

        {view.panelOpen && (
          <Card className="fade space-y-4 p-4">
            {categoryOptions.length > 0 && <ChipRow label="Category" options={categoryOptions} value={view.categories} onChange={(v) => patch({ categories: v as CategoryId[] })} />}
            <ChipRow label="Billing cycle" options={CYCLE_OPTIONS} value={view.cycle} onChange={(v) => patch({ cycle: v as CycleFilter })} />
            <ChipRow label="Renewing" options={RENEWING_OPTIONS} value={view.renewing} onChange={(v) => patch({ renewing: v as RenewingFilter })} />
          </Card>
        )}

        {base && list && base.length > 0 && (
          <ResultsBar
            shown={list.length}
            total={base.length}
            noun={base.length === 1 ? 'subscription' : 'subscriptions'}
            active={filtersActive}
            onClear={clear}
            extra={profile && !isPremium(profile) && used >= FREE_SUBSCRIPTION_LIMIT - 2 && used < FREE_SUBSCRIPTION_LIMIT ? ` · ${used} of ${FREE_SUBSCRIPTION_LIMIT} free` : undefined}
          />
        )}

        {profile && !isPremium(profile) && used >= FREE_SUBSCRIPTION_LIMIT && <UpgradeBanner used={used} compact />}

        {!list || !base ? (
          <ListSkeleton rows={5} />
        ) : subs && subs.length === 0 ? (
          <Card>
            <EmptyState icon="list" title="Know what you pay for" body="Add the subscriptions that leave your account each month and your total, renewals and reminders take care of themselves." actionLabel="Add your first subscription" onAction={onAdd} />
            <div className="px-6 pb-6 text-center">
              <button type="button" onClick={explore} disabled={loadingSamples} className="h-11 text-[14px] font-semibold text-navy-700 underline decoration-mint-500 decoration-2 underline-offset-2 disabled:opacity-60">
                {loadingSamples ? 'Adding samples…' : 'Or explore with sample data'}
              </button>
            </div>
          </Card>
        ) : base.length === 0 && !filtersActive ? (
          subs && subs.length > 0 ? (
            <Card>
              <EmptyState
                icon="list"
                tone="navy"
                title="No active subscriptions"
                body={`${subs.length} cancelled ${subs.length === 1 ? 'plan is' : 'plans are'} kept for their history. Add a new subscription or look at the cancelled ones.`}
                actionLabel="Add a subscription"
                onAction={onAdd}
              />
              <div className="px-6 pb-6 text-center">
                <button type="button" onClick={() => patch({ status: 'cancelled' })} className="h-11 text-[14px] font-semibold text-navy-700 underline decoration-mint-500 decoration-2 underline-offset-2">
                  Show cancelled
                </button>
              </div>
            </Card>
          ) : null
        ) : list.length === 0 ? (
          <FilteredEmpty query={view.query} filters={activeLabels} noun="subscriptions" onClear={clear} />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((s) => (
              <SubscriptionRow key={s.id} sub={s} hasOpenNote={openNoteIds.has(s.id!)} />
            ))}
          </Card>
        )}
      </Page>
      <Fab onClick={onAdd}>Add subscription</Fab>
      <PaywallSheet open={paywall} onClose={() => setPaywall(false)} />
    </div>
  )
}
