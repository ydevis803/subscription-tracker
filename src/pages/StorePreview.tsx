import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BottomNav } from '@/components/layout/BottomNav'
import { Logo } from '@/components/ui/Logo'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Card, ProgressBar, SectionTitle, ServiceMark } from '@/components/ui/Primitives'
import { Button, Chip } from '@/components/ui/Button'
import { categoryTotals } from '@/components/app/CategoryBreakdown'
import { SubscriptionRow } from '@/components/app/SubscriptionRow'
import { categoryOf } from '@/lib/categories'
import { daysFromToday, formatDate, renewalsInRange, todayISO, relativeLower } from '@/lib/dates'
import { formatMoney, monthlyEquivalent, toMonthly } from '@/lib/money'
import { PREMIUM_FEATURES, price, YEARLY_PER_MONTH, YEARLY_SAVING_PCT } from '@/lib/plan'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { DEMO_BUDGET, DEMO_NAME, DEMO_NOTES, DEMO_PRICE_CHANGES, DEMO_SUBSCRIPTIONS } from '@/lib/demoData'
import NotFound from '@/pages/NotFound'

/**
 * Owner-only staging of five store screenshots. Every frame renders from src/lib/demoData.ts and the real
 * design-system components, never from the database, so no private data can appear. Reachable in development
 * builds, or in production only with ?key= matching VITE_STORE_PREVIEW_KEY.
 */
export default function StorePreview() {
  const key = (import.meta.env.VITE_STORE_PREVIEW_KEY as string | undefined)?.trim()
  const provided = new URLSearchParams(window.location.search).get('key')
  const allowed = import.meta.env.DEV || (!!key && provided === key)
  if (!allowed) return <NotFound />

  const currency = 'USD'
  const subs = DEMO_SUBSCRIPTIONS
  const monthly = monthlyEquivalent(subs)
  const totals = categoryTotals(subs)
  const next7 = renewalsInRange(subs, todayISO(), daysFromToday(7))
  const next30 = renewalsInRange(subs, todayISO(), daysFromToday(30))
  const due7 = next7.reduce((s, o) => s + o.amount, 0)
  const due30 = next30.reduce((s, o) => s + o.amount, 0)
  const active = subs.filter((s) => s.status === 'active')
  const freed = toMonthly(69.99, 'yearly')
  const openNoteIds = new Set(DEMO_NOTES.filter((n) => n.status === 'open').map((n) => n.subscriptionId))

  return (
    <div className="min-h-dvh bg-[#0B1F3A] px-4 py-6 text-white">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3">
        <Logo size={36} tile={false} />
        <div>
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-400">Owner preview · not linked from the app</p>
          <h1 className="text-[1.25rem] font-bold leading-tight">Store screenshots</h1>
        </div>
        <p className="ml-auto hidden text-[0.8125rem] text-navy-100 sm:block">
          Demo data only. Capture with <code className="rounded bg-white/10 px-1.5 py-0.5">npm run store:shots</code>
        </p>
        <Link to="/__listing" className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-3 text-[0.8125rem] font-semibold">
          Listing copy
        </Link>
      </div>

      <div className="mx-auto mt-6 flex max-w-[1400px] snap-x snap-mandatory gap-6 overflow-x-auto pb-6 no-scrollbar">
        {/* 1 · Outcome-led Home */}
        <Frame id="home" headline="See every renewal before it charges" tone="navy" nav="/">
          <div className="bg-navy-900 pb-16 text-white">
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Logo size={36} tile={false} />
                  <div>
                    <p className="text-[0.8125rem] font-medium text-navy-100">Good morning</p>
                    <p className="text-[1.375rem] font-bold leading-tight">{DEMO_NAME}</p>
                  </div>
                </div>
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                  <Icon name="bell" size={22} />
                  <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-700 px-1 text-[0.6875rem] font-bold">2</span>
                </span>
              </div>
              <p className="mt-6 flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-wide text-mint-400">
                Monthly total <Icon name="chevronRight" size={14} />
              </p>
              <p className="tabular mt-1 text-[2.75rem] font-bold leading-none">{formatMoney(monthly, currency)}</p>
              <p className="mt-2 text-[0.875rem] text-navy-100">
                {active.length} active subscriptions · {formatMoney(monthly * 12, currency, { compact: true })} a year
              </p>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[0.8125rem]">
                  <span className="text-navy-100">Budget {formatMoney(DEMO_BUDGET, currency)}</span>
                  <span className="font-semibold text-mint-400">{formatMoney(DEMO_BUDGET - monthly, currency)} left</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-mint-500" style={{ width: `${Math.round((monthly / DEMO_BUDGET) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
          <div className="-mt-12 space-y-5 px-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Next 7 days" value={formatMoney(due7, currency)} sub={`${next7.length} renewals`} accent="coral" />
              <Stat label="Next 30 days" value={formatMoney(due30, currency)} sub="Actual charges due" accent="mint" />
            </div>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Today · {formatDate(todayISO(), 'EEE d MMM')}</p>
                <Dots done={5} />
              </div>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                  <Icon name="check" size={22} />
                </span>
                <div>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">All clear</p>
                  <p className="text-[1.0625rem] font-bold leading-tight text-navy-900">Nothing will surprise you for 30 days</p>
                  <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                    {next30.length} renewals worth {formatMoney(due30, currency)} reviewed this morning. Next check in a week.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[0.8125rem] text-muted">
                <Icon name="sparkle" size={16} className="text-mint-700" /> 5 days in a row · best 12
              </div>
            </Card>
          </div>
        </Frame>

        {/* 2 · Renewal timeline with category totals and notes */}
        <Frame id="timeline" headline="One timeline, every category total" tone="light" nav="/calendar">
          <Header title="Renewal timeline" subtitle={`${formatMoney(due30, currency)} in the next 30 days`} />
          <div className="space-y-4 px-4 pb-24">
            <Card className="p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Next 30 days</p>
                  <p className="tabular text-[2.125rem] font-bold leading-none text-navy-900">{formatMoney(due30, currency)}</p>
                </div>
                <div className="flex gap-1">
                  {['7d', '14d', '30d', '60d'].map((h) => (
                    <span key={h} className={`flex h-9 min-w-10 items-center justify-center rounded-full px-2 text-[0.8125rem] font-semibold ${h === '30d' ? 'bg-navy-900 text-white' : 'text-muted'}`}>
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                {totals.map((c) => (
                  <div key={c.id} style={{ width: `${(c.monthly / monthly) * 100}%`, background: c.color }} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {totals.slice(0, 4).map((c, i) => (
                  <Chip key={c.id} selected={i === 0} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.name} <span className="tabular opacity-80">{formatMoney(c.monthly, currency, { compact: true })}</span>
                  </Chip>
                ))}
              </div>
            </Card>
            <Card className="divide-y divide-line overflow-hidden">
              {next30.slice(0, 4).map((o, i) => {
                const note = DEMO_NOTES.find((n) => n.subscriptionId === o.subscription.id && n.status === 'open')
                return (
                  <div key={o.subscription.id} className={i === 1 ? 'bg-mint-50' : ''}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <ServiceMark name={o.subscription.name} color={categoryOf(o.subscription.categoryId).color} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-semibold text-ink">{o.subscription.name}</span>
                        <span className="block text-[0.8125rem] text-muted">
                          {formatDate(o.date, 'EEE d MMM')} · {relativeLower(o.date)}
                        </span>
                      </span>
                      <span className="tabular text-[0.9375rem] font-bold text-navy-900">{formatMoney(o.amount, currency)}</span>
                    </div>
                    {note && (
                      <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2 text-[0.8125rem] leading-snug text-navy-900">
                        <Icon name="note" size={16} className="mt-0.5 shrink-0 text-coral-700" />
                        <span>
                          <span className="font-semibold">Decide by {formatDate(note.remindOn!, 'd MMM')}:</span> {note.content}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>
          </div>
        </Frame>

        {/* 3 · Subscription list */}
        <Frame id="list" headline="Your whole list, at a glance" tone="light" nav="/subscriptions">
          <Header title="Subscriptions" subtitle={`${active.length} active · ${formatMoney(monthly, currency)} a month`} />
          <div className="space-y-3 px-4 pb-24">
            <div className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-white px-4 text-[0.9375rem] text-faint">
              <Icon name="search" size={18} /> Search name, card, notes or price
            </div>
            <div className="flex gap-2">
              {['All', 'Active', 'Paused', 'Trials'].map((c, i) => (
                <Chip key={c} selected={i === 0}>
                  {c}
                </Chip>
              ))}
            </div>
            <p className="px-1 text-[0.8125rem] text-muted">
              {subs.length} of {subs.length} · {active.length} of {FREE_SUBSCRIPTION_LIMIT} free
            </p>
            <Card className="divide-y divide-line overflow-hidden">
              {subs.slice(0, 4).map((s) => (
                <SubscriptionRow key={s.id} sub={s} hasOpenNote={openNoteIds.has(s.id!)} />
              ))}
            </Card>
          </div>
        </Frame>

        {/* 4 · Visible progress */}
        <Frame id="progress" headline="Progress you can feel" tone="light" nav="/profile">
          <Header title="Cancellation notes" subtitle="Decisions with a date" />
          <div className="space-y-4 px-4 pb-24">
            <Card className="p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Decisions made</p>
                  <p className="tabular text-[1.75rem] font-bold leading-none text-navy-900">
                    7 <span className="text-[1rem] font-semibold text-muted">of 9</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Freed per month</p>
                  <p className="tabular text-[1.375rem] font-bold leading-none text-mint-700">{formatMoney(freed + 12.99, currency)}</p>
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={7} max={9} label="7 of 9 decisions made" />
              </div>
              <p className="mt-2 text-[0.8125rem] text-muted">2 still to decide · 3 decided this week</p>
              <p className="mt-2 flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2 text-[0.8125rem] text-navy-800">
                <Icon name="sparkle" size={16} className="shrink-0 text-mint-700" /> 3 more decisions to reach 10.
              </p>
            </Card>
            <Card className="overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-mint-700">Seven-day starter</p>
                    <p className="text-[1rem] font-bold leading-tight text-navy-900">Day 6 of 7</p>
                  </div>
                  <Dots done={5} current />
                </div>
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-mint-50 px-3 py-2 text-[0.8125rem] leading-snug text-navy-900">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-mint-700" />
                  <span>
                    <span className="font-semibold">Day 5 win:</span> Decision queued for Adobe Creative Cloud. It will come back before it renews.
                  </span>
                </p>
                <Button variant="mint" className="mt-3 w-full" leading={<Icon name="arrowRight" size={18} />}>
                  Open insights
                </Button>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                  <Icon name="sparkle" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-semibold text-ink">
                    5 days in a row <span className="ml-1 text-[0.8125rem] font-medium text-muted">best 12</span>
                  </p>
                  <p className="text-[0.8125rem] text-muted">Two more days for a full week.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className={`h-3 w-3 rounded-full ${i < 5 ? 'bg-mint-500' : 'bg-navy-100'}`} />
                ))}
              </div>
            </Card>
          </div>
        </Frame>

        {/* 5 · Premium value */}
        <Frame id="premium" headline="Premium pays for itself" tone="light">
          <Header title="Premium" />
          <div className="space-y-4 px-4 pb-8">
            <Card className="bg-navy-900 p-5 text-white">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-500 text-navy-900">
                <Icon name="crown" size={24} />
              </span>
              <p className="mt-4 text-[1.5rem] font-bold leading-tight">Every charge in view before it lands.</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-navy-100">
                You track {active.length} subscriptions worth {formatMoney(monthly, currency)} a month. Premium removes the cap and adds the reports that find money to keep.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[0.8125rem] font-semibold">
                <Icon name="sparkle" size={14} className="text-mint-400" /> {price('monthly')}/month or {price('yearly')}/year
              </span>
            </Card>
            <section>
              <SectionTitle>What changes for you</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {[
                  ['list', 'Never hit the ten-subscription wall', `You track ${active.length} of ${FREE_SUBSCRIPTION_LIMIT} free slots. Premium keeps the list complete as life adds more.`],
                  ['trend', `See what ${formatMoney(DEMO_PRICE_CHANGES.reduce((s, c) => s + toMonthly(c.newAmount - c.previousAmount, c.subscriptionId === 4 ? 'yearly' : 'monthly'), 0), currency)} a month of increases costs you`, '3 price rises in the last year, totalled per plan.'],
                  ['calendar', `Know that ${formatDate(daysFromToday(18), 'MMMM')} costs ${formatMoney(due30 + 600, currency)}`, 'The 12-month projection shows the heavy months before they arrive.'],
                ].map(([icon, t, b]) => (
                  <div key={t as string} className="flex items-start gap-3 px-4 py-3.5">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700">
                      <Icon name={icon as IconName} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-semibold leading-snug text-ink">{t as string}</span>
                      <span className="block text-[0.8125rem] leading-snug text-muted">{b as string}</span>
                    </span>
                  </div>
                ))}
              </Card>
            </section>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative rounded-2xl border-2 border-mint-500 bg-mint-50 p-4">
                <span className="absolute -top-2.5 left-3 rounded-full bg-coral-700 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">Best value</span>
                <p className="text-[0.875rem] font-semibold text-navy-900">Yearly</p>
                <p className="tabular text-[1.375rem] font-bold text-navy-900">{price('yearly')}</p>
                <p className="text-[0.75rem] text-muted">per year</p>
                <p className="mt-1 text-[0.75rem] font-semibold text-mint-700">
                  {formatMoney(YEARLY_PER_MONTH, currency)}/mo · save {YEARLY_SAVING_PCT}%
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-white p-4">
                <p className="text-[0.875rem] font-semibold text-navy-900">Monthly</p>
                <p className="tabular text-[1.375rem] font-bold text-navy-900">{price('monthly')}</p>
                <p className="text-[0.75rem] text-muted">per month</p>
                <p className="mt-1 text-[0.75rem] text-muted">Cancel any time</p>
              </div>
            </div>
            <Button full size="lg" variant="mint" leading={<Icon name="crown" size={20} />}>
              Start Premium · {price('yearly')}/year
            </Button>
            <p className="text-center text-[0.75rem] text-muted">
              Includes: {PREMIUM_FEATURES.slice(0, 2).join(' · ')}
            </p>
          </div>
        </Frame>
      </div>
      <p className="mx-auto mt-2 max-w-[1400px] text-[0.75rem] text-navy-100">Frames are 390 × 844 points; the capture script renders them at 3× (1170 × 2532) into docs/store/.</p>
    </div>
  )
}

/** A phone frame: status bar, headline overlay, the staged screen, and the real bottom nav when the screen has one. */
function Frame({ id, headline, tone, nav, children }: { id: string; headline: string; tone: 'navy' | 'light'; nav?: string; children: ReactNode }) {
  return (
    <div className="shrink-0 snap-center">
      <div data-frame={id} className={`relative h-[844px] w-[390px] overflow-hidden rounded-[44px] ${tone === 'navy' ? 'bg-navy-900' : 'bg-canvas'} shadow-float ring-1 ring-white/10`}>
        <StatusBar dark={tone === 'navy'} />
        <div className={`px-6 pt-4 pb-3 ${tone === 'navy' ? 'bg-navy-900 text-white' : 'bg-canvas text-navy-900'}`}>
          <p className="text-[1.75rem] font-bold leading-[1.15] tracking-tight">{headline}</p>
        </div>
        <div className={`relative ${nav ? 'h-[calc(844px-54px-84px-64px)]' : 'h-[calc(844px-54px-84px)]'} overflow-hidden ${tone === 'navy' ? 'bg-canvas' : ''}`}>{children}</div>
        {nav && <BottomNav activePath={nav} static />}
      </div>
      <p className="mt-3 text-center text-[0.8125rem] text-navy-100">{id}</p>
    </div>
  )
}

function StatusBar({ dark }: { dark: boolean }) {
  return (
    <div className={`flex h-[54px] items-end justify-between px-7 pb-2 text-[0.9375rem] font-semibold ${dark ? 'bg-navy-900 text-white' : 'bg-canvas text-navy-900'}`} aria-hidden="true">
      <span className="tabular">9:41</span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-0.5">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className="w-1 rounded-sm bg-current" style={{ height: h }} />
          ))}
        </span>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1.5 4.5a9 9 0 0 1 13 0M4 7.2a5.5 5.5 0 0 1 8 0M6.5 9.8a2 2 0 0 1 3 0" />
        </svg>
        <span className="flex items-center gap-0.5">
          <span className="flex h-3 w-6 items-center rounded-[3px] border border-current p-[1.5px]">
            <span className="h-full w-4/5 rounded-[1.5px] bg-current" />
          </span>
          <span className="h-1.5 w-0.5 rounded-r-sm bg-current" />
        </span>
      </span>
    </div>
  )
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2 pb-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-full text-navy-900">
        <Icon name="chevronLeft" size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-tight text-navy-900">{title}</p>
        {subtitle && <p className="text-[0.8125rem] text-muted">{subtitle}</p>}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: 'coral' | 'mint' }) {
  return (
    <Card className="p-4">
      <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-muted">
        <span className={`h-2 w-2 rounded-full ${accent === 'coral' ? 'bg-coral-500' : 'bg-mint-500'}`} />
        {label}
      </span>
      <span className="tabular mt-1 block text-[1.375rem] font-bold text-navy-900">{value}</span>
      <span className="block text-[0.75rem] text-faint">{sub}</span>
    </Card>
  )
}

function Dots({ done, current = false }: { done: number; current?: boolean }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < done ? 'bg-mint-500' : i === done && current ? 'bg-white ring-2 ring-mint-500' : 'bg-navy-100'}`} />
      ))}
    </span>
  )
}

