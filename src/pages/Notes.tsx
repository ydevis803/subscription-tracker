import { useMemo, useRef, useState } from 'react'
import { describeError } from '@/lib/errors'
import { useNavigate } from 'react-router-dom'
import { decideNote, deleteNote, snoozeNote, updateNote } from '@/db/repo'
import { useNotes, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { notesProgress } from '@/lib/progress'
import { daysFromToday, renewalsInRange, todayISO } from '@/lib/dates'
import { ProgressBar } from '@/components/ui/Primitives'
import { categoryOf, REASON_LABEL } from '@/lib/categories'
import { daysUntil, relativeLower } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Badge, Card, EmptyState, ListSkeleton, ServiceMark } from '@/components/ui/Primitives'
import { Icon } from '@/components/ui/Icon'
import { Button, IconButton, TextLink } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { NoteSheet } from './SubscriptionDetail'
import type { CancellationReason } from '@/db/schema'
import { FilteredEmpty, ResultsBar, SearchField, ChipRow, useSessionView } from '@/components/app/Filters'

interface NotesView {
  query: string
  reasons: CancellationReason[]
}
const DEFAULT_NOTES_VIEW: NotesView = { query: '', reasons: [] }
const REASON_OPTIONS = (Object.keys(REASON_LABEL) as CancellationReason[]).map((r) => ({ value: r, label: REASON_LABEL[r] }))

export default function Notes() {
  const navigate = useNavigate()
  const toast = useToast()
  const notes = useNotes()
  const subs = useSubscriptions()
  const settings = useSettings()
  const profile = useProfile()
  const currency = profile?.currency ?? 'USD'
  const lead = settings?.defaultReminderDays ?? 3
  const progress = useMemo(() => (notes && subs ? notesProgress(notes, subs, lead) : null), [notes, subs, lead])
  const suggestions = useMemo(() => {
    if (!subs || !notes) return []
    const noted = new Set(notes.filter((n) => n.status === 'open').map((n) => n.subscriptionId))
    return renewalsInRange(subs, todayISO(), daysFromToday(30)).filter((o) => !noted.has(o.subscription.id!)).slice(0, 3)
  }, [subs, notes])
  const [picker, setPicker] = useState(false)
  const [target, setTarget] = useState<number | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [view, patch, reset] = useSessionView<NotesView>('notes', DEFAULT_NOTES_VIEW)
  const filtersActive = view.query.trim() !== '' || view.reasons.length > 0

  const model = useMemo(() => {
    if (!notes || !subs) return null
    const subById = new Map(subs.map((s) => [s.id!, s]))
    const q = view.query.trim().toLowerCase()
    const allRows = notes.map((n) => ({ note: n, sub: subById.get(n.subscriptionId) })).filter((r) => r.sub)
    const rows = allRows.filter((r) => (view.reasons.length === 0 || view.reasons.includes(r.note.reason)) && (!q || r.note.content.toLowerCase().includes(q) || r.sub!.name.toLowerCase().includes(q)))
    const totalOpen = allRows.filter((r) => r.note.status === 'open').length
    const open = rows
      .filter((r) => r.note.status === 'open')
      .sort((a, b) => (a.note.remindOn ?? '9999').localeCompare(b.note.remindOn ?? '9999'))
    const done = rows.filter((r) => r.note.status === 'done').sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
    return { open, done, totalOpen, totalAll: allRows.length }
  }, [notes, subs, view])

  const lock = useRef(false)
  const [busyAction, setBusyAction] = useState(false)
  const act = async (label: string, fn: () => Promise<void>) => {
    if (lock.current) return // a second tap while the first is saving must not apply twice
    lock.current = true
    setBusyAction(true)
    try {
      await fn()
      toast.success(label)
    } catch (e) {
      toast.error(describeError(e, 'update the note'))
    } finally {
      lock.current = false
      setBusyAction(false)
    }
  }

  const targetSub = subs?.find((s) => s.id === target)

  return (
    <div>
      <PageHeader
        title="Cancellation notes"
        back
        backTo="/"
        right={
          <IconButton icon="plus" label="Add note" variant="primary" onClick={() => setPicker(true)} />
        }
      />
      <Page className="space-y-4">
        {!model || !progress ? (
          <ListSkeleton rows={3} />
        ) : model.totalAll === 0 ? (
          <>
            <Card>
              <EmptyState icon="note" title="Decide before it renews" body="A note is a reminder to yourself: why you might cancel, and when to decide. Each decision you make counts toward your progress here." actionLabel="Write your first note" onAction={() => setPicker(true)} />
            </Card>
            {suggestions.length > 0 && (
              <Card className="p-4">
                <p className="text-[15px] font-bold text-navy-900">Start with what renews soonest</p>
                <ul className="mt-2 divide-y divide-line">
                  {suggestions.map((o) => (
                    <li key={`${o.subscription.id}-${o.date}`} className="flex items-center gap-3 py-2">
                      <ServiceMark name={o.subscription.name} color={categoryOf(o.subscription.categoryId).color} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-ink">{o.subscription.name}</span>
                        <span className="block text-[12px] text-muted">{formatMoney(o.amount, o.subscription.currency)} · renews {relativeLower(o.date)}</span>
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => setTarget(o.subscription.id!)}>
                        Add note
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Decisions made</p>
                  <p className="tabular text-[28px] font-bold leading-none text-navy-900">
                    {progress.done} <span className="text-[16px] font-semibold text-muted">of {progress.total}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Freed per month</p>
                  <p className={`tabular text-[22px] font-bold leading-none ${progress.freedMonthly > 0 ? 'text-mint-700' : 'text-navy-900'}`}>{formatMoney(progress.freedMonthly, currency)}</p>
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={progress.done} max={Math.max(progress.total, 1)} tone={progress.overdue > 0 ? 'coral' : 'mint'} />
              </div>
              <p className="mt-2 text-[13px] text-muted">
                {progress.open === 0
                  ? 'Everything is decided.'
                  : `${progress.open} still to decide${progress.overdue > 0 ? ` · ${progress.overdue} overdue` : progress.dueSoon > 0 ? ` · ${progress.dueSoon} due within ${lead} ${lead === 1 ? 'day' : 'days'}` : ''}`}
                {progress.decidedThisWeek > 0 ? ` · ${progress.decidedThisWeek} decided this week` : ''}
              </p>
              <p className="mt-2 flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2 text-[13px] text-navy-800">
                <Icon name="sparkle" size={16} className="shrink-0 text-mint-700" />
                <span>
                  {progress.nextDecisionMilestone !== null
                    ? `${progress.nextDecisionMilestone - progress.done} more ${progress.nextDecisionMilestone - progress.done === 1 ? 'decision' : 'decisions'} to reach ${progress.nextDecisionMilestone}.`
                    : 'Fifty decisions made. You are running this.'}
                  {progress.nextFreedMilestone !== null && progress.freedMonthly > 0 && ` Free ${formatMoney(progress.nextFreedMilestone - progress.freedMonthly, currency)} more a month to reach ${formatMoney(progress.nextFreedMilestone, currency, { compact: true })}/mo.`}
                </span>
              </p>
            </Card>

            {progress.nextUp && (
              <Card className={`p-4 ${progress.nextUp.note.remindOn && progress.nextUp.note.remindOn < todayISO() ? 'border-coral-100' : 'border-mint-100'}`}>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Next up</p>
                <button onClick={() => navigate(`/subscriptions/${progress.nextUp!.sub.id}`)} className="mt-2 flex w-full items-center gap-3 text-left">
                  <ServiceMark name={progress.nextUp.sub.name} color={categoryOf(progress.nextUp.sub.categoryId).color} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{progress.nextUp.sub.name}</span>
                    <span className="block text-[12px] text-muted">
                      {formatMoney(progress.nextUp.sub.amount, progress.nextUp.sub.currency)}
                      {progress.nextUp.sub.status === 'cancelled' ? ' · cancelled' : ` · renews ${relativeLower(progress.nextUp.sub.nextRenewalDate)}`}
                      {progress.nextUp.note.remindOn ? ` · decide ${relativeLower(progress.nextUp.note.remindOn)}${progress.nextUp.note.remindOn < todayISO() ? ' (overdue)' : ''}` : ''}
                    </span>
                  </span>
                </button>
                <p className="mt-2 text-[14px] leading-relaxed text-ink">{progress.nextUp.note.content}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button size="sm" variant="mint" loading={busyAction} disabled={busyAction} onClick={() => act(`Keeping ${progress.nextUp!.sub.name}`, () => decideNote(progress.nextUp!.note.id!, 'keep'))} leading={<Icon name="check" size={16} />}>
                    Keep
                  </Button>
                  <Button size="sm" variant="danger" disabled={busyAction || progress.nextUp.sub.status === 'cancelled'} onClick={() => act(`${progress.nextUp!.sub.name} cancelled`, () => decideNote(progress.nextUp!.note.id!, 'cancel'))} leading={<Icon name="x" size={16} />}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyAction} onClick={() => act('Reminder moved 3 days', async () => { await snoozeNote(progress.nextUp!.note.id!, 3) })} leading={<Icon name="clock" size={16} />}>
                    Snooze
                  </Button>
                </div>
              </Card>
            )}

            {progress.open === 0 && !filtersActive && (
              <Card className="border-mint-100 bg-mint-50 p-4">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-navy-900">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-mint-500 text-navy-900">
                    <Icon name="check" size={16} />
                  </span>
                  All {progress.total} {progress.total === 1 ? 'decision' : 'decisions'} made
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {progress.freedMonthly > 0 ? `${formatMoney(progress.freedMonthly, currency)} a month no longer leaves your account. ` : ''}
                  {suggestions.length > 0 ? `Next: ${suggestions[0].subscription.name} renews ${relativeLower(suggestions[0].date)}. Worth a note?` : 'Nothing renews in the next 30 days without a note.'}
                </p>
                <div className="mt-3 flex gap-2">
                  {suggestions.length > 0 ? (
                    <Button size="sm" variant="mint" onClick={() => setTarget(suggestions[0].subscription.id!)}>
                      Note {suggestions[0].subscription.name}
                    </Button>
                  ) : (
                    <Button size="sm" variant="mint" onClick={() => navigate('/timeline')}>
                      Review the timeline
                    </Button>
                  )}
                </div>
              </Card>
            )}
            <SearchField value={view.query} onChange={(q) => patch({ query: q })} placeholder="Search notes or services" label="Search notes" />
            <ChipRow label="Reason" options={REASON_OPTIONS} value={view.reasons} onChange={(v) => patch({ reasons: v as CancellationReason[] })} />
            <ResultsBar shown={model.open.length} total={model.totalOpen} noun={model.totalOpen === 1 ? 'open note' : 'open notes'} active={filtersActive} onClear={reset} />
            {model.open.length === 0 && filtersActive && model.done.length === 0 ? (
              <FilteredEmpty query={view.query} filters={view.reasons.map((r) => REASON_LABEL[r])} noun="notes" onClear={reset} />
            ) : model.open.length === 0 ? (
              <Card className="p-4 text-[14px] text-muted">{filtersActive ? 'No open notes match. Completed matches are below.' : 'Everything is decided. Nice.'}</Card>
            ) : (
              <div className="space-y-2">
                {model.open.map(({ note, sub }) => {
                  const d = note.remindOn ? daysUntil(note.remindOn) : null
                  return (
                    <Card key={note.id} className="p-4">
                      <button onClick={() => navigate(`/subscriptions/${sub!.id}`)} className="flex w-full items-center gap-3 text-left">
                        <ServiceMark name={sub!.name} color={categoryOf(sub!.categoryId).color} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-[15px] font-semibold text-ink">{sub!.name}</span>
                          <span className="block text-[12px] text-muted">
                            {formatMoney(sub!.amount, sub!.currency)} · {sub!.status === 'cancelled' ? 'cancelled' : `renews ${relativeLower(sub!.nextRenewalDate)}`}
                          </span>
                        </span>
                        <Icon name="chevronRight" size={18} className="text-faint" />
                      </button>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone="coral">{REASON_LABEL[note.reason]}</Badge>
                        {d !== null && (
                          <Badge tone={d < 0 ? 'coral' : d <= 3 ? 'amber' : 'navy'}>
                            {d < 0 ? `Overdue by ${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'}` : d === 0 ? 'Decide today' : `Decide ${relativeLower(note.remindOn!)}`}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-[14px] leading-relaxed text-ink">{note.content}</p>
                      <div className="mt-3 flex gap-2">
                        <Button variant="mint" size="sm" className="flex-1" disabled={busyAction} leading={<Icon name="check" size={16} />} onClick={() => act('Marked as done', () => updateNote(note.id!, { status: 'done' }))}>
                          Done
                        </Button>
                        <Button variant="danger" size="sm" disabled={busyAction || sub!.status === 'cancelled'} aria-label={`Cancel ${sub!.name}`} onClick={() => act(`${sub!.name} cancelled`, () => decideNote(note.id!, 'cancel'))}>
                          <Icon name="x" size={16} />
                        </Button>
                        <Button variant="secondary" size="sm" disabled={busyAction} aria-label="Snooze 3 days" onClick={() => act('Reminder moved 3 days', async () => { await snoozeNote(note.id!, 3) })}>
                          <Icon name="clock" size={16} />
                        </Button>
                        <Button variant="secondary" size="sm" disabled={busyAction} aria-label="Delete note" onClick={() => act('Note deleted', () => deleteNote(note.id!))}>
                          <Icon name="trash" size={16} />
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
            {model.done.length > 0 && (
              <div>
                <TextLink icon={null} className="px-1 text-muted" onClick={() => setShowDone((v) => !v)}>
                  {showDone ? 'Hide' : 'Show'} {model.done.length} completed <Icon name="chevronDown" size={16} className={showDone ? 'rotate-180' : ''} />
                </TextLink>
                {showDone && (
                  <div className="space-y-2">
                    {model.done.map(({ note, sub }) => (
                      <Card key={note.id} className="p-4 opacity-70">
                        <div className="flex items-center gap-3">
                          <ServiceMark name={sub!.name} color="#A0AEC0" size={32} />
                          <span className="flex-1 text-[14px] font-semibold text-ink">{sub!.name}</span>
                          <Button variant="secondary" size="sm" onClick={() => act('Reopened', () => updateNote(note.id!, { status: 'open' }))}>
                            Reopen
                          </Button>
                        </div>
                        <p className="mt-2 text-[13px] text-muted line-through">{note.content}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Page>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Which subscription?">
        {subs && subs.length === 0 ? (
          <EmptyState icon="list" tone="navy" title="Nothing to note" body="Add a subscription first." actionLabel="Add subscription" onAction={() => navigate('/subscriptions/new')} />
        ) : (
          <ul className="divide-y divide-line">
            {(subs ?? []).map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setPicker(false)
                    setTarget(s.id!)
                  }}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                >
                  <ServiceMark name={s.name} color={categoryOf(s.categoryId).color} size={36} />
                  <span className="flex-1 text-[15px] font-semibold text-ink">{s.name}</span>
                  <span className="text-[13px] text-muted">{formatMoney(s.amount, s.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {targetSub && <NoteSheet open={target !== null} onClose={() => setTarget(null)} subscriptionId={targetSub.id!} defaultRemindOn={targetSub.status === 'cancelled' ? '' : targetSub.nextRenewalDate} />}
    </div>
  )
}
