import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { recordActivity, updateSettings } from '@/db/repo'
import type { CategoryId } from '@/db/schema'
import { useNotes, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { categoryOf, REASON_LABEL } from '@/lib/categories'
import { formatMoney } from '@/lib/money'
import { daysFromToday, daysUntil, formatDate, relativeLower, renewalsInRange, todayISO, type RenewalOccurrence } from '@/lib/dates'
import { buildRenewalCalendar, buildTimelineSummary } from '@/lib/ics'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button, Chip, IconButton, TextLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card, EmptyState, ListSkeleton, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useSessionView } from '@/components/app/Filters'
import { NoteSheet } from './SubscriptionDetail'

const HORIZONS = [7, 14, 30, 60, 90] as const
type Horizon = (typeof HORIZONS)[number]

interface TimelineView {
  horizon: Horizon
  category: CategoryId | null
}
const DEFAULT_VIEW: TimelineView = { horizon: 30, category: null }

/** Smoothly count a number up or down when it changes; small, but it makes the total feel alive. */
function useCountUp(value: number, ms = 420): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(begin + (value - begin) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

function bucketFor(iso: string): string {
  const d = daysUntil(iso)
  if (d <= 0) return 'Today'
  if (d <= 6) return 'This week'
  if (d <= 13) return 'Next week'
  return formatDate(iso, 'MMMM')
}

export default function Timeline() {
  const navigate = useNavigate()
  const toast = useToast()
  const subs = useSubscriptions()
  const notes = useNotes()
  const profile = useProfile()
  const settings = useSettings()
  const currency = profile?.currency ?? 'USD'
  const lead = settings?.defaultReminderDays ?? 3
  const [view, patch, reset] = useSessionView<TimelineView>('timeline', DEFAULT_VIEW)
  const [searchParams] = useSearchParams()
  const [expanded, setExpanded] = useState<string | null>(null)

  // A saved position ("Continue" on Home) arrives as ?h=60&cat=streaming.
  useEffect(() => {
    const h = Number(searchParams.get('h'))
    const cat = searchParams.get('cat')
    const next: Partial<TimelineView> = {}
    if ((HORIZONS as readonly number[]).includes(h)) next.horizon = h as Horizon
    if (cat !== null) next.category = cat === '' ? null : (cat as CategoryId)
    if (Object.keys(next).length) patch(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Remember a non-default view as a position worth returning to.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (view.horizon === DEFAULT_VIEW.horizon && view.category === null) return
    const t = window.setTimeout(() => {
      const catName = view.category ? categoryOf(view.category).name : null
      recordActivity({
        key: 'timeline',
        kind: 'timeline',
        title: 'Renewal timeline',
        subtitle: `Next ${view.horizon} days${catName ? ` · ${catName}` : ''}`,
        path: `/timeline?h=${view.horizon}&cat=${view.category ?? ''}`,
        status: 'position',
      })
    }, 800)
    return () => window.clearTimeout(t)
  }, [view.horizon, view.category])
  const [noteFor, setNoteFor] = useState<RenewalOccurrence | null>(null)
  const [copyText, setCopyText] = useState<string | null>(null)

  const model = useMemo(() => {
    if (!subs || !notes) return null
    const occurrences = renewalsInRange(subs, todayISO(), daysFromToday(view.horizon))
    const total = occurrences.reduce((s, o) => s + o.amount, 0)
    const catMap = new Map<CategoryId, { id: CategoryId; name: string; color: string; total: number; count: number }>()
    for (const o of occurrences) {
      const c = categoryOf(o.subscription.categoryId)
      const cur = catMap.get(c.id) ?? { id: c.id, name: c.name, color: c.color, total: 0, count: 0 }
      cur.total += o.amount
      cur.count += 1
      catMap.set(c.id, cur)
    }
    const categories = [...catMap.values()].sort((a, b) => b.total - a.total)
    const openNotes = notes.filter((n) => n.status === 'open')
    const notesBySub = new Map<number, typeof openNotes>()
    for (const n of openNotes) notesBySub.set(n.subscriptionId, [...(notesBySub.get(n.subscriptionId) ?? []), n])
    // Group by bucket, carrying a running total so the list reads like a bank statement.
    let running = 0
    const groups: { label: string; items: { occ: RenewalOccurrence; running: number; key: string }[]; total: number }[] = []
    for (const occ of occurrences) {
      running += occ.amount
      const label = bucketFor(occ.date)
      const last = groups[groups.length - 1]
      const entry = { occ, running, key: `${occ.subscription.id}:${occ.date}` }
      if (last && last.label === label) {
        last.items.push(entry)
        last.total += occ.amount
      } else groups.push({ label, items: [entry], total: occ.amount })
    }
    const highlightedTotal = view.category ? (catMap.get(view.category)?.total ?? 0) : total
    return { occurrences, total, categories, notesBySub, groups, highlightedTotal, openNotes }
  }, [subs, notes, view.horizon, view.category])

  const animatedTotal = useCountUp(model?.highlightedTotal ?? 0)
  const introSeen = settings?.timelineIntroSeen ?? false
  const selectedCat = view.category ? categoryOf(view.category) : null

  const download = () => {
    if (!model) return
    try {
      const ics = buildRenewalCalendar(model.occurrences, model.openNotes, lead)
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `renewals-next-${view.horizon}-days.ics`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast.success(`${model.occurrences.length} ${model.occurrences.length === 1 ? 'renewal' : 'renewals'} saved as a calendar file`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the calendar file')
    }
  }

  const copy = async () => {
    if (!model) return
    const text = buildTimelineSummary(model.occurrences, model.openNotes, model.categories, view.horizon, currency, (iso) => formatDate(iso, 'EEE d MMM'))
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Summary copied. Paste it anywhere.')
    } catch {
      setCopyText(text) // clipboard blocked: show the text so it can still be copied by hand
    }
  }

  return (
    <div>
      <PageHeader
        title="Renewal timeline"
        large
        back
        backTo="/"
        subtitle={model ? `${model.occurrences.length} ${model.occurrences.length === 1 ? 'charge' : 'charges'} in the next ${view.horizon} days` : undefined}
        right={
          <IconButton
            icon="info"
            label="How to read the timeline"
            onClick={() => updateSettings({ timelineIntroSeen: false })}
          />
        }
      />
      <Page className="space-y-4 pb-24">
        {!introSeen && settings && (
          <Card className="fade border-navy-800 bg-navy-900 p-4 text-white">
            <p className="text-[15px] font-semibold">Your money, in the order it leaves</p>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-navy-100">
              <li className="flex gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mint-400" /> Each row is one charge, with a running total so you can see what a week really costs.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-coral-400" /> Drag the slider to look further ahead. Tap a category to light up its charges.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white" /> Tap any charge to leave yourself a note before it renews, then save the whole timeline to your calendar.
              </li>
            </ul>
            <Button size="sm" variant="mint" className="mt-3" onClick={() => updateSettings({ timelineIntroSeen: true })}>
              Got it
            </Button>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">{selectedCat ? `${selectedCat.name} in the next ${view.horizon} days` : `Leaving your account in ${view.horizon} days`}</p>
              {model ? <p className="tabular text-[34px] font-bold leading-none text-navy-900">{formatMoney(animatedTotal, currency)}</p> : <Skeleton className="mt-1 h-9 w-32" />}
            </div>
            {selectedCat && (
              <TextLink icon={null} onClick={() => patch({ category: null })}>
                Show all
              </TextLink>
            )}
          </div>
          <label className="mt-4 block">
            <span className="sr-only">Days ahead</span>
            <input
              type="range"
              min={0}
              max={HORIZONS.length - 1}
              step={1}
              value={HORIZONS.indexOf(view.horizon)}
              onChange={(e) => patch({ horizon: HORIZONS[Number(e.target.value)] })}
              aria-valuetext={`${view.horizon} days`}
              className="horizon w-full"
            />
          </label>
          <div className="mt-1 flex justify-between" role="group" aria-label="Days ahead">
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => patch({ horizon: h })}
                aria-pressed={view.horizon === h}
                className={`h-11 min-w-11 rounded-full px-2 text-[13px] font-semibold ${view.horizon === h ? 'bg-navy-900 text-white' : 'text-muted'}`}
              >
                {h}d
              </button>
            ))}
          </div>
        </Card>

        {model && model.categories.length > 0 && (
          <Card className="p-4">
            <p className="text-[15px] font-bold text-navy-900">Category totals</p>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-navy-50">
              {model.categories.map((c) => (
                <div
                  key={c.id}
                  aria-hidden="true"
                  title={`${c.name} ${formatMoney(c.total, currency)}`}
                  className="transition-opacity"
                  style={{ width: `${(c.total / model.total) * 100}%`, background: c.color, opacity: view.category && view.category !== c.id ? 0.25 : 1 }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {model.categories.map((c) => (
                <Chip key={c.id} selected={view.category === c.id} onClick={() => patch({ category: view.category === c.id ? null : c.id })} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                  <span className={`tabular text-[12px] ${view.category === c.id ? 'text-mint-300' : 'text-muted'}`}>{formatMoney(c.total, currency)}</span>
                </Chip>
              ))}
            </div>
          </Card>
        )}

        {!model ? (
          <ListSkeleton rows={4} />
        ) : subs && subs.length === 0 ? (
          <Card>
            <EmptyState icon="calendar" title="No subscriptions yet" body="Add one and its renewals appear here in the order they will be charged." actionLabel="Add subscription" onAction={() => navigate('/subscriptions/new')} />
          </Card>
        ) : model.occurrences.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar"
              tone="mint"
              title={`Nothing in the next ${view.horizon} days`}
              body={
                view.category
                  ? `No ${categoryOf(view.category).name.toLowerCase()} charges in this window. Show every category to see the full picture.`
                  : view.horizon < 90
                    ? 'No money leaves for a while. Look further ahead to see what is coming.'
                    : 'No renewals in the next three months. Your subscriptions are still tracked and will appear as soon as one is due.'
              }
              actionLabel={view.category ? 'Show all categories' : view.horizon < 90 ? 'Look 90 days ahead' : 'Review subscriptions'}
              onAction={view.category ? () => patch({ category: null }) : view.horizon < 90 ? () => patch({ horizon: 90 }) : () => navigate('/subscriptions')}
            />
          </Card>
        ) : (
          <ol className="relative space-y-5 pl-5" aria-label="Timeline">
            <span className="absolute top-2 bottom-2 left-[7px] w-0.5 bg-navy-100" aria-hidden="true" />
            {model.groups.map((g) => (
              <li key={g.label} className="relative">
                <span className={`absolute top-1.5 -left-5 h-4 w-4 rounded-full border-4 border-canvas ${g.label === 'Today' || g.label === 'This week' ? 'bg-coral-500' : 'bg-mint-500'}`} aria-hidden="true" />
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <span className="text-[13px] font-bold text-navy-900">{g.label}</span>
                  <span className="tabular text-[13px] font-semibold text-muted">{formatMoney(g.total, currency)}</span>
                </div>
                <Card className="divide-y divide-line overflow-hidden">
                  {g.items.map(({ occ, running, key }) => {
                    const sub = occ.subscription
                    const cat = categoryOf(sub.categoryId)
                    const dim = view.category !== null && view.category !== sub.categoryId
                    const subNotes = model.notesBySub.get(sub.id!) ?? []
                    const open = expanded === key
                    return (
                      <div key={key} className={`transition-opacity ${dim ? 'opacity-35' : ''}`}>
                        <button type="button" onClick={() => setExpanded(open ? null : key)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-navy-50">
                          <ServiceMark name={sub.name} color={cat.color} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-[15px] font-semibold text-ink">{sub.name}</span>
                            <span className={`block text-[12px] ${daysUntil(occ.date) <= lead ? 'font-semibold text-coral-700' : 'text-muted'}`}>
                              {formatDate(occ.date, 'EEE d MMM')} · {relativeLower(occ.date)}
                              {sub.status === 'trial' ? ' · trial converts' : ''}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="tabular block text-[15px] font-bold text-navy-900">{formatMoney(occ.amount, sub.currency)}</span>
                            <span className="tabular block text-[11px] text-faint">so far {formatMoney(running, currency)}</span>
                          </span>
                        </button>
                        {subNotes.map((n) => (
                          <p key={n.id} className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2 text-[13px] leading-snug text-coral-700">
                            <Icon name="note" size={14} className="mt-0.5 shrink-0" />
                            <span>
                              <span className="font-semibold">{REASON_LABEL[n.reason]}</span>
                              {n.remindOn && <span> · remind {relativeLower(n.remindOn)}</span>}
                              <span className="block text-coral-700/90">{n.content}</span>
                            </span>
                          </p>
                        ))}
                        {open && (
                          <div className="fade flex gap-2 px-4 pb-3">
                            <Button size="sm" variant="secondary" className="flex-1" leading={<Icon name="note" size={16} />} onClick={() => setNoteFor(occ)}>
                              Add note
                            </Button>
                            <Button size="sm" variant="ghost" className="flex-1" leading={<Icon name="external" size={16} />} onClick={() => navigate(`/subscriptions/${sub.id}`)}>
                              Open
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              </li>
            ))}
          </ol>
        )}

        {model && model.occurrences.length > 0 && (
          <p className="px-1 text-center text-[12px] text-faint">
            {model.openNotes.filter((n) => model.occurrences.some((o) => o.subscription.id === n.subscriptionId)).length} {model.openNotes.filter((n) => model.occurrences.some((o) => o.subscription.id === n.subscriptionId)).length === 1 ? 'note' : 'notes'} on this timeline.{' '}
            {view.category || view.horizon !== 30 ? (
              <button type="button" onClick={reset} className="font-semibold text-navy-700 underline decoration-mint-500 decoration-2 underline-offset-2">
                Reset view
              </button>
            ) : null}
          </p>
        )}
      </Page>

      {model && model.occurrences.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[480px] gap-2 px-4 py-3">
            <Button size="sm" className="min-h-12 flex-1 whitespace-nowrap" variant="mint" onClick={download}>
              Add to calendar
            </Button>
            <Button size="sm" className="min-h-12 flex-1 whitespace-nowrap" variant="secondary" onClick={copy}>
              Copy summary
            </Button>
          </div>
        </div>
      )}

      {noteFor && (
        <NoteSheet
          open={noteFor !== null}
          onClose={() => setNoteFor(null)}
          subscriptionId={noteFor.subscription.id!}
          defaultRemindOn={daysFromToday(Math.max(0, daysUntil(noteFor.date) - lead))}
        />
      )}
      <Sheet open={copyText !== null} onClose={() => setCopyText(null)} title="Copy your summary">
        <p className="text-[14px] text-muted">Your browser blocked automatic copying. Select the text below and copy it.</p>
        <textarea readOnly value={copyText ?? ''} onFocus={(e) => e.target.select()} className="mt-3 h-56 w-full rounded-2xl border border-line bg-canvas p-3 font-mono text-[12px] text-ink" />
        <Button full size="lg" variant="secondary" className="mt-3" onClick={() => setCopyText(null)}>
          Done
        </Button>
      </Sheet>
    </div>
  )
}
