import { useEffect, useMemo, useRef, useState } from 'react'
import { useChallengeVisit } from '@/lib/useChallengeVisit'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { markRenewed, recordActivity } from '@/db/repo'
import type { Subscription } from '@/db/schema'
import { addCycle } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { useNotes, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { categoryOf } from '@/lib/categories'
import { formatMoney } from '@/lib/money'
import { daysUntil, formatDate, formatRelative, fromISO, renewalsInRange, todayISO, toISO, type RenewalOccurrence, relativeLower } from '@/lib/dates'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Card, EmptyState, ListSkeleton, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'
import { Chip, IconButton, TextLink } from '@/components/ui/Button'
import { REASON_LABEL } from '@/lib/categories'
import type { CategoryId } from '@/db/schema'
import { CYCLE_OPTIONS, matchesCategories, matchesCycle, matchesQuery, presentCategories, type CycleFilter } from '@/lib/filters'
import { ChipRow, FilterToggle, FilteredEmpty, ResultsBar, SearchField, SortSelect, useSessionView } from '@/components/app/Filters'

interface CalendarView {
  query: string
  categories: CategoryId[]
  cycle: CycleFilter
  sort: 'date' | 'amount'
  panelOpen: boolean
}
const DEFAULT_CAL_VIEW: CalendarView = { query: '', categories: [], cycle: 'any', sort: 'date', panelOpen: false }

export default function Calendar() {
  const navigate = useNavigate()
  useChallengeVisit('calendar')
  const subs = useSubscriptions()
  const notes = useNotes()
  const profile = useProfile()
  const settings = useSettings()
  const currency = profile?.currency ?? 'USD'
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const [searchParams] = useSearchParams()
  const linkedDate = searchParams.get('date')
  const linkedMonth = searchParams.get('month')
  const [month, setMonth] = useState(() =>
    startOfMonth(
      linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate) ? fromISO(linkedDate) : linkedMonth && /^\d{4}-\d{2}$/.test(linkedMonth) ? fromISO(`${linkedMonth}-01`) : new Date(),
    ),
  )

  // Remember a month other than the current one as a position worth returning to.
  const firstMonthRender = useRef(true)
  useEffect(() => {
    if (firstMonthRender.current) {
      firstMonthRender.current = false
      return
    }
    if (isSameMonth(month, new Date())) return
    const t = window.setTimeout(
      () => recordActivity({ key: 'calendar', kind: 'calendar', title: 'Renewal calendar', subtitle: format(month, 'MMMM yyyy'), path: `/calendar?month=${format(month, 'yyyy-MM')}`, status: 'position' }),
      800,
    )
    return () => window.clearTimeout(t)
  }, [month])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [daySheet, setDaySheet] = useState<string | null>(null)
  const [justPaid, setJustPaid] = useState<{ name: string; next: string }[]>([])
  const paying = useRef(false)
  const [payingId, setPayingId] = useState<number | null>(null)
  const toast = useToast()
  const [view, patch, reset] = useSessionView<CalendarView>('calendar', DEFAULT_CAL_VIEW)

  // Opened from a subscription ("View in calendar"): land on that day with its sheet open.
  useEffect(() => {
    if (linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate)) {
      setSelectedDay(linkedDate)
      setDaySheet(linkedDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedDate])

  // Swipe left/right on the grid to move between months.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) < 48 || Math.abs(dy) > 40) return
    setSelectedDay(null)
    setMonth((m) => (dx < 0 ? addMonths(m, 1) : subMonths(m, 1)))
  }

  const filteredSubs = useMemo(
    () => (subs ?? []).filter((s) => matchesCategories(s, view.categories) && matchesCycle(s, view.cycle) && matchesQuery(s, view.query)),
    [subs, view.categories, view.cycle, view.query],
  )
  const categoryOptions = useMemo(() => presentCategories((subs ?? []).filter((s) => s.status !== 'cancelled')), [subs])
  const activeCount = (view.categories.length ? 1 : 0) + (view.cycle !== 'any' ? 1 : 0)
  const filtersActive = activeCount > 0 || view.query.trim() !== '' || view.sort !== 'date'
  const activeLabels = [
    view.categories.length ? view.categories.map((c) => categoryOf(c).name).join(', ') : null,
    view.cycle !== 'any' ? CYCLE_OPTIONS.find((o) => o.value === view.cycle)!.label : null,
  ].filter((x): x is string => !!x)

  const today = todayISO()
  const monthStart = toISO(startOfMonth(month))
  const monthEnd = toISO(endOfMonth(month))

  const model = useMemo(() => {
    if (!subs || !notes) return null
    const occurrences = renewalsInRange(filteredSubs, monthStart, monthEnd)
    const unfiltered = renewalsInRange(subs, monthStart, monthEnd).length
    const byDay = new Map<string, RenewalOccurrence[]>()
    for (const o of occurrences) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o])
    const total = occurrences.reduce((s, o) => s + o.amount, 0)
    const catMap = new Map<string, { name: string; color: string; total: number; count: number }>()
    for (const o of occurrences) {
      const c = categoryOf(o.subscription.categoryId)
      const cur = catMap.get(c.id) ?? { name: c.name, color: c.color, total: 0, count: 0 }
      cur.total += o.amount
      cur.count += 1
      catMap.set(c.id, cur)
    }
    const categories = [...catMap.values()].sort((a, b) => b.total - a.total)
    const openNotes = notes.filter((n) => n.status === 'open')
    const notesBySub = new Map<number, typeof openNotes>()
    for (const n of openNotes) notesBySub.set(n.subscriptionId, [...(notesBySub.get(n.subscriptionId) ?? []), n])
    const remaining = occurrences.filter((o) => o.date >= today).reduce((s, o) => s + o.amount, 0)
    // Charges that already happened this month: walk back from each next renewal by one billing cycle.
    const paid: RenewalOccurrence[] = []
    for (const sub of filteredSubs) {
      if (sub.status !== 'active' && sub.status !== 'trial') continue
      let d = addCycle(sub.nextRenewalDate, sub.billingCycle, -1)
      let guard = 0
      while (d >= monthStart && d >= sub.startDate && guard++ < 40) {
        if (d <= monthEnd && d < today) paid.push({ subscription: sub, date: d, amount: sub.amount })
        d = addCycle(d, sub.billingCycle, -1)
      }
    }
    paid.sort((a, b) => a.date.localeCompare(b.date))
    const paidByDay = new Map<string, RenewalOccurrence[]>()
    for (const o of paid) paidByDay.set(o.date, [...(paidByDay.get(o.date) ?? []), o])
    const paidTotal = paid.reduce((s, o) => s + o.amount, 0)
    const nextStart = toISO(startOfMonth(addMonths(fromISO(monthStart), 1)))
    const nextEnd = toISO(endOfMonth(addMonths(fromISO(monthStart), 1)))
    const nextMonth = renewalsInRange(filteredSubs, nextStart, nextEnd)
    return { occurrences, byDay, total, categories, notesBySub, remaining, unfiltered, paid, paidByDay, paidTotal, nextMonth }
  }, [subs, filteredSubs, notes, monthStart, monthEnd, today])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn })
    return eachDayOfInterval({ start, end })
  }, [month, weekStartsOn])

  const weekdayLabels = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn })
    return Array.from({ length: 7 }).map((_, i) => format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i), 'EEEEE'))
  }, [weekStartsOn])

  const timeline = useMemo(() => {
    if (!model) return []
    const list = selectedDay ? model.occurrences.filter((o) => o.date === selectedDay) : model.occurrences
    const groups: { date: string; items: RenewalOccurrence[] }[] = []
    for (const o of list) {
      const last = groups[groups.length - 1]
      if (last && last.date === o.date) last.items.push(o)
      else groups.push({ date: o.date, items: [o] })
    }
    if (view.sort === 'amount') {
      for (const g of groups) g.items.sort((a, b) => b.amount - a.amount)
      groups.sort((a, b) => b.items.reduce((s, o) => s + o.amount, 0) - a.items.reduce((s, o) => s + o.amount, 0))
    }
    return groups
  }, [model, selectedDay, view.sort])

  const isCurrentMonth = isSameMonth(month, new Date())

  return (
    <div>
      <PageHeader
        title="Renewal calendar"
        large
        subtitle={model ? `${formatMoney(model.total, currency)} due in ${format(month, 'MMMM')}` : undefined}
        right={
          !isCurrentMonth ? (
            <Chip
              selected={false}
              onClick={() => {
                setMonth(startOfMonth(new Date()))
                setSelectedDay(null)
              }}
            >
              Today
            </Chip>
          ) : undefined
        }
      />
      <Page className="space-y-5">
        <SearchField value={view.query} onChange={(q) => patch({ query: q })} placeholder="Search renewals by name" label="Search renewals" />
        <div className="flex gap-2">
          <FilterToggle open={view.panelOpen} count={activeCount} onClick={() => patch({ panelOpen: !view.panelOpen })} />
          <div className="flex-1">
            <SortSelect
              value={view.sort}
              onChange={(s) => patch({ sort: s })}
              options={[
                { value: 'date', label: 'By date' },
                { value: 'amount', label: 'Biggest first' },
              ]}
              label="Timeline"
            />
          </div>
        </div>
        {view.panelOpen && (
          <Card className="fade space-y-4 p-4">
            {categoryOptions.length > 0 && <ChipRow label="Category" options={categoryOptions} value={view.categories} onChange={(v) => patch({ categories: v as CategoryId[] })} />}
            <ChipRow label="Billing cycle" options={CYCLE_OPTIONS} value={view.cycle} onChange={(v) => patch({ cycle: v as CycleFilter })} />
          </Card>
        )}
        {model && model.unfiltered > 0 && (
          <ResultsBar shown={model.occurrences.length} total={model.unfiltered} noun={`${model.unfiltered === 1 ? 'renewal' : 'renewals'} in ${format(month, 'MMMM')}`} active={filtersActive} onClear={reset} />
        )}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <IconButton
              icon="chevronLeft"
              label="Previous month"
              onClick={() => {
                setMonth((m) => subMonths(m, 1))
                setSelectedDay(null)
              }}
            />
            <h2 className="text-[1.0625rem] font-bold text-navy-900">{format(month, 'MMMM yyyy')}</h2>
            <IconButton
              icon="chevronRight"
              label="Next month"
              onClick={() => {
                setMonth((m) => addMonths(m, 1))
                setSelectedDay(null)
              }}
            />
          </div>
          <div className="-mx-3 grid grid-cols-7 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-faint">
            {weekdayLabels.map((d, i) => (
              <span key={i} className="py-1">
                {d}
              </span>
            ))}
          </div>
          {!model ? (
            <Skeleton className="mt-2 h-56" />
          ) : (
            <div className="-mx-3 mt-1 grid grid-cols-7 gap-y-1" role="group" aria-label="Days of the month" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              {days.map((d) => {
                const iso = toISO(d)
                const inMonth = isSameMonth(d, month)
                const upcoming = model.byDay.get(iso) ?? []
                const paidItems = model.paidByDay.get(iso) ?? []
                const items = upcoming.length ? upcoming : paidItems
                const isPaidDay = upcoming.length === 0 && paidItems.length > 0
                const isToday = iso === today
                const selected = selectedDay === iso
                const dayTotal = items.reduce((s, o) => s + o.amount, 0)
                return (
                  <button
                    key={iso}
                    aria-current={selected ? 'date' : undefined}
                    aria-label={`${formatDate(iso, 'd MMMM')}${items.length ? `, ${items.length} ${isPaidDay ? 'paid' : 'renewals'}, ${formatMoney(dayTotal, currency)}` : ''}`}
                    disabled={!inMonth}
                    onClick={() => {
                      setSelectedDay(iso)
                      setJustPaid([])
                      setDaySheet(iso)
                    }}
                    className={`flex h-14 flex-col items-center justify-start rounded-xl pt-1.5 transition-colors ${
                      !inMonth ? 'text-navy-100' : selected ? 'bg-navy-900 text-white' : isToday ? 'bg-mint-100 text-navy-900' : 'text-ink hover:bg-navy-50'
                    }`}
                  >
                    <span className={`text-[0.875rem] leading-none ${isToday || items.length ? 'font-bold' : 'font-medium'}`}>{format(d, 'd')}</span>
                    {items.length > 0 && inMonth && (
                      <>
                        <span className="mt-1 flex gap-0.5">
                          {items.slice(0, 3).map((o, i) => (
                            <span key={i} className={`h-1.5 w-1.5 rounded-full ${isPaidDay ? 'opacity-40' : ''}`} style={{ background: selected ? '#5EEAD4' : categoryOf(o.subscription.categoryId).color }} />
                          ))}
                        </span>
                        <span className={`tabular mt-0.5 text-[0.625rem] font-semibold ${selected ? 'text-mint-300' : isPaidDay ? 'text-faint line-through' : 'text-muted'}`}>{formatMoney(dayTotal, currency, { compact: true }).replace(/\.00$/, '')}</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {model && model.remaining === 0 && model.paid.length > 0 && (isCurrentMonth || month < startOfMonth(new Date())) && (
          <Card className="border-mint-100 bg-mint-50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-navy-900">
                <Icon name="check" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold text-navy-900">{format(month, 'MMMM')} is settled</p>
                <p className="text-[0.8125rem] text-muted">
                  {model.paid.length > 0 ? `${model.paid.length} ${model.paid.length === 1 ? 'charge' : 'charges'} worth ${formatMoney(model.paidTotal, currency)} already went out.` : 'Nothing was charged this month.'}{' '}
                  {model.nextMonth.length > 0
                    ? `Next up: ${format(addMonths(month, 1), 'MMMM')}, ${formatMoney(model.nextMonth.reduce((s, o) => s + o.amount, 0), currency)} across ${model.nextMonth.length} ${model.nextMonth.length === 1 ? 'renewal' : 'renewals'}.`
                    : `Nothing is due in ${format(addMonths(month, 1), 'MMMM')} either.`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="mint" className="flex-1" onClick={() => { setSelectedDay(null); setMonth((m) => addMonths(m, 1)) }}>
                See {format(addMonths(month, 1), 'MMMM')}
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate('/timeline')}>
                Open timeline
              </Button>
            </div>
          </Card>
        )}

        {model && model.categories.length > 0 && (
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[0.9375rem] font-bold text-navy-900">Category totals</h3>
              {isCurrentMonth && <span className="text-[0.75rem] text-muted">{formatMoney(model.remaining, currency)} still to come</span>}
            </div>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-navy-50">
              {model.categories.map((c) => (
                <span key={c.name} style={{ width: `${(c.total / model.total) * 100}%`, background: c.color }} title={c.name} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 min-[380px]:grid-cols-2">
              {model.categories.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 text-[0.8125rem]">
                  <span className="flex min-w-0 items-center gap-2 text-ink">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="break-words">{c.name}</span>
                  </span>
                  <span className="tabular shrink-0 font-semibold text-navy-900">{formatMoney(c.total, currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[0.9375rem] font-bold text-navy-900">{selectedDay ? formatDate(selectedDay, 'EEEE d MMMM') : 'Timeline'}</h2>
            {!selectedDay && <TextLink onClick={() => navigate('/timeline')}>Rolling timeline</TextLink>}
            {selectedDay && (
              <TextLink icon={null} onClick={() => setSelectedDay(null)}>
                Show whole month
              </TextLink>
            )}
          </div>
          {!model ? (
            <ListSkeleton rows={3} />
          ) : timeline.length === 0 && filtersActive && model.unfiltered > 0 ? (
            <FilteredEmpty query={view.query} filters={activeLabels} noun="renewals" onClear={reset} />
          ) : timeline.length === 0 ? (
            <Card>
              <EmptyState
                icon="calendar"
                tone="mint"
                title={selectedDay ? 'Nothing due this day' : subs && subs.length === 0 ? 'No subscriptions yet' : `Nothing renews in ${format(month, 'MMMM')}`}
                body={
                  subs && subs.length === 0
                    ? 'Add a subscription and every renewal shows up here, so no charge catches you off guard.'
                    : selectedDay
                      ? 'A quiet day. The rest of the month is just below.'
                      : isCurrentMonth
                        ? 'A quiet month for your subscriptions. See what next month holds.'
                        : 'Nothing lands here. Jump back to the current month.'
                }
                actionLabel={subs && subs.length === 0 ? 'Add subscription' : selectedDay ? 'Show whole month' : isCurrentMonth ? `See ${format(addMonths(month, 1), 'MMMM')}` : 'Back to this month'}
                onAction={
                  subs && subs.length === 0
                    ? () => navigate('/subscriptions/new')
                    : selectedDay
                      ? () => setSelectedDay(null)
                      : isCurrentMonth
                        ? () => setMonth((m) => addMonths(m, 1))
                        : () => {
                            setMonth(startOfMonth(new Date()))
                            setSelectedDay(null)
                          }
                }
              />
            </Card>
          ) : (
            <ol className="relative space-y-4 pl-5">
              <span className="absolute top-2 bottom-2 left-[7px] w-0.5 bg-navy-100" aria-hidden="true" />
              {timeline.map((g) => {
                const past = g.date < today
                const dayTotal = g.items.reduce((s, o) => s + o.amount, 0)
                return (
                  <li key={g.date} className="relative">
                    <span className={`absolute top-1.5 -left-5 h-4 w-4 rounded-full border-4 border-canvas ${g.date === today ? 'bg-coral-500' : past ? 'bg-navy-200' : 'bg-mint-500'}`} aria-hidden="true" />
                    <div className="mb-1.5 flex items-baseline justify-between px-1">
                      <span className={`text-[0.8125rem] font-bold ${past ? 'text-faint' : 'text-navy-900'}`}>
                        {formatDate(g.date, 'EEE d MMM')}
                        <span className="ml-2 font-medium text-muted">{g.date === today ? 'Today' : formatRelative(g.date)}</span>
                      </span>
                      <span className={`tabular text-[0.8125rem] font-semibold ${past ? 'text-faint' : 'text-navy-900'}`}>{formatMoney(dayTotal, currency)}</span>
                    </div>
                    <Card className={`divide-y divide-line overflow-hidden ${past ? 'opacity-60' : ''}`}>
                      {g.items.map((o) => {
                        const cat = categoryOf(o.subscription.categoryId)
                        const subNotes = model.notesBySub.get(o.subscription.id!) ?? []
                        return (
                          <button
                            key={`${o.subscription.id}-${o.date}`}
                            onClick={() => navigate(`/subscriptions/${o.subscription.id}`)}
                            className="w-full px-4 py-3 text-left active:bg-navy-50"
                          >
                            <span className="flex items-center gap-3">
                              <ServiceMark name={o.subscription.name} color={cat.color} size={40} />
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-[0.9375rem] font-semibold text-ink">{o.subscription.name}</span>
                                <span className="block text-[0.75rem] text-muted">
                                  {cat.name}
                                  {o.subscription.status === 'trial' ? ' · trial converts to paid' : ''}
                                </span>
                              </span>
                              <span className="tabular text-[0.9375rem] font-bold text-navy-900">{formatMoney(o.amount, o.subscription.currency)}</span>
                            </span>
                            {subNotes.map((n) => (
                              <span key={n.id} className="mt-2 flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2 text-[0.8125rem] leading-snug text-coral-700">
                                <Icon name="note" size={14} className="mt-0.5 shrink-0" />
                                <span>
                                  <span className="font-semibold">{REASON_LABEL[n.reason]}</span>
                                  {n.remindOn && <span className="font-medium"> · remind {relativeLower(n.remindOn)}{daysUntil(n.remindOn) < 0 ? ' (overdue)' : ''}</span>}
                                  <span className="block text-coral-700/90">{n.content.length > 120 ? n.content.slice(0, 118) + '…' : n.content}</span>
                                </span>
                              </span>
                            ))}
                          </button>
                        )
                      })}
                    </Card>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </Page>

      <DaySheet
        day={daySheet}
        onClose={() => setDaySheet(null)}
        upcoming={daySheet && model ? (model.byDay.get(daySheet) ?? []) : []}
        paid={daySheet && model ? (model.paidByDay.get(daySheet) ?? []) : []}
        nextAfter={daySheet && model ? (model.occurrences.find((o) => o.date > daySheet) ?? model.nextMonth[0] ?? null) : null}
        justPaid={justPaid}
        payingId={payingId}
        today={today}
        currency={currency}
        onOpen={(sub) => navigate(`/subscriptions/${sub.id}`)}
        onAdd={() => daySheet && navigate(`/subscriptions/new?date=${daySheet}`)}
        onPay={async (sub) => {
          if (paying.current) return // ignore a second tap while the first is saving
          paying.current = true
          setPayingId(sub.id!)
          try {
            await markRenewed(sub.id!)
            const next = addCycle(sub.nextRenewalDate, sub.billingCycle)
            setJustPaid((list) => [...list, { name: sub.name, next }])
            toast.success(`${sub.name} marked as paid · next ${formatDate(next, 'd MMM')}`)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not mark as paid')
          } finally {
            paying.current = false
            setPayingId(null)
          }
        }}
      />
    </div>
  )
}

function DaySheet({
  day,
  onClose,
  upcoming,
  paid,
  nextAfter,
  justPaid,
  payingId,
  today,
  currency,
  onOpen,
  onAdd,
  onPay,
}: {
  day: string | null
  onClose: () => void
  upcoming: RenewalOccurrence[]
  paid: RenewalOccurrence[]
  nextAfter: RenewalOccurrence | null
  justPaid: { name: string; next: string }[]
  payingId: number | null
  today: string
  currency: string
  onOpen: (sub: Subscription) => void
  onAdd: () => void
  onPay: (sub: Subscription) => void
}) {
  const total = upcoming.reduce((s, o) => s + o.amount, 0) + paid.reduce((s, o) => s + o.amount, 0)
  const isPast = !!day && day < today
  const isToday = day === today
  const allLogged = justPaid.length > 0 && upcoming.length === 0
  return (
    <Sheet open={day !== null} onClose={onClose} title={day ? formatDate(day, 'EEEE d MMMM') : undefined}>
      {day && (
        <>
          {allLogged ? (
            <div className="fade rounded-2xl bg-mint-50 p-4">
              <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-navy-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-mint-500 text-navy-900">
                  <Icon name="check" size={16} />
                </span>
                {isToday ? "Today's charges are logged" : 'All charges for this day are logged'}
              </p>
              <ul className="mt-2 space-y-1 text-[0.8125rem] text-muted">
                {justPaid.map((p, i) => (
                  <li key={i}>
                    {p.name} paid · next {formatDate(p.next, 'd MMM')}
                  </li>
                ))}
              </ul>
              {nextAfter && (
                <p className="mt-2 text-[0.8125rem] text-navy-800">
                  Next up: <span className="font-semibold">{nextAfter.subscription.name}</span> on {formatDate(nextAfter.date, 'EEE d MMM')} for {formatMoney(nextAfter.amount, currency)}.
                </p>
              )}
            </div>
          ) : upcoming.length + paid.length === 0 ? (
            <p className="rounded-2xl bg-navy-50 px-4 py-3 text-[0.875rem] text-navy-800">{isPast ? 'Nothing was charged on this day.' : 'Nothing is due on this day.'}</p>
          ) : (
            <>
              <p className="tabular text-[0.8125rem] text-muted">
                {upcoming.length + paid.length} {upcoming.length + paid.length === 1 ? 'charge' : 'charges'} · {formatMoney(total, currency)}
              </p>
              <ul className="mt-2 divide-y divide-line">
                {[...paid.map((o) => ({ o, done: true })), ...upcoming.map((o) => ({ o, done: false }))].map(({ o, done }) => {
                  const sub = o.subscription
                  const cat = categoryOf(sub.categoryId)
                  return (
                    <li key={`${sub.id}-${done}`} className="py-3">
                      <div className="flex items-center gap-3">
                        <ServiceMark name={sub.name} color={done ? '#A0AEC0' : cat.color} size={40} />
                        <button type="button" onClick={() => onOpen(sub)} className="min-h-11 min-w-0 flex-1 text-left">
                          <span className="block text-[0.9375rem] font-semibold text-ink">{sub.name}</span>
                          <span className="block text-[0.75rem] text-muted">
                            {cat.name}
                            {done ? ' · paid' : sub.status === 'trial' ? ' · trial converts' : ''}
                          </span>
                        </button>
                        <span className={`tabular text-[0.9375rem] font-bold ${done ? 'text-faint line-through' : 'text-navy-900'}`}>{formatMoney(o.amount, sub.currency)}</span>
                      </div>
                      {!done && day <= today && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="mint" className="flex-1" loading={payingId === sub.id} disabled={payingId !== null} onClick={() => onPay(sub)} leading={<Icon name="check" size={16} />}>
                            Mark as paid
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => onOpen(sub)}>
                            Open
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          <Button full size="lg" variant={allLogged ? 'primary' : 'secondary'} className="mt-4" onClick={allLogged ? onClose : onAdd} leading={<Icon name={allLogged ? 'check' : 'plus'} size={18} />}>
            {allLogged ? 'Done' : 'Add a subscription renewing this day'}
          </Button>
        </>
      )}
    </Sheet>
  )
}
