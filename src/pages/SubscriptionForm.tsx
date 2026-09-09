import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addSubscription, updateSubscription, type SubscriptionInput } from '@/db/repo'
import { CATEGORIES, type BillingCycle, type CategoryId, type SubscriptionStatus } from '@/db/schema'
import { useProfile, useSettings, useSubscription, useSubscriptions } from '@/hooks/useData'
import { CYCLE_LABEL, CYCLE_NAME, currencySymbol, formatMoney, toMonthly } from '@/lib/money'
import { addCycle, daysFromToday, formatDate, todayISO } from '@/lib/dates'
import { PlanLimitError, canAddSubscription } from '@/lib/plan'
import { SERVICE_PRESETS, localAmount, type ServicePreset } from '@/lib/services'
import { categoryOf } from '@/lib/categories'
import { ServiceMark } from '@/components/ui/Primitives'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { SegmentedControl, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { Card, EmptyState, ListSkeleton } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'
import { PaywallSheet } from '@/components/app/Paywall'
import { Icon } from '@/components/ui/Icon'
import { useSmartBack } from '@/lib/navigation'
import { describeError } from '@/lib/errors'

interface FormState {
  name: string
  categoryId: CategoryId
  amount: string
  billingCycle: BillingCycle
  nextRenewalDate: string
  startDate: string
  status: SubscriptionStatus
  paymentMethod: string
  website: string
  notes: string
  trialEndsAt: string
  reminderDaysBefore: string
  priceChangeNote: string
}

/** Suggestions come from the shared service catalogue (also used in onboarding), matched on any part of the name. */
function matchPresets(query: string, exclude: string): ServicePreset[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SERVICE_PRESETS.filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== exclude.trim().toLowerCase()).slice(0, 6)
}

export default function SubscriptionForm() {
  const { id } = useParams()
  const editingId = id ? Number(id) : undefined
  const isEdit = editingId !== undefined
  const navigate = useNavigate()
  const goBack = useSmartBack()
  const toast = useToast()
  const profile = useProfile()
  const settings = useSettings()
  const subs = useSubscriptions()
  const existing = useSubscription(editingId)
  const currency = profile?.currency ?? 'USD'

  const linkedDate = new URLSearchParams(window.location.search).get('date')
  const prefilledDate = linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate) && linkedDate >= todayISO() ? linkedDate : null
  const [form, setForm] = useState<FormState>({
    name: '',
    categoryId: 'streaming',
    amount: '',
    billingCycle: 'monthly',
    nextRenewalDate: prefilledDate ?? daysFromToday(30),
    startDate: todayISO(),
    status: 'active',
    paymentMethod: '',
    website: '',
    notes: '',
    trialEndsAt: daysFromToday(7),
    reminderDaysBefore: '',
    priceChangeNote: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [hydrated, setHydrated] = useState(!isEdit)
  const [nameFocused, setNameFocused] = useState(false)
  const suggestions = nameFocused ? matchPresets(form.name, existing?.name ?? '') : []

  const applyPreset = (p: ServicePreset) => {
    setForm((f) => ({
      ...f,
      name: p.name,
      categoryId: p.categoryId,
      website: f.website || p.website,
      amount: f.amount.trim() === '' ? localAmount(p.amount, currency).toFixed(2) : f.amount,
      billingCycle: f.amount.trim() === '' ? p.billingCycle : f.billingCycle,
    }))
    setErrors((e) => ({ ...e, name: undefined, amount: undefined }))
    setNameFocused(false)
  }

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setForm({
        name: existing.name,
        categoryId: existing.categoryId,
        amount: existing.amount.toFixed(2),
        billingCycle: existing.billingCycle,
        nextRenewalDate: existing.nextRenewalDate,
        startDate: existing.startDate,
        status: existing.status,
        paymentMethod: existing.paymentMethod,
        website: existing.website,
        notes: existing.notes,
        trialEndsAt: existing.trialEndsAt ?? daysFromToday(7),
        reminderDaysBefore: existing.reminderDaysBefore === null ? '' : String(existing.reminderDaysBefore),
        priceChangeNote: '',
      })
      setHydrated(true)
    }
  }, [isEdit, existing, hydrated])

  // Adding while over the free limit shows the paywall instead of a form that cannot save.
  useEffect(() => {
    if (!isEdit && subs && profile && !canAddSubscription(profile, subs)) setPaywall(true)
  }, [isEdit, subs, profile])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const duplicate = useMemo(() => {
    const name = form.name.trim().toLowerCase()
    if (!name || !subs) return null
    return subs.find((s) => s.id !== editingId && s.status !== 'cancelled' && s.name.trim().toLowerCase() === name) ?? null
  }, [form.name, subs, editingId])

  const amountNumber = Number(form.amount)
  const amountChanged = isEdit && existing && Number.isFinite(amountNumber) && Math.abs(amountNumber - existing.amount) > 0.004

  const preview = useMemo(() => {
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return null
    return { monthly: toMonthly(amountNumber, form.billingCycle), yearly: toMonthly(amountNumber, form.billingCycle) * 12 }
  }, [amountNumber, form.billingCycle])

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (form.name.trim().length < 2) next.name = 'Give this subscription a name.'
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) next.amount = 'Enter the amount you are charged.'
    if (amountNumber > 1_000_000) next.amount = 'That amount looks too large.'
    if (!form.nextRenewalDate) next.nextRenewalDate = 'Pick the next renewal date.'
    else if (form.status !== 'cancelled' && form.nextRenewalDate < todayISO()) next.nextRenewalDate = 'Next renewal must be today or later.'
    if (!form.startDate) next.startDate = 'Pick a start date.'
    else if (form.startDate > todayISO()) next.startDate = 'Start date cannot be in the future.'
    if (form.status === 'trial' && !form.trialEndsAt) next.trialEndsAt = 'When does the trial end?'
    if (form.reminderDaysBefore !== '' && (!/^\d+$/.test(form.reminderDaysBefore) || Number(form.reminderDaysBefore) > 90))
      next.reminderDaysBefore = 'Use a whole number of days up to 90.'
    if (form.website && !/^https?:\/\/|^[\w-]+(\.[\w-]+)+/.test(form.website.trim())) next.website = 'Enter a web address like netflix.com.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submitting = useRef(false) // synchronous guard: a second tap before React re-renders must not save twice
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    if (!validate()) {
      toast.error('Please fix the highlighted fields')
      return
    }
    submitting.current = true
    setSaving(true)
    const website = form.website.trim() && !/^https?:\/\//.test(form.website.trim()) ? `https://${form.website.trim()}` : form.website.trim()
    const input: SubscriptionInput = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      amount: Math.round(amountNumber * 100) / 100,
      currency,
      billingCycle: form.billingCycle,
      nextRenewalDate: form.status === 'trial' ? form.trialEndsAt : form.nextRenewalDate,
      startDate: form.startDate,
      status: form.status,
      paymentMethod: form.paymentMethod.trim(),
      website,
      notes: form.notes.trim(),
      trialEndsAt: form.status === 'trial' ? form.trialEndsAt : null,
      cancelledAt: form.status === 'cancelled' ? (existing?.cancelledAt ?? todayISO()) : null,
      reminderDaysBefore: form.reminderDaysBefore === '' ? null : Number(form.reminderDaysBefore),
      renewalEstimated: false,
    }
    try {
      if (isEdit && editingId !== undefined) {
        await updateSubscription(editingId, input, form.priceChangeNote.trim())
        toast.success(amountChanged ? 'Saved, price change recorded' : 'Changes saved')
        goBack(`/subscriptions/${editingId}`)
      } else {
        const newId = await addSubscription(input)
        toast.success(`${input.name} added`)
        navigate(`/subscriptions/${newId}`, { replace: true })
      }
    } catch (err) {
      if (err instanceof PlanLimitError) setPaywall(true)
      else toast.error(describeError(err, isEdit ? 'save your changes' : 'add this subscription'))
      setSaving(false)
    } finally {
      submitting.current = false
    }
  }

  if (isEdit && !existing) {
    return (
      <div>
        <PageHeader title="Edit subscription" back />
        <Page>
          {existing === undefined ? (
            <ListSkeleton rows={4} />
          ) : (
            <Card>
              <EmptyState icon="search" tone="navy" title="This subscription is gone" body="It was deleted or the link is out of date. Your other subscriptions are untouched." actionLabel="Back to subscriptions" onAction={() => navigate('/subscriptions')} />
            </Card>
          )}
        </Page>
      </div>
    )
  }

  const reminderDefault = settings?.defaultReminderDays ?? 3

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit subscription' : 'New subscription'} back backTo={isEdit ? `/subscriptions/${editingId}` : '/subscriptions'} />
      <form onSubmit={onSubmit} noValidate>
        <Page className="space-y-5">
          <Card className="space-y-4 p-4">
            <div className="relative">
              <TextField
                label="Name"
                placeholder="Netflix"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                onFocus={() => setNameFocused(true)}
                onBlur={() => window.setTimeout(() => setNameFocused(false), 120)}
                onKeyDown={(e) => e.key === 'Escape' && setNameFocused(false)}
                error={errors.name}
                autoFocus={!isEdit}
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="name-suggestions"
                hint={suggestions.length === 0 && !isEdit ? 'Start typing to pick from common services and fill in the typical price.' : undefined}
              />
              {suggestions.length > 0 && (
                <ul id="name-suggestions" role="listbox" className="fade absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-2xl border border-line bg-white shadow-float">
                  {suggestions.map((p) => (
                    <li key={p.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyPreset(p)}
                        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-navy-50 active:bg-navy-100"
                      >
                        <ServiceMark name={p.name} color={categoryOf(p.categoryId).color} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-ink">{p.name}</span>
                          <span className="block text-[12px] text-muted">{categoryOf(p.categoryId).name}</span>
                        </span>
                        <span className="tabular text-[13px] font-semibold text-navy-800">
                          {formatMoney(localAmount(p.amount, currency), currency)}/{p.billingCycle === 'monthly' ? 'mo' : p.billingCycle === 'yearly' ? 'yr' : p.billingCycle}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {duplicate && (
              <p className="flex items-start gap-2 rounded-xl bg-navy-50 px-3 py-2.5 text-[13px] text-navy-800">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-navy-700" />
                <span>
                  You already track <span className="font-semibold">{duplicate.name}</span> at {formatMoney(duplicate.amount, duplicate.currency)} per {CYCLE_LABEL[duplicate.billingCycle]}.{' '}
                  <button type="button" onClick={() => navigate(`/subscriptions/${duplicate.id}`)} className="font-semibold underline decoration-mint-500 decoration-2 underline-offset-2">
                    Open it
                  </button>{' '}
                  or keep going to add a second one.
                </span>
              </p>
            )}
            <SelectField label="Category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value as CategoryId)}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </Card>

          <Card className="space-y-4 p-4">
            <TextField
              label={`Amount (${currency})`}
              inputMode="decimal"
              placeholder="9.99"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))}
              error={errors.amount}
              leading={<span className="text-[15px] font-semibold">{currencySymbol(currency)}</span>}
            />
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-navy-800">Billing cycle</span>
              <SegmentedControl
                value={form.billingCycle}
                onChange={(v) => set('billingCycle', v)}
                options={(['weekly', 'monthly', 'quarterly', 'yearly'] as BillingCycle[]).map((c) => ({ value: c, label: CYCLE_NAME[c] }))}
              />
            </div>
            {preview && (
              <div className="flex items-center justify-between rounded-xl bg-mint-50 px-4 py-3 text-[13px]">
                <span className="text-mint-700">Equivalent to</span>
                <span className="tabular font-semibold text-navy-900">
                  {formatMoney(preview.monthly, currency)}/mo · {formatMoney(preview.yearly, currency)}/yr
                </span>
              </div>
            )}
            {amountChanged && existing && (
              <div className="rounded-xl border border-coral-100 bg-coral-50 p-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-coral-700">
                  <Icon name="trend" size={16} />
                  Price change from {formatMoney(existing.amount, currency)} to {formatMoney(amountNumber, currency)} will be recorded in history.
                </p>
                <div className="mt-2">
                  <TextField label="Why did it change? (optional)" placeholder="Announced by email" value={form.priceChangeNote} onChange={(e) => set('priceChangeNote', e.target.value)} />
                </div>
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-4">
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-navy-800">Status</span>
              <SegmentedControl
                value={form.status}
                onChange={(v) => set('status', v)}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'trial', label: 'Trial' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
            {form.status === 'trial' ? (
              <TextField
                type="date"
                label="Trial ends (first charge)"
                value={form.trialEndsAt}
                min={todayISO()}
                onChange={(e) => set('trialEndsAt', e.target.value)}
                error={errors.trialEndsAt}
                hint="We will warn you before the trial converts to a paid plan."
              />
            ) : (
              <TextField
                type="date"
                label="Next renewal"
                value={form.nextRenewalDate}
                min={form.status === 'cancelled' ? undefined : todayISO()}
                onChange={(e) => set('nextRenewalDate', e.target.value)}
                error={errors.nextRenewalDate}
                hint={
                  form.nextRenewalDate && form.status !== 'cancelled'
                    ? `${prefilledDate && form.nextRenewalDate === prefilledDate ? 'Picked from the calendar. ' : ''}Then ${formatDate(addCycle(form.nextRenewalDate, form.billingCycle), 'd MMM yyyy')}`
                    : undefined
                }
              />
            )}
            <TextField type="date" label="Started on" value={form.startDate} max={todayISO()} onChange={(e) => set('startDate', e.target.value)} error={errors.startDate} />
          </Card>

          <Card className="space-y-4 p-4">
            <TextField label="Payment method" placeholder="Visa •••• 4421" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} hint="A label only. Never store full card numbers." />
            <TextField label="Account page" placeholder="netflix.com/account" inputMode="url" value={form.website} onChange={(e) => set('website', e.target.value)} error={errors.website} />
            <TextField
              label="Remind me before renewal (days)"
              inputMode="numeric"
              placeholder={`Default: ${reminderDefault}`}
              value={form.reminderDaysBefore}
              onChange={(e) => set('reminderDaysBefore', e.target.value.replace(/\D/g, ''))}
              error={errors.reminderDaysBefore}
            />
            <TextArea label="Notes" placeholder="Shared plan, promo rate, who uses it…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Card>

          <div className="sticky bottom-0 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur safe-bottom">
            <Button type="submit" full size="lg" loading={saving}>
              {isEdit ? 'Save changes' : 'Add subscription'}
            </Button>
          </div>
        </Page>
      </form>
      <PaywallSheet
        open={paywall}
        onClose={() => {
          setPaywall(false)
          if (!isEdit && subs && profile && !canAddSubscription(profile, subs)) navigate('/subscriptions', { replace: true })
        }}
      />
    </div>
  )
}
