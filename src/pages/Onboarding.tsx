import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { completeOnboarding } from '@/db/repo'
import { LegalLinks } from '@/components/app/LegalLayout'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { CURRENCIES, currencySymbol, formatMoney, toMonthly, validateBudget } from '@/lib/money'
import { describeError } from '@/lib/errors'
import { daysFromToday, formatDate } from '@/lib/dates'
import { BUDGET_PRESETS_USD, SERVICE_PRESETS, estimatedRenewalOffset, localAmount } from '@/lib/services'
import { categoryOf } from '@/lib/categories'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ServiceMark } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'

const DRAFT_KEY = 'subscription-tracker.onboarding-draft'
const STEPS = 4
type LeadDays = 1 | 3 | 7 | 14

interface Draft {
  step: number
  currency: string
  services: string[]
  budget: number | null
  customBudget: string
  leadDays: LeadDays
}

const DEFAULT_DRAFT: Draft = { step: 0, currency: 'USD', services: [], budget: null, customBudget: '', leadDays: 3 }

function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return DEFAULT_DRAFT
    const parsed = JSON.parse(raw) as Partial<Draft>
    return { ...DEFAULT_DRAFT, ...parsed, step: Math.min(Math.max(parsed.step ?? 0, 0), STEPS - 1) }
  } catch {
    return DEFAULT_DRAFT
  }
}

export default function Onboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>(readDraft)
  const [saving, setSaving] = useState<null | 'dashboard' | 'add' | 'samples'>(null)

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Draft persistence is a convenience only.
    }
  }, [draft])

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  // Steps pushed by this document can be unwound safely on finish; entries from before a reload cannot.
  const stepAtMount = useRef(draft.step)

  // Each step is a history entry, so the device Back button steps backwards instead of leaving the app.
  useEffect(() => {
    const base = (window.history.state as Record<string, unknown> | null) ?? {}
    window.history.replaceState({ ...base, onboardingStep: draft.step }, '', window.location.href)
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { onboardingStep?: unknown } | null)?.onboardingStep
      if (typeof s === 'number') setDraft((d) => ({ ...d, step: Math.min(Math.max(s, 0), STEPS - 1) }))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const next = () => {
    const step = Math.min(draft.step + 1, STEPS - 1)
    const base = (window.history.state as Record<string, unknown> | null) ?? {}
    const idx = typeof base.idx === 'number' ? base.idx : 0
    window.history.pushState({ ...base, idx: idx + 1, onboardingStep: step }, '', window.location.href)
    patch({ step })
  }
  const back = () => {
    const state = window.history.state as { onboardingStep?: unknown; idx?: unknown } | null
    if (state?.onboardingStep === draft.step && typeof state.idx === 'number' && state.idx > 0) window.history.back()
    else patch({ step: Math.max(draft.step - 1, 0) })
  }

  const { currency, services, leadDays } = draft
  const customCheck = useMemo(() => validateBudget(draft.customBudget, draft.currency), [draft.customBudget, draft.currency])
  const budget = useMemo(() => {
    if (draft.customBudget.trim() !== '') return customCheck.error ? null : customCheck.parsed
    return draft.budget
  }, [draft.budget, draft.customBudget, customCheck])

  const picked = useMemo(
    () =>
      services
        .map((id, index) => {
          const p = SERVICE_PRESETS.find((s) => s.id === id)
          return p ? { ...p, amount: localAmount(p.amount, currency), renewsOn: daysFromToday(estimatedRenewalOffset(index)) } : null
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [services, currency],
  )
  const monthlyTotal = picked.reduce((s, p) => s + toMonthly(p.amount, p.billingCycle), 0)
  const firstCharge = picked.length ? picked.reduce((a, b) => (a.renewsOn < b.renewsOn ? a : b)) : null

  const finishing = useRef(false)
  const finish = async (mode: 'dashboard' | 'add' | 'samples') => {
    if (finishing.current) return
    finishing.current = true
    setSaving(mode)
    try {
      await completeOnboarding({
        currency,
        monthlyBudget: budget,
        defaultReminderDays: leadDays,
        services: mode === 'samples' ? [] : services,
        loadSamples: mode === 'samples',
      })
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      toast.success(mode === 'samples' ? 'Sample subscriptions added' : picked.length ? `${picked.length} ${picked.length === 1 ? 'subscription' : 'subscriptions'} added` : 'You are set up')
      // Unwind only the step entries this document pushed, so Back from the dashboard does not walk through
      // finished onboarding and we never step back into an earlier document.
      const state = window.history.state as { onboardingStep?: unknown } | null
      const unwind = state?.onboardingStep === draft.step ? Math.max(0, draft.step - stepAtMount.current) : 0
      if (unwind > 0) navigate(-unwind)
      if (mode === 'add') window.setTimeout(() => navigate('/subscriptions/new'), unwind > 0 ? 80 : 0)
      else if (unwind === 0) navigate('/', { replace: true })
    } catch (e) {
      toast.error(describeError(e, 'save your setup'))
      setSaving(null)
    } finally {
      finishing.current = false
    }
  }

  const toggleService = (id: string) => {
    if (services.includes(id)) return patch({ services: services.filter((s) => s !== id) })
    if (services.length >= FREE_SUBSCRIPTION_LIMIT) {
      toast.info(`The free plan tracks ${FREE_SUBSCRIPTION_LIMIT}. Add more later with Premium.`)
      return
    }
    patch({ services: [...services, id] })
  }

  const budgetPills = BUDGET_PRESETS_USD.map((usd) => localAmount(usd, currency))

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-canvas">
      {draft.step === 0 ? (
        <Welcome onNext={next} />
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 pt-4 safe-top">
            <IconButton icon="chevronLeft" size={24} label="Back" className="-ml-2" onClick={back} />
            <Progress step={draft.step} />
            <span className="w-11 text-right text-[0.75rem] font-semibold text-muted">
              {draft.step + 1}/{STEPS}
            </span>
          </div>

          {draft.step === 1 && (
            <section className="rise flex flex-1 flex-col px-5 pt-5">
              <h1 className="text-[1.625rem] font-bold leading-tight text-navy-900">Which of these do you pay for?</h1>
              <p className="mt-2 text-[0.9375rem] text-muted">Tap everything that applies. Typical prices are filled in and you can adjust any of them later.</p>
              <label className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-2">
                <span className="text-[0.875rem] font-semibold text-navy-800">Prices in</span>
                <span className="relative">
                  <select
                    value={currency}
                    onChange={(e) => patch({ currency: e.target.value })}
                    className="h-11 appearance-none rounded-xl bg-navy-50 pl-3 pr-9 text-[0.875rem] font-semibold text-navy-900"
                    aria-label="Currency"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                </span>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-2.5" role="group" aria-label="Services">
                {SERVICE_PRESETS.map((p) => {
                  const on = services.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleService(p.id)}
                      className={`flex min-h-16 items-center gap-2.5 rounded-2xl border-2 bg-white px-3 py-2 text-left transition-colors ${on ? 'border-mint-500 bg-mint-50' : 'border-line'}`}
                    >
                      <ServiceMark name={p.name} color={categoryOf(p.categoryId).color} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.875rem] font-semibold leading-tight text-ink">{p.name}</span>
                        <span className="tabular block text-[0.75rem] text-muted">{formatMoney(localAmount(p.amount, currency), currency)}/mo</span>
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-mint-500 text-navy-900' : 'border-2 border-navy-100'}`}>
                        {on && <Icon name="check" size={12} />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-center text-[0.8125rem] text-muted">
                {picked.length === 0 ? 'Nothing yet? You can add anything else from the dashboard.' : `${picked.length} selected · about ${formatMoney(monthlyTotal, currency)} a month`}
              </p>
              <div className="sticky bottom-0 mt-auto -mx-5 bg-canvas/95 px-5 pt-3 pb-6 backdrop-blur safe-bottom">
                <Button full size="lg" onClick={next}>
                  {picked.length === 0 ? 'Continue without adding' : 'Continue'}
                </Button>
              </div>
            </section>
          )}

          {draft.step === 2 && (
            <section className="rise flex flex-1 flex-col px-5 pt-5">
              <h1 className="text-[1.625rem] font-bold leading-tight text-navy-900">What is a comfortable monthly limit?</h1>
              <p className="mt-2 text-[0.9375rem] text-muted">Your dashboard shows how close each month gets to it.</p>
              <div className="mt-5 grid grid-cols-2 gap-2.5" role="group" aria-label="Monthly limit">
                {budgetPills.map((b) => {
                  const on = draft.customBudget.trim() === '' && draft.budget === b
                  return (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={on}
                      onClick={() => patch({ budget: b, customBudget: '' })}
                      className={`tabular h-14 rounded-2xl border-2 bg-white text-[1.0625rem] font-bold transition-colors ${on ? 'border-mint-500 bg-mint-50 text-navy-900' : 'border-line text-navy-800'}`}
                    >
                      {formatMoney(b, currency, { compact: true })}
                    </button>
                  )
                })}
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[0.8125rem] font-semibold text-navy-800">Or type your own</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-[0.9375rem] font-semibold text-muted">{currencySymbol(currency)}</span>
                  <input
                    inputMode="decimal"
                    placeholder="120"
                    value={draft.customBudget}
                    onChange={(e) => patch({ customBudget: e.target.value })}
                    aria-invalid={!!customCheck.error}
                    aria-describedby={customCheck.error ? 'custom-limit-error' : undefined}
                    className={`h-13 w-full rounded-2xl border bg-white pl-12 pr-4 text-[1rem] placeholder:text-faint focus:border-navy-600 focus:ring-4 focus:ring-navy-600/10 ${customCheck.error ? 'border-coral-500' : 'border-line'}`}
                    aria-label="Custom monthly limit"
                  />
                </span>
                {customCheck.error && (
                  <span id="custom-limit-error" className="mt-1.5 block text-[0.8125rem] font-medium text-coral-700" role="alert">
                    {customCheck.error}
                  </span>
                )}
              </label>
              {picked.length > 0 && budget !== null && (
                <p className={`mt-3 rounded-xl px-4 py-3 text-[0.875rem] font-semibold ${monthlyTotal > budget ? 'bg-coral-50 text-coral-700' : 'bg-mint-50 text-mint-700'}`}>
                  {monthlyTotal > budget
                    ? `Your picks already total ${formatMoney(monthlyTotal, currency)}, ${formatMoney(monthlyTotal - budget, currency)} over this limit.`
                    : `Your picks total ${formatMoney(monthlyTotal, currency)}, leaving ${formatMoney(budget - monthlyTotal, currency)} of room.`}
                </p>
              )}

              <h2 className="mt-7 text-[1.0625rem] font-bold text-navy-900">How early should we warn you?</h2>
              <p className="mt-1 text-[0.875rem] text-muted">Renewals inside this window are flagged on your dashboard.</p>
              <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Heads-up before a charge">
                {([1, 3, 7, 14] as LeadDays[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={leadDays === d}
                    onClick={() => patch({ leadDays: d })}
                    className={`h-12 rounded-2xl border-2 bg-white text-[0.9375rem] font-semibold transition-colors ${leadDays === d ? 'border-mint-500 bg-mint-50 text-navy-900' : 'border-line text-muted'}`}
                  >
                    {d} {d === 1 ? 'day' : 'days'}
                  </button>
                ))}
              </div>
              <div className="sticky bottom-0 mt-auto -mx-5 bg-canvas/95 px-5 pt-3 pb-6 backdrop-blur safe-bottom">
                <Button full size="lg" onClick={next}>
                  {budget === null ? 'Skip the limit for now' : 'See my total'}
                </Button>
              </div>
            </section>
          )}

          {draft.step === 3 && (
            <section className="rise flex flex-1 flex-col px-5 pt-5">
              {picked.length > 0 ? (
                <>
                  <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-mint-700">Your first win</p>
                  <h1 className="mt-1 text-[1.625rem] font-bold leading-tight text-navy-900">You already know your number.</h1>
                  <div className="mt-4 rounded-3xl bg-navy-900 p-5 text-white">
                    <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-mint-400">Monthly total</p>
                    <p className="tabular mt-1 text-[2.5rem] font-bold leading-none">{formatMoney(monthlyTotal, currency)}</p>
                    <p className="mt-2 text-[0.875rem] text-navy-100">
                      {picked.length} {picked.length === 1 ? 'subscription' : 'subscriptions'} · {formatMoney(monthlyTotal * 12, currency, { compact: true })} a year
                    </p>
                    {budget !== null && (
                      <p className={`mt-3 rounded-xl px-3 py-2 text-[0.875rem] font-semibold ${monthlyTotal > budget ? 'bg-coral-500/20 text-coral-300' : 'bg-mint-500/15 text-mint-300'}`}>
                        {monthlyTotal > budget
                          ? `${formatMoney(monthlyTotal - budget, currency)} over your ${formatMoney(budget, currency, { compact: true })} limit`
                          : `${formatMoney(budget - monthlyTotal, currency)} under your ${formatMoney(budget, currency, { compact: true })} limit`}
                      </p>
                    )}
                  </div>
                  {firstCharge && (
                    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-100 text-coral-700">
                        <Icon name="bell" size={20} />
                      </span>
                      <span className="flex-1 text-[0.875rem] text-ink">
                        <span className="block font-semibold">Next charge: {firstCharge.name} on {formatDate(firstCharge.renewsOn, 'd MMM')}</span>
                        <span className="block text-[0.8125rem] text-muted">
                          We will flag it {leadDays} {leadDays === 1 ? 'day' : 'days'} before. Dates are estimates until you confirm them.
                        </span>
                      </span>
                    </div>
                  )}
                  <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
                    {picked.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                        <ServiceMark name={p.name} color={categoryOf(p.categoryId).color} size={32} />
                        <span className="flex-1 text-[0.875rem] font-semibold text-ink">{p.name}</span>
                        <span className="text-[0.75rem] text-muted">est. {formatDate(p.renewsOn, 'd MMM')}</span>
                        <span className="tabular text-[0.875rem] font-bold text-navy-900">{formatMoney(p.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="sticky bottom-0 mt-auto -mx-5 bg-canvas/95 px-5 pt-3 pb-6 backdrop-blur safe-bottom">
                    <Button full size="lg" variant="mint" loading={saving === 'dashboard'} disabled={saving !== null} onClick={() => finish('dashboard')} leading={<Icon name="arrowRight" size={20} />}>
                      Open my dashboard
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-mint-700">You are set up</p>
                  <h1 className="mt-1 text-[1.625rem] font-bold leading-tight text-navy-900">Now let us find your number.</h1>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                        <Icon name="wallet" size={20} />
                      </span>
                      <span className="flex-1 text-[0.875rem]">
                        <span className="block font-semibold text-ink">{budget === null ? 'No monthly limit yet' : `Monthly limit ${formatMoney(budget, currency)}`}</span>
                        <span className="block text-[0.8125rem] text-muted">Change it any time in Settings.</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-100 text-coral-700">
                        <Icon name="bell" size={20} />
                      </span>
                      <span className="flex-1 text-[0.875rem]">
                        <span className="block font-semibold text-ink">
                          Heads-up {leadDays} {leadDays === 1 ? 'day' : 'days'} before every charge
                        </span>
                        <span className="block text-[0.8125rem] text-muted">Your monthly total appears as soon as you add one subscription.</span>
                      </span>
                    </div>
                  </div>
                  <div className="sticky bottom-0 mt-auto -mx-5 space-y-2 bg-canvas/95 px-5 pt-3 pb-6 backdrop-blur safe-bottom">
                    <Button full size="lg" variant="mint" loading={saving === 'add'} disabled={saving !== null} onClick={() => finish('add')} leading={<Icon name="plus" size={20} />}>
                      Add my first subscription
                    </Button>
                    <Button full size="lg" variant="ghost" loading={saving === 'samples'} disabled={saving !== null} onClick={() => finish('samples')}>
                      Explore with sample data
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Progress({ step, light }: { step: number; light?: boolean }) {
  return (
    <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS} aria-label={`Step ${step + 1} of ${STEPS}`}>
      {Array.from({ length: STEPS }).map((_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-mint-500' : light ? 'bg-white/20' : 'bg-navy-100'}`} />
      ))}
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <section className="fade flex flex-1 flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-4 pt-4 safe-top">
        <Progress step={0} light />
        <span className="w-11 text-right text-[0.75rem] font-semibold text-navy-100">1/{STEPS}</span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-6 py-10">
        <svg width="64" height="64" viewBox="0 0 128 128" aria-hidden="true">
          <rect width="128" height="128" rx="28" fill="#12294B" />
          <circle cx="64" cy="64" r="34" fill="none" stroke="#5EEAD4" strokeWidth="10" />
          <path d="M64 38v26l16 10" fill="none" stroke="#FF7A6B" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="mt-8 text-[2.125rem] font-bold leading-[1.1]">
          Know your monthly total <span className="text-mint-400">before</span> the next charge lands.
        </h1>
        <p className="mt-4 text-[1rem] leading-relaxed text-navy-100">Two quick questions. In under a minute you will see what you really spend and which renewal is next.</p>
        <ul className="mt-8 space-y-3">
          {['Every renewal on one timeline', 'A monthly total that never surprises you', 'Notes on what to cancel before it renews'].map((t) => (
            <li key={t} className="flex items-center gap-3 text-[0.9375rem]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-mint-500 text-navy-900">
                <Icon name="check" size={16} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-6 pb-8 safe-bottom">
        <Button full size="lg" variant="mint" onClick={onNext} leading={<Icon name="arrowRight" size={20} />}>
          Show me my total
        </Button>
        <p className="mt-3 text-center text-[0.75rem] text-navy-100">Free for up to ten subscriptions. No account needed to start.</p>
        <Link to="/auth/sign-in" className="mt-2 flex h-12 items-center justify-center rounded-2xl text-[0.9375rem] font-semibold text-mint-400">
          Already have an account? Sign in
        </Link>
        <LegalLinks tone="dark" className="mt-1" />
      </div>
    </section>
  )
}
