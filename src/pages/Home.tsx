import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotes, usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { formatMoney, isCounted, monthlyEquivalent, toMonthly } from '@/lib/money'
import { daysFromToday, daysUntil, formatDate, formatRelative, renewalsInRange, todayISO, relativeLower } from '@/lib/dates'
import { categoryOf } from '@/lib/categories'
import { countedForLimit, isPremium } from '@/lib/plan'
import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { Page } from '@/components/layout/AppShell'
import { Card, EmptyState, ListSkeleton, ProgressBar, SectionTitle, ServiceMark, Skeleton } from '@/components/ui/Primitives'
import { Icon, type IconName } from '@/components/ui/Icon'
import { IconButton, TextLink } from '@/components/ui/Button'
import { CategoryBars, categoryTotals } from '@/components/app/CategoryBreakdown'
import { UpgradeBanner } from '@/components/app/Paywall'
import { CheckCard } from '@/components/app/CheckCard'
import { ContinueCard } from '@/components/app/RecentActivity'
import { TodayCard } from '@/components/app/TodayCard'
import { MilestoneCard } from '@/components/app/MilestoneCard'
import { FirstWinOffer } from '@/components/app/Paywall'
import { TrialCard, TrialEndedCard } from '@/components/app/TrialCards'
import { weeklySummary } from '@/lib/weekly'
import { db } from '@/db/schema'
import { useLiveQuery } from 'dexie-react-hooks'
import { useScopeKey } from '@/auth/AuthContext'
import { useActiveCheck, useLatestCompletedCheck } from '@/hooks/useData'
import { nextAction } from '@/lib/daily'
import { headlineInsights } from '@/lib/insights'
import { AccountExplainerSheet, SaveProgressCard } from '@/components/app/Account'
import { useAuth } from '@/auth/AuthContext'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const NUDGE_KEY = 'subscription-tracker.save-nudge-dismissed'

export default function Home() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const [explainer, setExplainer] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem(NUDGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const profile = useProfile()
  const settings = useSettings()
  const subs = useSubscriptions()
  const notes = useNotes()
  const priceChanges = usePriceChanges()

  const currency = profile?.currency ?? 'USD'
  const loading = !subs || !settings || !profile || !notes || !priceChanges

  const model = useMemo(() => {
    if (!subs || !settings || !notes || !priceChanges) return null
    const today = todayISO()
    const lead = settings.defaultReminderDays
    const window = Math.max(7, lead)
    const monthly = monthlyEquivalent(subs)
    const active = subs.filter(isCounted)
    const next7 = renewalsInRange(subs, today, daysFromToday(window))
    const next30 = renewalsInRange(subs, today, daysFromToday(30))
    const due7 = next7.reduce((s, o) => s + o.amount, 0)
    const due30 = next30.reduce((s, o) => s + o.amount, 0)
    const totals = categoryTotals(subs)
    const estimated = subs.filter((s) => s.renewalEstimated && s.status !== 'cancelled').length

    type Alert = { id: string; icon: IconName; tone: 'coral' | 'amber' | 'mint'; title: string; body: string; to: string }
    const alerts: Alert[] = []
    if (estimated > 0)
      alerts.push({
        id: 'estimated',
        icon: 'calendar',
        tone: 'mint',
        title: `${estimated} renewal ${estimated === 1 ? 'date is' : 'dates are'} estimated`,
        body: 'Open a subscription and set its real billing date so the timeline is exact.',
        to: '/subscriptions',
      })
    for (const s of subs) {
      if (s.status === 'trial' && s.trialEndsAt) {
        const d = daysUntil(s.trialEndsAt)
        if (d >= 0 && d <= window)
          alerts.push({
            id: `trial-${s.id}`,
            icon: 'clock',
            tone: 'amber',
            title: `${s.name} trial ends ${relativeLower(s.trialEndsAt)}`,
            body: `You will be charged ${formatMoney(s.amount, s.currency)} unless you cancel first.`,
            to: `/subscriptions/${s.id}`,
          })
      }
    }
    for (const n of notes) {
      if (n.status !== 'open' || !n.remindOn) continue
      const d = daysUntil(n.remindOn)
      if (d <= window) {
        const s = subs.find((x) => x.id === n.subscriptionId)
        if (!s) continue
        alerts.push({
          id: `note-${n.id}`,
          icon: 'note',
          tone: d <= 0 ? 'coral' : 'mint',
          title: `${d < 0 ? 'Overdue' : d === 0 ? 'Today' : formatRelative(n.remindOn)}: decide on ${s.name}`,
          body: n.content.length > 90 ? n.content.slice(0, 88) + '…' : n.content,
          to: `/subscriptions/${s.id}`,
        })
      }
    }
    const recentIncreases = priceChanges.filter((p) => p.newAmount > p.previousAmount && daysUntil(p.effectiveDate) >= -90)
    for (const p of recentIncreases.slice(0, 2)) {
      const s = subs.find((x) => x.id === p.subscriptionId)
      if (!s || !isCounted(s)) continue
      const delta = toMonthly(p.newAmount - p.previousAmount, s.billingCycle)
      alerts.push({
        id: `price-${p.id}`,
        icon: 'trend',
        tone: 'coral',
        title: `${s.name} went up ${formatMoney(p.newAmount - p.previousAmount, s.currency)}`,
        body: `That is ${formatMoney(delta, s.currency)} more per month since ${formatDate(p.effectiveDate, 'd MMM')}.`,
        to: '/history',
      })
    }
    const openNoteSubIds = new Set(notes.filter((n) => n.status === 'open').map((n) => n.subscriptionId))
    return { monthly, active, next7, due7, due30, totals, alerts: alerts.slice(0, 4), openNoteSubIds, lead, window }
  }, [subs, settings, notes, priceChanges])

  const budget = settings?.monthlyBudget ?? null
  const used = subs ? countedForLimit(subs) : 0
  const activeCheck = useActiveCheck()
  const latestCheck = useLatestCompletedCheck()
  const scopeKey = useScopeKey()
  const allChecks = useLiveQuery(() => db.renewalChecks.toArray(), [scopeKey])
  const todayAction = useMemo(
    () => (subs && notes && settings && activeCheck !== undefined && latestCheck !== undefined ? nextAction({ subs, notes, active: activeCheck, latest: latestCheck, lead: settings.defaultReminderDays }) : null),
    [subs, notes, settings, activeCheck, latestCheck],
  )
  const checkHandledByToday = todayAction?.kind === 'resume-check' || todayAction?.kind === 'start-check' || todayAction?.kind === 'confirm-renewal'
  const week = useMemo(
    () => (subs && notes && priceChanges && settings && allChecks && activeCheck !== undefined && latestCheck !== undefined ? weeklySummary({ subs, notes, changes: priceChanges, checks: allChecks, settings, active: activeCheck, latest: latestCheck, currency, offset: 0 }) : null),
    [subs, notes, priceChanges, settings, allChecks, activeCheck, latestCheck, currency],
  )
  const headline = useMemo(() => (subs && priceChanges ? headlineInsights(subs, priceChanges, currency, budget)[0] ?? null : null), [subs, priceChanges, currency, budget])

  return (
    <div>
      <div className="bg-navy-900 pb-16 text-white">
        <div className="mx-auto max-w-[480px] px-4 pt-4 safe-top">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-navy-100">{greeting()}</p>
              <h1 className="text-[22px] font-bold leading-tight">{profile ? profile.name || 'Your subscriptions' : <Skeleton className="h-6 w-28 bg-navy-700" />}</h1>
            </div>
            <IconButton icon="bell" label="Reminders" variant="light" onClick={() => navigate('/notes')}>
              {model && model.alerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 text-[11px] font-bold text-white">
                  {model.alerts.length}
                </span>
              )}
            </IconButton>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/total')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/total')}
            className="mt-6 block w-full cursor-pointer rounded-2xl text-left active:bg-white/5"
            aria-label="Monthly total details"
          >
            <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-mint-400">
              Monthly total <Icon name="chevronRight" size={14} className="text-mint-400" />
            </p>
            {loading || !model ? (
              <Skeleton className="mt-2 h-12 w-48 bg-navy-700" />
            ) : (
              <p className="tabular mt-1 text-[44px] font-bold leading-none">{formatMoney(model.monthly, currency)}</p>
            )}
            {model && (
              <p className="mt-2 text-[14px] text-navy-100">
                {model.active.length} active {model.active.length === 1 ? 'subscription' : 'subscriptions'} · {formatMoney(model.monthly * 12, currency, { compact: true })} a year
              </p>
            )}
            {model && budget !== null && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span className="text-navy-100">Budget {formatMoney(budget, currency)}</span>
                  <span className={`font-semibold ${model.monthly > budget ? 'text-coral-400' : 'text-mint-400'}`}>
                    {model.monthly > budget
                      ? `${formatMoney(model.monthly - budget, currency)} over`
                      : `${formatMoney(budget - model.monthly, currency)} left`}
                  </span>
                </div>
                <ProgressBar value={model.monthly} max={budget} tone={model.monthly > budget ? 'coral' : 'mint'} />
              </div>
            )}
          </div>
        </div>
      </div>

      <Page className="-mt-12 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={`Next ${model ? model.window : 7} days`}
            value={model ? formatMoney(model.due7, currency) : null}
            sub={model ? `${model.next7.length} ${model.next7.length === 1 ? 'renewal' : 'renewals'}` : ''}
            onClick={() => navigate('/calendar')}
            accent="coral"
          />
          <StatCard
            label="Next 30 days"
            value={model ? formatMoney(model.due30, currency) : null}
            sub="Actual charges due"
            onClick={() => navigate('/calendar')}
            accent="mint"
          />
        </div>

        {subs && notes && settings && priceChanges && allChecks && (
          <MilestoneCard subs={subs} notes={notes} changes={priceChanges} checks={allChecks} settings={settings} currency={currency} />
        )}
        {profile && settings && allChecks && !isPremium(profile) && <FirstWinOffer settings={settings} checks={allChecks} />}
        {subs && notes && settings && priceChanges && activeCheck !== undefined && latestCheck !== undefined && (
          <TodayCard subs={subs} notes={notes} changes={priceChanges} settings={settings} active={activeCheck} latest={latestCheck} currency={currency} />
        )}
        {profile && subs && priceChanges && notes && <TrialCard profile={profile} subs={subs} changes={priceChanges} notes={notes} currency={currency} />}
        {profile && subs && <TrialEndedCard profile={profile} subsCount={subs.length} />}
        {subs && !checkHandledByToday && <CheckCard subs={subs} currency={currency} />}
        {week && (
          <Card className="overflow-hidden">
            <button type="button" onClick={() => navigate('/week')} className="flex w-full items-center gap-3 p-4 text-left active:bg-navy-50">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                <Icon name="chart" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">Your week · {week.range.label}</span>
                <span className="block text-[13px] text-muted">
                  {week.completed.total === 0 ? 'Nothing logged yet' : `${week.completed.total} ${week.completed.total === 1 ? 'action' : 'actions'} on ${week.completed.activeDays} ${week.completed.activeDays === 1 ? 'day' : 'days'}`}
                  {' · '}
                  {Math.abs(week.change.delta) < 0.005 ? 'total unchanged' : `total ${week.change.delta < 0 ? 'down' : 'up'} ${formatMoney(Math.abs(week.change.delta), currency)}`}
                </span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
            </button>
          </Card>
        )}
        <ContinueCard />

        {model && model.alerts.length > 0 && (
          <section>
            <SectionTitle>Needs a decision</SectionTitle>
            <div className="space-y-2">
              {model.alerts.map((a) => (
                <Card key={a.id} className="overflow-hidden">
                  <button onClick={() => navigate(a.to)} className="flex w-full items-start gap-3 p-4 text-left active:bg-navy-50">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        a.tone === 'coral' ? 'bg-coral-100 text-coral-700' : a.tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-mint-100 text-mint-700'
                      }`}
                    >
                      <Icon name={a.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink">{a.title}</span>
                      <span className="block text-[13px] leading-snug text-muted">{a.body}</span>
                    </span>
                    <Icon name="chevronRight" size={18} className="mt-2 shrink-0 text-faint" />
                  </button>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle
            action={
              <TextLink onClick={() => navigate('/timeline')}>Full timeline</TextLink>
            }
          >
            Coming up
          </SectionTitle>
          {loading || !model ? (
            <ListSkeleton rows={3} />
          ) : model.next7.length === 0 ? (
            <Card>
              <EmptyState
                icon="calendar"
                tone="mint"
                title={subs && subs.length === 0 ? 'Nothing tracked yet' : 'Quiet week ahead'}
                body={subs && subs.length === 0 ? 'Add your first subscription and you will see it here before it renews, with the monthly total above.' : `No renewals in the next ${model.window} days. Nothing to do here.`}
                actionLabel={subs && subs.length === 0 ? 'Add a subscription' : 'See the calendar'}
                onAction={() => navigate(subs && subs.length === 0 ? '/subscriptions/new' : '/calendar')}
              />
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {model.next7.slice(0, 5).map((o) => {
                const cat = categoryOf(o.subscription.categoryId)
                const d = daysUntil(o.date)
                return (
                  <button
                    key={`${o.subscription.id}-${o.date}`}
                    onClick={() => navigate(`/subscriptions/${o.subscription.id}`)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-navy-50"
                  >
                    <ServiceMark name={o.subscription.name} color={cat.color} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="break-words text-[15px] font-semibold text-ink">{o.subscription.name}</span>
                        {model.openNoteSubIds.has(o.subscription.id!) && <Icon name="note" size={14} className="text-coral-600" />}
                      </span>
                      <span className={`block text-[13px] ${d <= model.lead ? 'font-semibold text-coral-700' : 'text-muted'}`}>
                        {o.subscription.status === 'trial' ? `Trial converts ${relativeLower(o.date)}` : formatRelative(o.date)} · {formatDate(o.date, 'EEE d MMM')}
                      </span>
                    </span>
                    <span className="tabular text-[15px] font-bold text-navy-900">{formatMoney(o.amount, o.subscription.currency)}</span>
                  </button>
                )
              })}
            </Card>
          )}
        </section>

        {model && model.next7.length + model.due30 > 0 && (
          <Card className="overflow-hidden">
            <button onClick={() => navigate('/timeline')} className="flex w-full items-center gap-3 p-4 text-left active:bg-navy-50">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral-100 text-coral-700">
                <Icon name="trend" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">Renewal timeline</span>
                <span className="block text-[13px] text-muted">See every charge in order, with category totals and your notes. Save it to your calendar.</span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-faint" />
            </button>
          </Card>
        )}

        {model && model.totals.length > 0 && settings?.insightsEnabled !== false && (
          <section>
            <SectionTitle
              action={
                <TextLink onClick={() => navigate('/insights')}>Insights</TextLink>
              }
            >
              Where it goes
            </SectionTitle>
            <Card className="p-4">
              <CategoryBars totals={model.totals} currency={currency} limit={3} />
              {headline && (
                <button type="button" onClick={() => navigate(headline.to ?? '/insights')} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-navy-50 px-3 py-2.5 text-left">
                  <Icon name={headline.icon} size={18} className={`shrink-0 ${headline.tone === 'coral' ? 'text-coral-700' : 'text-mint-700'}`} />
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-navy-800">{headline.text}</span>
                  <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                </button>
              )}
            </Card>
          </section>
        )}

        {status === 'guest' && subs && subs.length > 0 && !nudgeDismissed && (
          <SaveProgressCard
            count={subs.length}
            onOpen={() => setExplainer(true)}
            onDismiss={() => {
              setNudgeDismissed(true)
              try {
                localStorage.setItem(NUDGE_KEY, '1')
              } catch {
                // ignore
              }
            }}
          />
        )}

        {profile && !isPremium(profile) && subs && used >= FREE_SUBSCRIPTION_LIMIT && <UpgradeBanner used={used} />}

        <div className="grid grid-cols-2 gap-3">
          <QuickAction icon="plus" label="Add subscription" onClick={() => navigate('/subscriptions/new')} />
          <QuickAction icon="note" label="Cancellation notes" onClick={() => navigate('/notes')} />
        </div>
      </Page>
      <AccountExplainerSheet open={explainer} onClose={() => setExplainer(false)} />
    </div>
  )
}

function StatCard({ label, value, sub, onClick, accent }: { label: string; value: string | null; sub: string; onClick: () => void; accent: 'coral' | 'mint' }) {
  return (
    <Card className="overflow-hidden">
      <button onClick={onClick} className="w-full p-4 text-left active:bg-navy-50">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
          <span className={`h-2 w-2 rounded-full ${accent === 'coral' ? 'bg-coral-500' : 'bg-mint-500'}`} />
          {label}
        </span>
        {value === null ? <Skeleton className="mt-2 h-7 w-24" /> : <span className="tabular mt-1 block text-[22px] font-bold text-navy-900">{value}</span>}
        <span className="block text-[12px] text-faint">{sub}</span>
      </button>
    </Card>
  )
}

function QuickAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[14px] font-semibold text-navy-900 shadow-card active:bg-navy-50">
      <Icon name={icon} size={18} className="text-mint-700" />
      {label}
    </button>
  )
}
