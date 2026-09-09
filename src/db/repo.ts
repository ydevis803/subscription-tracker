import {
  CATEGORIES,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  PREMIUM_PRICING,
  db,
  type CancellationNote,
  type PremiumInterval,
  type PriceChange,
  type Profile,
  type ActivityEntry,
  type BillingEvent,
  type CheckDecision,
  type CheckSummary,
  type OwnerId,
  type RenewalCheck,
  type Settings,
  type Subscription,
  type SubscriptionStatus,
  currentOwnerId,
} from './schema'
import { PlanLimitError, canAddSubscription } from '@/lib/plan'
import { addCycle, daysFromToday, daysUntil, formatDate, renewalsInRange, rollForward, todayISO, toISO } from '@/lib/dates'
import { formatMoney, monthlyEquivalent, toMonthly } from '@/lib/money'
import { estimatedRenewalOffset, localAmount, presetById } from '@/lib/services'
import { addMonths, addYears } from 'date-fns'
import { seedSampleData } from './seed'

function nowISO(): string {
  return new Date().toISOString()
}

/** Ownership stamp for every new private record in the active database. */
function owner() {
  return currentOwnerId()
}

/** Make sure singleton rows and categories exist. Safe to call on every boot. */
export async function ensureInitialized(): Promise<void> {
  await db.transaction('rw', db.profile, db.settings, db.categories, async () => {
    const ts = nowISO()
    if (!(await db.profile.get(1))) await db.profile.add({ ...DEFAULT_PROFILE, ownerId: owner(), createdAt: ts, updatedAt: ts })
    if (!(await db.settings.get(1))) await db.settings.add({ ...DEFAULT_SETTINGS, ownerId: owner(), createdAt: ts, updatedAt: ts })
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(CATEGORIES)
  })
}

/** Advance any renewal dates that have slipped into the past. */
export async function rolloverRenewals(): Promise<number> {
  const today = todayISO()
  const stale = await db.subscriptions.where('nextRenewalDate').below(today).toArray()
  let changed = 0
  for (const s of stale) {
    if (s.status === 'cancelled') continue
    const next = rollForward(s.nextRenewalDate, s.billingCycle, today)
    const patch: Partial<Subscription> = { nextRenewalDate: next, updatedAt: nowISO() }
    if (s.status === 'trial' && s.trialEndsAt && s.trialEndsAt < today) {
      patch.status = 'active'
      patch.trialEndsAt = null
    }
    await db.subscriptions.update(s.id!, patch)
    changed++
  }
  return changed
}

// ---------- Profile & settings ----------

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  await db.profile.update(1, { ...patch, updatedAt: nowISO() })
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update(1, { ...patch, updatedAt: nowISO() })
}

// ---------- Invitations ----------

/** Log one shared invitation. Only the moment and the method are kept; never the recipient. */
export async function recordInvite(via: 'share' | 'copy-link' | 'copy-message'): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(1)
    if (!s) return
    const invites = [...(s.invites ?? []), { at: nowISO(), via }].slice(-200)
    await db.settings.update(1, { invites, updatedAt: nowISO() })
  })
}

export async function dismissInviteNudge(): Promise<void> {
  await db.settings.update(1, { inviteNudgeDismissed: todayISO(), updatedAt: nowISO() })
}

// ---------- Rating and private feedback ----------

function promptOf(s: Settings) {
  return s.ratingPrompt ?? { askedAt: [], dismissedAt: null, outcome: null, score: null, answeredAt: null }
}

/** The prompt was shown (or "Not now" was tapped). Each ask is dated so the frequency cap can be enforced. */
export async function recordRatingAsk(): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(1)
    if (!s) return
    const p = promptOf(s)
    const last = p.askedAt[p.askedAt.length - 1]
    if (last && toISO(new Date(last)) === todayISO()) return // one ask per day, however often Home re-renders
    await db.settings.update(1, { ratingPrompt: { ...p, askedAt: [...p.askedAt, nowISO()].slice(-20) }, updatedAt: nowISO() })
  })
}

/** "Not now": hide the prompt immediately; the cooldown counts from this ask. */
export async function recordRatingDismiss(): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(1)
    if (!s) return
    await db.settings.update(1, { ratingPrompt: { ...promptOf(s), dismissedAt: nowISO() }, updatedAt: nowISO() })
  })
}

/** A score was given. 'rated' means the store CTA was taken, 'feedback' that a private note was written. Ends the prompt for good. */
export async function recordRatingOutcome(outcome: 'rated' | 'feedback', score: number): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(1)
    if (!s) return
    const p = promptOf(s)
    await db.settings.update(1, { ratingPrompt: { ...p, outcome, score, answeredAt: nowISO() }, updatedAt: nowISO() })
  })
}

/** Keep a private feedback note with the user's own data. Nothing is sent anywhere. */
export async function saveFeedback(entry: { score: number | null; message: string; source: 'prompt' | 'settings' }): Promise<void> {
  const message = entry.message.trim()
  if (!message) throw new Error('Write a line or two first so the note has something in it.')
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(1)
    if (!s) return
    const feedback = [...(s.feedback ?? []), { at: nowISO(), score: entry.score, message, source: entry.source }].slice(-100)
    await db.settings.update(1, { feedback, updatedAt: nowISO() })
  })
}

// ---------- Daily check-in ----------

/** Record today's visit. Returns the day of the previous visit (null on the first ever). */
export async function recordVisit(): Promise<string | null> {
  return db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(1)
    if (!current) return null
    const today = todayISO()
    const checkIns = current.checkIns ?? []
    const previous = checkIns.length ? checkIns[checkIns.length - 1] : null
    if (previous === today) return current.lastVisit ?? null
    await db.settings.update(1, { checkIns: [...checkIns, today].slice(-90), lastVisit: previous, updatedAt: nowISO() })
    return previous
  })
}

/** Raise the stored best streak if the given value beats it. Never lowers it. */
export async function raiseBestStreak(value: number): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(1)
    if (!current) return
    if (value > (current.bestStreak ?? 0)) await db.settings.update(1, { bestStreak: value, updatedAt: nowISO() })
  })
}

/** Record that milestone cards were shown, so they are never replayed. */
export async function markMilestonesSeen(ids: string[]): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(1)
    if (!current) return
    const seen = { ...(current.milestonesSeen ?? {}) }
    let changed = false
    for (const id of ids) {
      if (!seen[id]) {
        seen[id] = nowISO()
        changed = true
      }
    }
    if (changed) await db.settings.update(1, { milestonesSeen: seen, updatedAt: nowISO() })
  })
}

// ---------- Recent activity ----------

const ACTIVITY_LIMIT = 12

/** Upsert a recent-activity entry by key, newest first. */
export async function recordActivity(entry: Omit<ActivityEntry, 'at'>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(1)
    if (!current) return
    const rest = (current.recentActivity ?? []).filter((e) => e.key !== entry.key)
    const list = [{ ...entry, at: nowISO() }, ...rest].slice(0, ACTIVITY_LIMIT)
    await db.settings.update(1, { recentActivity: list, updatedAt: nowISO() })
  })
}

/** Remove one history item. The check, subscriptions or notes it pointed at are untouched. */
export async function clearActivity(key: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(1)
    if (!current) return
    await db.settings.update(1, { recentActivity: (current.recentActivity ?? []).filter((e) => e.key !== key), updatedAt: nowISO() })
  })
}

export async function clearAllActivity(): Promise<void> {
  await db.settings.update(1, { recentActivity: [], updatedAt: nowISO() })
}

/** Change the monthly limit and keep a record of the change. No-op when the value is unchanged. */
export async function setMonthlyBudget(amount: number | null): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(1)
    if (!current) throw new Error('Settings not found')
    if ((current.monthlyBudget ?? null) === amount) return
    const history = [...(current.monthlyBudgetHistory ?? []), { amount, changedAt: nowISO() }].slice(-50)
    await db.settings.update(1, { monthlyBudget: amount, monthlyBudgetHistory: history, updatedAt: nowISO() })
  })
  await recordActivity({ key: 'total', kind: 'total', title: 'Monthly total', subtitle: amount === null ? 'Limit cleared' : `Limit set to ${formatMoney(amount, (await db.profile.get(1))?.currency ?? 'USD')}`, path: '/total', status: 'position' })
}

export async function completeOnboarding(input: {
  name?: string
  currency: string
  goal?: Profile['goal']
  monthlyBudget: number | null
  defaultReminderDays: number
  loadSamples?: boolean
  /** Service preset ids picked during onboarding; created as subscriptions with estimated dates. */
  services?: string[]
}): Promise<void> {
  // Write everything before flipping onboardingComplete so a reload mid-way never lands on an empty dashboard.
  await updateSettings({ defaultReminderDays: input.defaultReminderDays })
  await setMonthlyBudget(input.monthlyBudget)
  if (input.services && input.services.length > 0 && (await db.subscriptions.count()) === 0) {
    await createFromPresets(input.services, input.currency)
  }
  if (input.loadSamples && (await db.subscriptions.count()) === 0) {
    await seedSampleData(input.currency)
  }
  const existing = await db.profile.get(1)
  await updateProfile({
    name: input.name ?? existing?.name ?? '',
    currency: input.currency,
    goal: input.goal ?? 'avoid-surprises',
    onboardingComplete: true,
    setupServices: input.services ?? [],
    setupCompletedAt: nowISO(),
    onboardingAnswers: {
      services: input.services ?? [],
      monthlyLimit: input.monthlyBudget,
      leadDays: input.defaultReminderDays,
      currency: input.currency,
      completedAt: nowISO(),
    },
  })
}

/** Create subscriptions from onboarding presets. Renewal dates are estimates until the user confirms them. */
export async function createFromPresets(ids: string[], currency: string): Promise<number[]> {
  const ts = nowISO()
  const rows: Subscription[] = []
  ids.forEach((id, index) => {
    const p = presetById(id)
    if (!p) return
    rows.push({
      name: p.name,
      categoryId: p.categoryId,
      amount: localAmount(p.amount, currency),
      currency,
      billingCycle: p.billingCycle,
      nextRenewalDate: daysFromToday(estimatedRenewalOffset(index)),
      startDate: todayISO(),
      status: 'active',
      paymentMethod: '',
      website: p.website,
      notes: '',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
      renewalEstimated: true,
      ownerId: owner(),
      createdAt: ts,
      updatedAt: ts,
    })
  })
  const created = await db.subscriptions.bulkAdd(rows, { allKeys: true })
  return created as number[]
}

// ---------- Subscriptions ----------

export type SubscriptionInput = Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>

export async function addSubscription(input: SubscriptionInput): Promise<number> {
  const profile = await db.profile.get(1)
  const existing = await db.subscriptions.toArray()
  if (!canAddSubscription(profile, existing)) throw new PlanLimitError()
  const ts = nowISO()
  const id = await db.subscriptions.add({ ...input, ownerId: owner(), createdAt: ts, updatedAt: ts })
  return id as number
}

/** Update a subscription; if the amount changed, a PriceChange row is recorded automatically. */
export async function updateSubscription(
  id: number,
  patch: Partial<SubscriptionInput>,
  priceChangeNote = '',
): Promise<void> {
  await db.transaction('rw', db.subscriptions, db.priceChanges, async () => {
    const current = await db.subscriptions.get(id)
    if (!current) throw new Error('Subscription not found')
    if (patch.amount !== undefined && Math.abs(patch.amount - current.amount) > 0.004) {
      const ts = nowISO()
      await db.priceChanges.add({
        ownerId: owner(),
        subscriptionId: id,
        previousAmount: current.amount,
        newAmount: patch.amount,
        effectiveDate: todayISO(),
        note: priceChangeNote,
        createdAt: ts,
        updatedAt: ts,
      })
    }
    await db.subscriptions.update(id, { ...patch, updatedAt: nowISO() })
  })
}

export async function setSubscriptionStatus(id: number, status: SubscriptionStatus): Promise<void> {
  const current = await db.subscriptions.get(id)
  if (!current) throw new Error('Subscription not found')
  const patch: Partial<Subscription> = { status, updatedAt: nowISO() }
  if (status === 'cancelled') patch.cancelledAt = todayISO()
  if (status === 'active') {
    patch.cancelledAt = null
    patch.trialEndsAt = null
    patch.nextRenewalDate = rollForward(current.nextRenewalDate, current.billingCycle)
  }
  if (current.status === 'cancelled' && status !== 'cancelled') {
    // Reactivating a cancelled subscription counts toward the free limit again.
    const profile = await db.profile.get(1)
    const all = await db.subscriptions.toArray()
    if (!canAddSubscription(profile, all.filter((s) => s.id !== id))) throw new PlanLimitError()
  }
  await db.subscriptions.update(id, patch)
}

export async function deleteSubscription(id: number): Promise<void> {
  await db.transaction('rw', db.subscriptions, db.priceChanges, db.cancellationNotes, async () => {
    await db.priceChanges.where('subscriptionId').equals(id).delete()
    await db.cancellationNotes.where('subscriptionId').equals(id).delete()
    await db.subscriptions.delete(id)
  })
}

/** Mark a renewal as paid: advance the next date by one billing cycle. */
export async function markRenewed(id: number): Promise<void> {
  const current = await db.subscriptions.get(id)
  if (!current) throw new Error('Subscription not found')
  const advanced = rollForward(addCycle(current.nextRenewalDate, current.billingCycle), current.billingCycle, todayISO())
  await db.subscriptions.update(id, { nextRenewalDate: advanced, updatedAt: nowISO() })
}

// ---------- Price changes ----------

export async function addPriceChange(input: Omit<PriceChange, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<void> {
  await db.transaction('rw', db.subscriptions, db.priceChanges, async () => {
    if (!(await db.subscriptions.get(input.subscriptionId))) throw new Error('Subscription not found')
    const ts = nowISO()
    await db.priceChanges.add({ ...input, ownerId: owner(), createdAt: ts, updatedAt: ts })
    if (input.effectiveDate <= todayISO()) {
      await db.subscriptions.update(input.subscriptionId, { amount: input.newAmount, updatedAt: nowISO() })
    }
  })
}

export async function deletePriceChange(id: number): Promise<void> {
  await db.priceChanges.delete(id)
}

// ---------- Cancellation notes ----------

export async function addNote(input: Omit<CancellationNote, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<number> {
  if (!(await db.subscriptions.get(input.subscriptionId))) throw new Error('Subscription not found')
  const ts = nowISO()
  return (await db.cancellationNotes.add({ ...input, ownerId: owner(), createdAt: ts, updatedAt: ts })) as number
}

export async function updateNote(id: number, patch: Partial<Omit<CancellationNote, 'id'>>): Promise<void> {
  await db.cancellationNotes.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteNote(id: number): Promise<void> {
  await db.cancellationNotes.delete(id)
}

/** Decide a note: keep the plan (note done) or cancel it (plan cancelled and note done). */
export async function decideNote(id: number, outcome: 'keep' | 'cancel'): Promise<void> {
  await db.transaction('rw', [db.cancellationNotes, db.subscriptions], async () => {
    const note = await db.cancellationNotes.get(id)
    if (!note) throw new Error('Note not found')
    if (outcome === 'cancel') {
      const sub = await db.subscriptions.get(note.subscriptionId)
      if (sub && sub.status !== 'cancelled') await db.subscriptions.update(sub.id!, { status: 'cancelled', cancelledAt: todayISO(), updatedAt: nowISO() })
    }
    await db.cancellationNotes.update(id, { status: 'done', updatedAt: nowISO() })
  })
}

/** Push a note's reminder forward by a few days. */
export async function snoozeNote(id: number, days: number): Promise<string> {
  const note = await db.cancellationNotes.get(id)
  if (!note) throw new Error('Note not found')
  const base = note.remindOn && note.remindOn > todayISO() ? note.remindOn : todayISO()
  const next = daysFromToday(Math.max(0, daysUntil(base)) + days)
  await db.cancellationNotes.update(id, { remindOn: next, updatedAt: nowISO() })
  return next
}

// ---------- Premium ----------

export async function upgradeToPremium(interval: PremiumInterval): Promise<void> {
  const today = todayISO()
  const renews = interval === 'monthly' ? toISO(addMonths(new Date(), 1)) : toISO(addYears(new Date(), 1))
  await db.transaction('rw', db.profile, db.billingEvents, async () => {
    const profile = await db.profile.get(1)
    const kind = profile?.plan === 'premium' ? 'interval-change' : 'upgrade'
    await db.profile.update(1, {
      plan: 'premium',
      premiumInterval: interval,
      premiumSince: profile?.premiumSince ?? today,
      premiumRenewsOn: renews,
    })
    await db.billingEvents.add({ ownerId: owner(), kind, plan: 'premium', interval, amount: PREMIUM_PRICING[interval], occurredAt: nowISO() })
  })
}

/** Start the one seven-day trial. Today counts as day 1; the last day is inclusive. */
export async function startTrial(): Promise<{ startedOn: string; endsOn: string }> {
  return db.transaction('rw', [db.profile, db.billingEvents], async () => {
    const profile = await db.profile.get(1)
    if (!profile) throw new Error('Profile not found')
    if (profile.trialStartedOn) throw new Error('The free trial has already been used on this profile.')
    const startedOn = todayISO()
    const endsOn = daysFromToday(6)
    await db.profile.update(1, { trialStartedOn: startedOn, trialEndsOn: endsOn, trialEndedSeen: null, updatedAt: nowISO() })
    await db.billingEvents.add({ ownerId: owner(), kind: 'upgrade', plan: 'premium', interval: null, amount: 0, occurredAt: nowISO() })
    return { startedOn, endsOn }
  })
}

/** End the trial today. Nothing else changes; every record stays. */
export async function endTrialNow(): Promise<void> {
  await db.profile.update(1, { trialEndsOn: daysFromToday(-1), updatedAt: nowISO() })
}

export async function markTrialEndedSeen(): Promise<void> {
  await db.profile.update(1, { trialEndedSeen: nowISO(), updatedAt: nowISO() })
}

export async function downgradeToFree(): Promise<void> {
  await db.transaction('rw', db.profile, db.billingEvents, async () => {
    await db.profile.update(1, { plan: 'free', premiumInterval: null, premiumRenewsOn: null })
    await db.billingEvents.add({ ownerId: owner(), kind: 'downgrade', plan: 'free', interval: null, amount: 0, occurredAt: nowISO() })
  })
}

// ---------- Data management ----------

export async function loadSamples(): Promise<void> {
  const profile = await db.profile.get(1)
  await seedSampleData(profile?.currency ?? 'USD')
}

export interface Snapshot {
  profile: Profile | undefined
  settings: Settings | undefined
  subscriptions: Subscription[]
  priceChanges: PriceChange[]
  cancellationNotes: CancellationNote[]
  billingEvents: BillingEvent[]
  renewalChecks?: RenewalCheck[]
}

export async function readSnapshot(): Promise<Snapshot> {
  const [subscriptions, priceChanges, cancellationNotes, profile, settings, billingEvents, renewalChecks] = await Promise.all([
    db.subscriptions.toArray(),
    db.priceChanges.toArray(),
    db.cancellationNotes.toArray(),
    db.profile.get(1),
    db.settings.get(1),
    db.billingEvents.toArray(),
    db.renewalChecks.toArray(),
  ])
  return { profile, settings, subscriptions, priceChanges, cancellationNotes, billingEvents, renewalChecks }
}

/** Replace the active database with a snapshot (used when pulling an account from the server). Every row is re-stamped with the active owner and orphans are dropped. */
export async function replaceWithSnapshot(snap: Snapshot): Promise<void> {
  const ownerId = owner()
  const ts = nowISO()
  const subs = (snap.subscriptions ?? []).map((s) => ({ ...s, ownerId, createdAt: s.createdAt || ts, updatedAt: s.updatedAt || s.createdAt || ts }))
  const ids = new Set(subs.map((s) => s.id).filter((id): id is number => id !== undefined))
  await db.transaction('rw', [db.subscriptions, db.priceChanges, db.cancellationNotes, db.profile, db.settings, db.billingEvents, db.categories, db.renewalChecks], async () => {
    await Promise.all([db.subscriptions.clear(), db.priceChanges.clear(), db.cancellationNotes.clear(), db.billingEvents.clear(), db.profile.clear(), db.settings.clear(), db.renewalChecks.clear()])
    await db.subscriptions.bulkAdd(subs)
    await db.renewalChecks.bulkAdd((snap.renewalChecks ?? []).map((c) => ({ ...c, ownerId })))
    await db.priceChanges.bulkAdd((snap.priceChanges ?? []).filter((p) => ids.has(p.subscriptionId)).map((p) => ({ ...p, ownerId, updatedAt: p.updatedAt || p.createdAt })))
    await db.cancellationNotes.bulkAdd((snap.cancellationNotes ?? []).filter((n) => ids.has(n.subscriptionId)).map((n) => ({ ...n, ownerId })))
    await db.billingEvents.bulkAdd((snap.billingEvents ?? []).map((b) => ({ ...b, ownerId })))
    await db.profile.add({ ...(snap.profile ?? { ...DEFAULT_PROFILE, createdAt: ts }), ownerId, updatedAt: snap.profile?.updatedAt ?? ts })
    await db.settings.add({ ...(snap.settings ?? DEFAULT_SETTINGS), ownerId, createdAt: snap.settings?.createdAt ?? ts, updatedAt: snap.settings?.updatedAt ?? ts })
    if ((await db.categories.count()) === 0) await db.categories.bulkAdd(CATEGORIES)
  })
}

/** Append another scope's subscriptions, notes and price changes into the active database with fresh ids. */
export async function mergeSnapshot(snap: Snapshot): Promise<number> {
  let added = 0
  await db.transaction('rw', [db.subscriptions, db.priceChanges, db.cancellationNotes], async () => {
    const ownerId = owner()
    const idMap = new Map<number, number>()
    for (const s of snap.subscriptions ?? []) {
      const { id, ...rest } = s
      const newId = (await db.subscriptions.add({ ...rest, ownerId, updatedAt: nowISO() })) as number
      if (id !== undefined) idMap.set(id, newId)
      added++
    }
    for (const p of snap.priceChanges ?? []) {
      const target = idMap.get(p.subscriptionId)
      if (target === undefined) continue
      const { id: _id, ...rest } = p
      await db.priceChanges.add({ ...rest, ownerId, subscriptionId: target, updatedAt: rest.updatedAt ?? rest.createdAt })
    }
    for (const n of snap.cancellationNotes ?? []) {
      const target = idMap.get(n.subscriptionId)
      if (target === undefined) continue
      const { id: _id, ...rest } = n
      await db.cancellationNotes.add({ ...rest, ownerId, subscriptionId: target })
    }
  })
  return added
}

export async function exportAllData(): Promise<string> {
  const snap = await readSnapshot()
  return JSON.stringify({ exportedAt: nowISO(), version: 3, ...snap }, null, 2)
}

// ---------- Renewal checks ----------

export const CHECK_WINDOW_DAYS = 30
/** A completed check counts as "all clear" for this long. */
export const CHECK_FRESH_DAYS = 7

export async function getActiveCheck(): Promise<RenewalCheck | undefined> {
  const open = await db.renewalChecks.filter((c) => c.completedAt === null).toArray()
  return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/** Start a check for the coming window, or return the one already in progress. */
export async function startCheck(): Promise<RenewalCheck> {
  const existing = await getActiveCheck()
  if (existing) return existing
  const ts = nowISO()
  const check: RenewalCheck = {
    ownerId: owner(),
    windowDays: CHECK_WINDOW_DAYS,
    periodStart: todayISO(),
    periodEnd: daysFromToday(CHECK_WINDOW_DAYS),
    startedAt: ts,
    completedAt: null,
    decisions: [],
    summary: null,
    createdAt: ts,
    updatedAt: ts,
  }
  const id = (await db.renewalChecks.add(check)) as number
  const upcoming = renewalsInRange(await db.subscriptions.toArray(), check.periodStart, check.periodEnd).length
  await recordActivity({ key: `check:${id}`, kind: 'check', title: 'Renewal check', subtitle: `0 of ${upcoming} reviewed`, path: '/check', status: 'in-progress' })
  return { ...check, id }
}

/**
 * Record (or change) a decision for one renewal. Effects on the subscription are applied here and reverted
 * when the decision changes, so going back to reconsider never leaves stray notes or a wrongly cancelled plan.
 */
export async function recordDecision(
  checkId: number,
  input: { subscriptionId: number; date: string; amount: number; decision: CheckDecision['decision']; leadDays: number },
): Promise<void> {
  await db.transaction('rw', [db.renewalChecks, db.subscriptions, db.cancellationNotes], async () => {
    const check = await db.renewalChecks.get(checkId)
    if (!check) throw new Error('Check not found')
    const key = `${input.subscriptionId}:${input.date}`
    const previous = check.decisions.find((d) => d.key === key)
    const sub = await db.subscriptions.get(input.subscriptionId)
    if (!sub) throw new Error('Subscription not found')

    if (previous && previous.decision !== input.decision) {
      if (previous.decision === 'cancel' && sub.status === 'cancelled') await db.subscriptions.update(sub.id!, { status: 'active', cancelledAt: null, updatedAt: nowISO() })
      if (previous.decision === 'remind' && previous.noteId) await db.cancellationNotes.delete(previous.noteId)
    }

    let noteId: number | null = previous?.decision === input.decision ? (previous.noteId ?? null) : null
    if (input.decision !== previous?.decision) {
      if (input.decision === 'cancel') {
        await db.subscriptions.update(sub.id!, { status: 'cancelled', cancelledAt: todayISO(), updatedAt: nowISO() })
      } else if (input.decision === 'remind') {
        const remindOn = daysFromToday(Math.max(0, daysUntil(input.date) - input.leadDays))
        const ts = nowISO()
        noteId = (await db.cancellationNotes.add({
          ownerId: owner(),
          subscriptionId: sub.id!,
          reason: 'other',
          content: `Decide about ${sub.name} before it renews on ${formatDate(input.date)} for ${formatMoney(input.amount, sub.currency)}.`,
          remindOn,
          status: 'open',
          createdAt: ts,
          updatedAt: ts,
        })) as number
      }
    }

    const decision: CheckDecision = { key, subscriptionId: input.subscriptionId, date: input.date, amount: input.amount, decision: input.decision, decidedAt: nowISO(), noteId }
    const decisions = previous ? check.decisions.map((d) => (d.key === key ? decision : d)) : [...check.decisions, decision]
    await db.renewalChecks.update(checkId, { decisions, updatedAt: nowISO() })
  })
  const after = await db.renewalChecks.get(checkId)
  if (after && !after.completedAt) {
    const total = Math.max(renewalsInRange(await db.subscriptions.toArray(), after.periodStart, after.periodEnd).length + after.decisions.filter((d) => d.decision === 'cancel').length, after.decisions.length)
    await recordActivity({ key: `check:${checkId}`, kind: 'check', title: 'Renewal check', subtitle: `${after.decisions.length} of ${total} reviewed`, path: '/check', status: 'in-progress' })
  }
}

export async function completeCheck(checkId: number, summary: CheckSummary): Promise<void> {
  await db.renewalChecks.update(checkId, { completedAt: nowISO(), summary, updatedAt: nowISO() })
}

/**
 * Complete the check if every renewal in its window has a decision. Reads everything fresh from the
 * database (not from live-query snapshots) so the summary always reflects the last decision made.
 */
export async function finishCheckIfDone(checkId: number): Promise<CheckSummary | null> {
  return db.transaction('rw', [db.renewalChecks, db.subscriptions], async () => {
    const check = await db.renewalChecks.get(checkId)
    if (!check) return null
    if (check.completedAt) return check.summary
    const subs = await db.subscriptions.toArray()
    const decided = new Set(check.decisions.map((d) => d.key))
    const pending = renewalsInRange(subs, check.periodStart, check.periodEnd).filter((o) => !decided.has(`${o.subscription.id}:${o.date}`))
    if (pending.length > 0) return null
    const ds = check.decisions
    const savedMonthly = ds
      .filter((d) => d.decision === 'cancel')
      .reduce((s, d) => {
        const sub = subs.find((x) => x.id === d.subscriptionId)
        return s + (sub ? toMonthly(d.amount, sub.billingCycle) : 0)
      }, 0)
    const summary: CheckSummary = {
      reviewed: ds.length,
      kept: ds.filter((d) => d.decision === 'keep').length,
      reminded: ds.filter((d) => d.decision === 'remind').length,
      cancelled: ds.filter((d) => d.decision === 'cancel').length,
      amountReviewed: ds.reduce((s, d) => s + d.amount, 0),
      monthlyTotal: monthlyEquivalent(subs),
      savedMonthly,
    }
    await db.renewalChecks.update(checkId, { completedAt: nowISO(), summary, updatedAt: nowISO() })
    return summary
  }).then(async (summary) => {
    if (summary) {
      const currency = (await db.profile.get(1))?.currency ?? 'USD'
      await recordActivity({
        key: `check:${checkId}`,
        kind: 'check',
        title: 'Renewal check',
        subtitle: summary.reviewed === 0 ? 'Nothing was due' : `${summary.reviewed} reviewed · ${formatMoney(summary.amountReviewed, currency)}${summary.cancelled ? ` · ${summary.cancelled} cancelled` : ''}`,
        path: `/check?id=${checkId}`,
        status: 'done',
      })
    }
    return summary
  })
}

/** Abandon an in-progress check without touching the decisions already applied. */
export async function discardCheck(checkId: number): Promise<void> {
  await db.renewalChecks.delete(checkId)
  await clearActivity(`check:${checkId}`)
}

export async function resetAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.subscriptions, db.priceChanges, db.cancellationNotes, db.profile, db.settings, db.billingEvents, db.renewalChecks],
    async () => {
      await Promise.all([
        db.subscriptions.clear(),
        db.priceChanges.clear(),
        db.cancellationNotes.clear(),
        db.billingEvents.clear(),
        db.profile.clear(),
        db.settings.clear(),
        db.renewalChecks.clear(),
      ])
      const ts = nowISO()
      await db.profile.add({ ...DEFAULT_PROFILE, ownerId: owner(), createdAt: ts, updatedAt: ts })
      await db.settings.add({ ...DEFAULT_SETTINGS, ownerId: owner(), createdAt: ts, updatedAt: ts })
    },
  )
}

/** Integrity report for the active database: ownership and parent links. */
export async function auditIntegrity(): Promise<{ ownerId: OwnerId; total: number; wrongOwner: number; orphans: number }> {
  const ownerId = owner()
  const [subs, prices, notes, events, profile, settings, checks] = await Promise.all([
    db.subscriptions.toArray(),
    db.priceChanges.toArray(),
    db.cancellationNotes.toArray(),
    db.billingEvents.toArray(),
    db.profile.get(1),
    db.settings.get(1),
    db.renewalChecks.toArray(),
  ])
  const ids = new Set(subs.map((s) => s.id))
  const rows: { ownerId?: OwnerId }[] = [...subs, ...prices, ...notes, ...events, ...checks, ...(profile ? [profile] : []), ...(settings ? [settings] : [])]
  const wrongOwner = rows.filter((r) => (r.ownerId ?? null) !== ownerId).length
  const orphans = prices.filter((p) => !ids.has(p.subscriptionId)).length + notes.filter((n) => !ids.has(n.subscriptionId)).length
  return { ownerId, total: rows.length, wrongOwner, orphans }
}
