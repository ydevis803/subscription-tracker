import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { differenceInCalendarMonths } from 'date-fns'
import { addNote, addPriceChange, deleteNote, deletePriceChange, deleteSubscription, markRenewed, setSubscriptionStatus, updateNote } from '@/db/repo'
import type { CancellationReason, PriceChange } from '@/db/schema'
import { useNotes, usePriceChanges, useSettings, useSubscription } from '@/hooks/useData'
import { categoryOf, REASON_LABEL } from '@/lib/categories'
import { CYCLE_LABEL, CYCLE_NAME, currencySymbol, formatMoney, toMonthly } from '@/lib/money'
import { daysUntil, formatDate, fromISO, todayISO, relativeLower } from '@/lib/dates'
import { PlanLimitError } from '@/lib/plan'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button, IconButton, TextLink } from '@/components/ui/Button'
import { SelectField, TextArea, TextField } from '@/components/ui/Field'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Badge, Card, Divider, EmptyState, ListSkeleton, SectionTitle, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { StatusBadge } from '@/components/app/SubscriptionRow'
import { PaywallSheet } from '@/components/app/Paywall'
import { useSmartBack } from '@/lib/navigation'
import { describeError } from '@/lib/errors'

export default function SubscriptionDetail() {
  const { id } = useParams()
  const subId = Number(id)
  const navigate = useNavigate()
  const goBack = useSmartBack()
  const toast = useToast()
  const sub = useSubscription(subId)
  const settings = useSettings()
  const changes = usePriceChanges(subId)
  const notes = useNotes(subId)

  const [confirm, setConfirm] = useState<null | 'delete' | 'cancel'>(null)
  const [busy, setBusy] = useState(false)
  const [priceSheet, setPriceSheet] = useState(false)
  const [noteSheet, setNoteSheet] = useState(false)
  const [paywall, setPaywall] = useState(false)

  const cat = sub ? categoryOf(sub.categoryId) : null
  const monthly = sub ? toMonthly(sub.amount, sub.billingCycle) : 0
  const monthsSince = sub ? Math.max(0, differenceInCalendarMonths(new Date(), fromISO(sub.startDate))) : 0
  const spentEstimate = monthly * monthsSince
  const openNotes = useMemo(() => (notes ?? []).filter((n) => n.status === 'open'), [notes])
  const doneNotes = useMemo(() => (notes ?? []).filter((n) => n.status === 'done'), [notes])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      toast.success(label)
    } catch (e) {
      if (e instanceof PlanLimitError) setPaywall(true)
      else toast.error(describeError(e, 'update this subscription'))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  if (sub === undefined) {
    return (
      <div>
        <PageHeader title="Subscription" back backTo="/subscriptions" />
        <Page className="space-y-4">
          <Skeleton className="h-40" />
          <ListSkeleton rows={2} />
        </Page>
      </div>
    )
  }
  if (sub === null || !sub) {
    return (
      <div>
        <PageHeader title="Subscription" back backTo="/subscriptions" />
        <Page>
          <Card>
            <EmptyState icon="search" tone="navy" title="This subscription is gone" body="It was deleted or the link is out of date. Your other subscriptions are untouched." actionLabel="Back to subscriptions" onAction={() => navigate('/subscriptions')} />
          </Card>
        </Page>
      </div>
    )
  }

  const days = daysUntil(sub.nextRenewalDate)
  const reminderDays = sub.reminderDaysBefore ?? settings?.defaultReminderDays ?? 3

  return (
    <div>
      <PageHeader
        title={sub.name}
        back
        backTo="/subscriptions"
        right={
          <IconButton icon="edit" size={20} label="Edit subscription" onClick={() => navigate(`/subscriptions/${sub.id}/edit`)} />
        }
      />
      <Page className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <ServiceMark name={sub.name} color={sub.status === 'cancelled' ? '#A0AEC0' : cat!.color} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-navy-900">{sub.name}</h2>
                <StatusBadge status={sub.status} />
              </div>
              <p className="text-[13px] text-muted">
                {cat!.name} · {CYCLE_NAME[sub.billingCycle]}
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="tabular text-[36px] font-bold leading-none text-navy-900">{formatMoney(sub.amount, sub.currency)}</span>
            <span className="text-[15px] text-muted">per {CYCLE_LABEL[sub.billingCycle]}</span>
          </div>
          {sub.status === 'cancelled' ? (
            <p className="mt-3 rounded-xl bg-coral-50 px-4 py-3 text-[14px] text-coral-700">
              Cancelled {sub.cancelledAt ? formatDate(sub.cancelledAt) : ''}. You were paying about {formatMoney(monthly, sub.currency)} a month.
            </p>
          ) : sub.status === 'paused' ? (
            <p className="mt-3 rounded-xl bg-navy-50 px-4 py-3 text-[14px] text-navy-800">Paused. It does not count toward your monthly total until you resume it.</p>
          ) : (
            <div className={`mt-3 flex items-center gap-3 rounded-xl px-4 py-3 ${days <= 3 ? 'bg-coral-50' : 'bg-mint-50'}`}>
              <Icon name={sub.status === 'trial' ? 'clock' : 'calendar'} size={20} className={days <= 3 ? 'text-coral-700' : 'text-mint-700'} />
              <div className="flex-1">
                <p className={`text-[14px] font-semibold ${days <= 3 ? 'text-coral-700' : 'text-navy-900'}`}>
                  {sub.status === 'trial' ? 'Trial converts' : 'Renews'} {relativeLower(sub.nextRenewalDate)}
                </p>
                <p className="text-[13px] text-muted">
                  {formatDate(sub.nextRenewalDate, 'EEEE d MMMM yyyy')} · reminder {reminderDays} {reminderDays === 1 ? 'day' : 'days'} before
                </p>
                <button onClick={() => navigate(`/calendar?date=${sub.nextRenewalDate}`)} className="mt-1 flex h-9 items-center gap-1 text-[13px] font-semibold text-navy-700 underline decoration-mint-500 decoration-2 underline-offset-2">
                  <Icon name="calendar" size={14} /> View in calendar
                </button>
                {sub.renewalEstimated && (
                  <p className="mt-1 text-[13px] font-semibold text-navy-800">
                    Estimated date from setup.{' '}
                    <button onClick={() => navigate(`/subscriptions/${sub.id}/edit`)} className="underline decoration-mint-500 decoration-2 underline-offset-2">
                      Confirm the real date
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Per month" value={formatMoney(monthly, sub.currency)} />
          <Stat label="Per year" value={formatMoney(monthly * 12, sub.currency, { compact: true })} />
          <Stat label={`Since ${formatDate(sub.startDate, 'MMM yy')}`} value={formatMoney(spentEstimate, sub.currency, { compact: true })} hint="estimate" />
        </div>

        {sub.status !== 'cancelled' && (
          <div className="grid grid-cols-2 gap-3">
            {sub.status === 'paused' ? (
              <Action icon="play" label="Resume" onClick={() => run('Resumed', () => setSubscriptionStatus(sub.id!, 'active'))} disabled={busy} />
            ) : (
              <Action icon="pause" label="Pause" onClick={() => run('Paused', () => setSubscriptionStatus(sub.id!, 'paused'))} disabled={busy} />
            )}
            {sub.status === 'active' || sub.status === 'trial' ? (
              <Action icon="check" label="Mark as paid" onClick={() => run('Next renewal moved forward', () => markRenewed(sub.id!))} disabled={busy} />
            ) : (
              <Action icon="note" label="Add note" onClick={() => setNoteSheet(true)} />
            )}
          </div>
        )}
        {sub.status === 'cancelled' && (
          <Action icon="refresh" label="Reactivate subscription" onClick={() => run('Reactivated', () => setSubscriptionStatus(sub.id!, 'active'))} disabled={busy} />
        )}

        <section>
          <SectionTitle
            action={
              <TextLink icon="plus" onClick={() => setNoteSheet(true)}>
                Add note
              </TextLink>
            }
          >
            Cancellation notes
          </SectionTitle>
          {notes === undefined ? (
            <ListSkeleton rows={1} />
          ) : notes.length === 0 ? (
            <Card className="p-4 text-[14px] text-muted">
              No notes yet. Write down why you might cancel, when the fee-free window is, or what to check before the next renewal.
            </Card>
          ) : (
            <div className="space-y-2">
              {[...openNotes, ...doneNotes].map((n) => (
                <Card key={n.id} className={`p-4 ${n.status === 'done' ? 'opacity-70' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => run(n.status === 'open' ? 'Marked as done' : 'Reopened', () => updateNote(n.id!, { status: n.status === 'open' ? 'done' : 'open' }))}
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${n.status === 'done' ? 'border-mint-500 bg-mint-500 text-navy-900' : 'border-navy-200'}`}
                      aria-label={n.status === 'done' ? 'Reopen note' : 'Mark note done'}
                    >
                      {n.status === 'done' && <Icon name="check" size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={n.status === 'done' ? 'gray' : 'coral'}>{REASON_LABEL[n.reason]}</Badge>
                        {n.remindOn && n.status === 'open' && (
                          <span className={`text-[12px] font-semibold ${daysUntil(n.remindOn) <= 0 ? 'text-coral-700' : 'text-muted'}`}>
                            Remind {relativeLower(n.remindOn)}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1.5 text-[14px] leading-relaxed text-ink ${n.status === 'done' ? 'line-through' : ''}`}>{n.content}</p>
                    </div>
                    <IconButton icon="trash" size={16} label="Delete note" variant="muted" className="-mr-2 -mt-1 hover:bg-coral-50 hover:text-coral-700" onClick={() => run('Note deleted', () => deleteNote(n.id!))} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              <TextLink icon="plus" onClick={() => setPriceSheet(true)}>
                Log change
              </TextLink>
            }
          >
            Price history
          </SectionTitle>
          <Card className="overflow-hidden">
            {changes === undefined ? (
              <ListSkeleton rows={1} />
            ) : (
              <ul className="divide-y divide-line">
                {changes.map((c) => (
                  <PriceRow key={c.id} change={c} currency={sub.currency} onDelete={() => run('Entry removed', () => deletePriceChange(c.id!))} />
                ))}
                <li className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                    <Icon name="tag" size={16} />
                  </span>
                  <span className="flex-1 text-[14px]">
                    <span className="block font-semibold text-ink">Started at {formatMoney(changes.length ? changes[changes.length - 1].previousAmount : sub.amount, sub.currency)}</span>
                    <span className="block text-[12px] text-muted">{formatDate(sub.startDate)}</span>
                  </span>
                </li>
              </ul>
            )}
          </Card>
          {changes && changes.length > 0 && (
            <p className="mt-2 px-1 text-[13px] text-muted">
              {(() => {
                const first = changes[changes.length - 1].previousAmount
                const diff = sub.amount - first
                if (Math.abs(diff) < 0.005) return 'Back to the original price.'
                const pct = Math.round((diff / first) * 100)
                return diff > 0 ? `Up ${formatMoney(diff, sub.currency)} (${pct}%) since you started.` : `Down ${formatMoney(-diff, sub.currency)} (${Math.abs(pct)}%) since you started.`
              })()}
            </p>
          )}
        </section>

        <section>
          <SectionTitle>Details</SectionTitle>
          <Card className="overflow-hidden">
            <DetailRow label="Payment method" value={sub.paymentMethod || 'Not set'} />
            <Divider />
            <DetailRow label="Started" value={formatDate(sub.startDate, 'd MMMM yyyy')} />
            <Divider />
            <DetailRow
              label="Account page"
              value={
                sub.website ? (
                  <a href={sub.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-navy-700">
                    {sub.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <Icon name="external" size={14} />
                  </a>
                ) : (
                  'Not set'
                )
              }
            />
            {sub.notes && (
              <>
                <Divider />
                <DetailRow label="Notes" value={sub.notes} />
              </>
            )}
          </Card>
        </section>

        <section className="space-y-2 pb-2">
          {sub.status !== 'cancelled' && (
            <Button full variant="danger" onClick={() => setConfirm('cancel')} leading={<Icon name="x" size={18} />}>
              Mark as cancelled
            </Button>
          )}
          <Button full variant="ghost" className="text-coral-700" onClick={() => setConfirm('delete')} leading={<Icon name="trash" size={18} />}>
            Delete permanently
          </Button>
        </section>
      </Page>

      <ConfirmSheet
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        title={`Cancel ${sub.name}?`}
        body="This marks it cancelled here and removes it from your monthly total. You still need to cancel with the provider. Keep the price history and notes for reference."
        confirmLabel="Mark cancelled"
        loading={busy}
        onConfirm={() => run(`${sub.name} marked as cancelled`, () => setSubscriptionStatus(sub.id!, 'cancelled'))}
      />
      <ConfirmSheet
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={`Delete ${sub.name}?`}
        body="This removes the subscription, its price history and its notes from this device. This cannot be undone."
        confirmLabel="Delete"
        loading={busy}
        onConfirm={() =>
          run(`${sub.name} deleted`, async () => {
            await deleteSubscription(sub.id!)
            goBack('/subscriptions', 2) // past the confirm sheet and the deleted record's page
          })
        }
      />
      <PriceChangeSheet open={priceSheet} onClose={() => setPriceSheet(false)} subscriptionId={sub.id!} currentAmount={sub.amount} currency={sub.currency} />
      <NoteSheet open={noteSheet} onClose={() => setNoteSheet(false)} subscriptionId={sub.id!} defaultRemindOn={sub.status === 'cancelled' ? '' : sub.nextRenewalDate} />
      <PaywallSheet open={paywall} onClose={() => setPaywall(false)} reason="Reactivating this subscription would exceed the ten included in the free plan." />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3">
      <span className="block text-[11px] font-semibold uppercase leading-tight tracking-wide text-faint">{label}</span>
      <span className="tabular mt-1 block text-[16px] font-bold text-navy-900">{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  )
}

function Action({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[14px] font-semibold text-navy-900 shadow-card active:bg-navy-50 disabled:opacity-60">
      <Icon name={icon} size={18} className="text-mint-700" />
      {label}
    </button>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-start justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-[14px] text-muted">{label}</span>
      <span className="text-right text-[14px] text-ink">{value}</span>
    </div>
  )
}

function PriceRow({ change, currency, onDelete }: { change: PriceChange; currency: string; onDelete: () => void }) {
  const up = change.newAmount > change.previousAmount
  const diff = change.newAmount - change.previousAmount
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${up ? 'bg-coral-100 text-coral-700' : 'bg-mint-100 text-mint-700'}`}>
        <Icon name={up ? 'trend' : 'trendDown'} size={16} />
      </span>
      <span className="min-w-0 flex-1 text-[14px]">
        <span className="block font-semibold text-ink">
          {formatMoney(change.previousAmount, currency)} → {formatMoney(change.newAmount, currency)}
          <span className={`ml-2 text-[12px] ${up ? 'text-coral-700' : 'text-mint-700'}`}>
            {up ? '+' : ''}
            {formatMoney(diff, currency)}
          </span>
        </span>
        <span className="block text-[12px] text-muted">
          {formatDate(change.effectiveDate)}
          {change.note ? ` · ${change.note}` : ''}
        </span>
      </span>
      <IconButton icon="trash" size={16} label="Remove price change" variant="muted" className="-mr-2 hover:bg-coral-50 hover:text-coral-700" onClick={onDelete} />
    </li>
  )
}

export function PriceChangeSheet({
  open,
  onClose,
  subscriptionId,
  currentAmount,
  currency,
}: {
  open: boolean
  onClose: () => void
  subscriptionId: number
  currentAmount: number
  currency: string
}) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return setError('Enter the new price.')
    if (Math.abs(n - currentAmount) < 0.005) return setError('That is the same as the current price.')
    submitting.current = true
    setSaving(true)
    try {
      await addPriceChange({ subscriptionId, previousAmount: currentAmount, newAmount: Math.round(n * 100) / 100, effectiveDate: date, note: note.trim() })
      toast.success(date <= todayISO() ? 'Price updated and recorded' : 'Upcoming price change recorded')
      setAmount('')
      setNote('')
      onClose()
    } catch (err) {
      toast.error(describeError(err, 'record the price change'))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Log a price change">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-[14px] text-muted">Current price is {formatMoney(currentAmount, currency)}. If the change is dated today or earlier, the subscription amount updates too.</p>
        <TextField
          label="New price"
          inputMode="decimal"
          placeholder={(currentAmount + 1).toFixed(2)}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^\d.]/g, ''))
            setError('')
          }}
          error={error}
          leading={<span className="font-semibold">{currencySymbol(currency)}</span>}
          autoFocus
        />
        <TextField type="date" label="Effective from" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Reason (optional)" placeholder="Announced by email" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" full size="lg" loading={saving}>
          Save price change
        </Button>
      </form>
    </Sheet>
  )
}

export function NoteSheet({
  open,
  onClose,
  subscriptionId,
  defaultRemindOn,
}: {
  open: boolean
  onClose: () => void
  subscriptionId: number
  defaultRemindOn: string
}) {
  const toast = useToast()
  const [reason, setReason] = useState<CancellationReason>('not-using')
  const [content, setContent] = useState('')
  const [remind, setRemind] = useState(defaultRemindOn)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    if (content.trim().length < 3) return setError('Write a short note so future you knows what to do.')
    submitting.current = true
    setSaving(true)
    try {
      await addNote({ subscriptionId, reason, content: content.trim(), remindOn: remind || null, status: 'open' })
      toast.success('Note saved')
      setContent('')
      onClose()
    } catch (err) {
      toast.error(describeError(err, 'save the note'))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Cancellation note">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <SelectField label="Reason" value={reason} onChange={(e) => setReason(e.target.value as CancellationReason)}>
          {(Object.keys(REASON_LABEL) as CancellationReason[]).map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </SelectField>
        <TextArea
          label="Note"
          placeholder="Cancel before the annual renewal. Downgrade to the photo plan instead."
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            setError('')
          }}
          error={error}
          autoFocus
        />
        <TextField type="date" label="Remind me on (optional)" value={remind} min={todayISO()} onChange={(e) => setRemind(e.target.value)} hint="Shows on your dashboard when the date arrives." />
        <Button type="submit" full size="lg" loading={saving}>
          Save note
        </Button>
      </form>
    </Sheet>
  )
}
