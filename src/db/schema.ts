import Dexie, { type EntityTable } from 'dexie'

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type SubscriptionStatus = 'active' | 'trial' | 'paused' | 'cancelled'
export type PlanTier = 'free' | 'premium'
export type PremiumInterval = 'monthly' | 'yearly'
export type CategoryId =
  | 'streaming'
  | 'music'
  | 'productivity'
  | 'cloud'
  | 'fitness'
  | 'news'
  | 'gaming'
  | 'utilities'
  | 'finance'
  | 'other'
export type CancellationReason = 'too-expensive' | 'not-using' | 'switching' | 'trial-ending' | 'other'

/**
 * Every private record carries the id of the account that owns it. Guests (no account yet) use null.
 * The value is also enforced by keeping each account in its own local database.
 */
export type OwnerId = number | null

/** A recurring charge the user is tracking. */
export interface Subscription {
  id?: number
  ownerId?: OwnerId
  name: string
  categoryId: CategoryId
  amount: number
  currency: string
  billingCycle: BillingCycle
  /** ISO date (yyyy-mm-dd) of the next expected charge. */
  nextRenewalDate: string
  /** ISO date the subscription first started. */
  startDate: string
  status: SubscriptionStatus
  paymentMethod: string
  website: string
  notes: string
  /** ISO date a free trial converts to paid, if this is a trial. */
  trialEndsAt: string | null
  cancelledAt: string | null
  /** Per-subscription reminder override; null uses the global default. */
  reminderDaysBefore: number | null
  /** True when the renewal date was estimated during setup and not yet confirmed by the user. */
  renewalEstimated?: boolean
  createdAt: string
  updatedAt: string
}

/** A recorded change in what a subscription costs. Belongs to one subscription. */
export interface PriceChange {
  id?: number
  ownerId?: OwnerId
  subscriptionId: number
  previousAmount: number
  newAmount: number
  /** ISO date the new price took effect. */
  effectiveDate: string
  note: string
  createdAt: string
  updatedAt?: string
}

/** A note about cancelling or reconsidering a subscription, optionally with a reminder date. Belongs to one subscription. */
export interface CancellationNote {
  id?: number
  ownerId?: OwnerId
  subscriptionId: number
  reason: CancellationReason
  content: string
  /** ISO date to be reminded, or null. */
  remindOn: string | null
  status: 'open' | 'done'
  createdAt: string
  updatedAt: string
}

/** The single local user profile. */
export interface Profile {
  id: 1
  ownerId?: OwnerId
  name: string
  email: string
  currency: string
  goal: 'cut-costs' | 'avoid-surprises' | 'stay-organised'
  onboardingComplete: boolean
  plan: PlanTier
  premiumInterval: PremiumInterval | null
  premiumSince: string | null
  premiumRenewsOn: string | null
  /** Service preset ids chosen during onboarding; used to personalise the dashboard. */
  setupServices?: string[]
  setupCompletedAt?: string | null
  /** Everything the user answered during onboarding, kept with the profile. */
  onboardingAnswers?: OnboardingAnswers | null
  /** Seven-day Premium trial: local start day and inclusive last day. Only one trial per profile. */
  trialStartedOn?: string | null
  trialEndsOn?: string | null
  /** When the "trial ended" card was acknowledged, so it shows once. */
  trialEndedSeen?: string | null
  createdAt: string
  updatedAt?: string
}

export type ActivityKind = 'check' | 'timeline' | 'calendar' | 'total'

export interface ActivityEntry {
  /** Stable key so the same position is updated rather than duplicated (e.g. "check:12", "timeline"). */
  key: string
  kind: ActivityKind
  title: string
  subtitle: string
  /** Route that restores the position, including any state in the query string. */
  path: string
  status: 'in-progress' | 'done' | 'position'
  at: string
}

export interface OnboardingAnswers {
  services: string[]
  monthlyLimit: number | null
  leadDays: number
  currency: string
  completedAt: string
}

/** App-wide preferences. */
export interface Settings {
  id: 1
  ownerId?: OwnerId
  defaultReminderDays: number
  monthlyBudget: number | null
  notifyRenewals: boolean
  notifyPriceChanges: boolean
  notifyTrials: boolean
  weekStartsOn: 0 | 1
  showCancelledInList: boolean
  compactAmounts: boolean
  /** The timeline's beginner explanation has been dismissed. */
  timelineIntroSeen?: boolean
  /** Spending insights on Home and the Insights tab. Undefined means on. */
  insightsEnabled?: boolean
  /** Days (yyyy-MM-dd) on which the dashboard was opened, newest last, capped. Gaps are fine. */
  checkIns?: string[]
  /** The day of the previous dashboard visit, for a "since you were away" summary. */
  lastVisit?: string | null
  /** Longest streak of active days ever reached. Only ever raised, never lowered. */
  bestStreak?: number
  /** Milestone id → ISO timestamp of when its card was shown. A milestone is celebrated once. */
  milestonesSeen?: Record<string, string>
  /** When the one-time Premium offer after the first completed check was shown, and when it was dismissed. */
  premiumOfferSeen?: string
  premiumOfferDismissed?: string
  /** When to nudge the user to check renewals and the monthly total. See src/lib/reminders.ts. */
  reminderSchedule?: {
    days: number[]
    time: string
    paused: boolean
    pausedUntil: string | null
    browserNotifications: boolean
  }
  /** Recent positions worth returning to, newest first. Clearing an entry never touches the data behind it. */
  recentActivity?: ActivityEntry[]
  /** Every change to the monthly limit, newest last. null means the limit was cleared. */
  monthlyBudgetHistory?: { amount: number | null; changedAt: string }[]
  /** Invitations shared, newest last. Cosmetic badges only; the app never learns who received them. */
  invites?: { at: string; via: 'share' | 'copy-link' | 'copy-message' }[]
  /** Day (yyyy-MM-dd) the Home invite card was last dismissed; it stays away for a while after. */
  inviteNudgeDismissed?: string
  /** The rating prompt: every time it was shown, and the final outcome. Once rated or answered it never returns. See src/lib/feedback.ts. */
  ratingPrompt?: {
    askedAt: string[]
    /** When "Not now" was last tapped. The card stays for the rest of the day it appeared unless dismissed. */
    dismissedAt: string | null
    outcome: 'rated' | 'feedback' | null
    score: number | null
    answeredAt: string | null
  }
  /** The seven-day starter challenge. Days unlock in order and never expire; a missed day costs nothing. See src/lib/challenge.ts. */
  challenge?: {
    startedAt: string
    /** Day number (1–7) → ISO timestamp it was completed. */
    completed: Record<string, string>
    /** Feature key → ISO timestamp of the first visit since the challenge started. */
    visits: Record<string, string>
    /** Subscriptions with an estimated renewal date when the challenge started, so Day 3 can measure progress. */
    estimatedAtStart: number
    dismissedAt: string | null
  }
  /** Private feedback notes, newest last. Stored only with the user's own data; never posted anywhere. */
  feedback?: { at: string; score: number | null; message: string; source: 'prompt' | 'settings' }[]
  createdAt?: string
  updatedAt?: string
}

/** Spending category used for grouping and totals. */
export interface Category {
  id: CategoryId
  name: string
  color: string
  sortOrder: number
}

/** Plan changes for the user's own Subscription Tracker membership. */
export interface BillingEvent {
  id?: number
  ownerId?: OwnerId
  kind: 'upgrade' | 'downgrade' | 'interval-change'
  plan: PlanTier
  interval: PremiumInterval | null
  amount: number
  occurredAt: string
}

export type CheckDecisionKind = 'keep' | 'remind' | 'cancel'

/** One decision inside a renewal check, keyed by subscription and charge date. */
export interface CheckDecision {
  key: string
  subscriptionId: number
  date: string
  amount: number
  decision: CheckDecisionKind
  decidedAt: string
  /** Reminder note created by a "remind" decision, so changing the decision can remove it. */
  noteId?: number | null
}

export interface CheckSummary {
  reviewed: number
  kept: number
  reminded: number
  cancelled: number
  amountReviewed: number
  monthlyTotal: number
  savedMonthly: number
}

/** A guided pass over the upcoming renewals. Progress is saved per decision so it can be resumed. */
export interface RenewalCheck {
  id?: number
  ownerId?: OwnerId
  windowDays: number
  periodStart: string
  periodEnd: string
  startedAt: string
  completedAt: string | null
  decisions: CheckDecision[]
  summary: CheckSummary | null
  createdAt: string
  updatedAt: string
}

export class SubscriptionTrackerDB extends Dexie {
  subscriptions!: EntityTable<Subscription, 'id'>
  priceChanges!: EntityTable<PriceChange, 'id'>
  cancellationNotes!: EntityTable<CancellationNote, 'id'>
  profile!: EntityTable<Profile, 'id'>
  settings!: EntityTable<Settings, 'id'>
  categories!: EntityTable<Category, 'id'>
  billingEvents!: EntityTable<BillingEvent, 'id'>
  renewalChecks!: EntityTable<RenewalCheck, 'id'>

  constructor(name = GUEST_DB_NAME) {
    super(name)
    this.version(1).stores({
      subscriptions: '++id, name, categoryId, status, nextRenewalDate, billingCycle',
      priceChanges: '++id, subscriptionId, effectiveDate',
      cancellationNotes: '++id, subscriptionId, status, remindOn',
      profile: 'id',
      settings: 'id',
      categories: 'id, sortOrder',
      billingEvents: '++id, occurredAt',
    })
    // v2: ownership on every private record, compound indexes for the list, calendar, history and
    // reminder queries, created/updated timestamps everywhere, and orphan cleanup.
    this.version(2)
      .stores({
        subscriptions: '++id, ownerId, name, categoryId, status, nextRenewalDate, billingCycle, [status+nextRenewalDate], [categoryId+status]',
        priceChanges: '++id, ownerId, subscriptionId, effectiveDate, [subscriptionId+effectiveDate]',
        cancellationNotes: '++id, ownerId, subscriptionId, status, remindOn, [subscriptionId+status], [status+remindOn]',
        profile: 'id',
        settings: 'id',
        categories: 'id, sortOrder',
        billingEvents: '++id, ownerId, occurredAt',
      })
      .upgrade(async (tx) => {
        const ownerId = ownerIdFromDbName(name)
        const now = new Date().toISOString()
        const subs = tx.table('subscriptions')
        const ids = new Set<number>()
        await subs.toCollection().modify((s: Subscription) => {
          if (s.id !== undefined) ids.add(s.id)
          if (s.ownerId === undefined) s.ownerId = ownerId
          if (!s.createdAt) s.createdAt = now
          if (!s.updatedAt) s.updatedAt = s.createdAt
        })
        await tx
          .table('priceChanges')
          .toCollection()
          .modify((p: PriceChange, ref: { value?: PriceChange }) => {
            if (!ids.has(p.subscriptionId)) {
              delete ref.value // orphan: parent subscription no longer exists
              return
            }
            if (p.ownerId === undefined) p.ownerId = ownerId
            if (!p.createdAt) p.createdAt = now
            if (!p.updatedAt) p.updatedAt = p.createdAt
          })
        await tx
          .table('cancellationNotes')
          .toCollection()
          .modify((n: CancellationNote, ref: { value?: CancellationNote }) => {
            if (!ids.has(n.subscriptionId)) {
              delete ref.value
              return
            }
            if (n.ownerId === undefined) n.ownerId = ownerId
            if (!n.createdAt) n.createdAt = now
            if (!n.updatedAt) n.updatedAt = n.createdAt
          })
        await tx.table('billingEvents').toCollection().modify((b: BillingEvent) => {
          if (b.ownerId === undefined) b.ownerId = ownerId
        })
        await tx.table('profile').toCollection().modify((p: Profile) => {
          if (p.ownerId === undefined) p.ownerId = ownerId
          if (!p.createdAt) p.createdAt = now
          if (!p.updatedAt) p.updatedAt = p.createdAt
        })
        await tx.table('settings').toCollection().modify((s: Settings) => {
          if (s.ownerId === undefined) s.ownerId = ownerId
          if (!s.createdAt) s.createdAt = now
          if (!s.updatedAt) s.updatedAt = s.createdAt
        })
      })
    // v3: renewal checks (the guided "check upcoming renewals" journey). Additive only.
    this.version(3).stores({
      subscriptions: '++id, ownerId, name, categoryId, status, nextRenewalDate, billingCycle, [status+nextRenewalDate], [categoryId+status]',
      priceChanges: '++id, ownerId, subscriptionId, effectiveDate, [subscriptionId+effectiveDate]',
      cancellationNotes: '++id, ownerId, subscriptionId, status, remindOn, [subscriptionId+status], [status+remindOn]',
      profile: 'id',
      settings: 'id',
      categories: 'id, sortOrder',
      billingEvents: '++id, ownerId, occurredAt',
      renewalChecks: '++id, ownerId, completedAt, startedAt',
    })
  }
}

export function ownerIdFromDbName(name: string): OwnerId {
  const m = /^subscription-tracker-u(\d+)$/.exec(name)
  return m ? Number(m[1]) : null
}

/** Owner id of the currently active database (null while using the app as a guest). */
export function currentOwnerId(): OwnerId {
  return ownerIdFromDbName(db.name)
}

export const GUEST_DB_NAME = 'subscription-tracker'
export const dbNameFor = (userId: number | null) => (userId === null ? GUEST_DB_NAME : `subscription-tracker-u${userId}`)

/**
 * The active database. Guests use the device-local database; each signed-in account gets its own,
 * so a signed-out visitor never sees another person's data. `openScope` swaps it (ES live binding).
 */
export let db = new SubscriptionTrackerDB()

export function openScope(userId: number | null): SubscriptionTrackerDB {
  const name = dbNameFor(userId)
  if (db.name === name) return db
  db.close()
  db = new SubscriptionTrackerDB(name)
  return db
}

/** Permanently removes a scope's local database (used when an account signs out on this device). */
export async function deleteScope(userId: number | null): Promise<void> {
  const name = dbNameFor(userId)
  if (db.name === name) db.close()
  await Dexie.delete(name)
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  defaultReminderDays: 3,
  monthlyBudget: null,
  notifyRenewals: true,
  notifyPriceChanges: true,
  notifyTrials: true,
  weekStartsOn: 1,
  showCancelledInList: false,
  compactAmounts: false,
}

export const DEFAULT_PROFILE: Profile = {
  id: 1,
  name: '',
  email: '',
  currency: 'USD',
  goal: 'avoid-surprises',
  onboardingComplete: false,
  plan: 'free',
  premiumInterval: null,
  premiumSince: null,
  premiumRenewsOn: null,
  createdAt: new Date().toISOString(),
}

export const CATEGORIES: Category[] = [
  { id: 'streaming', name: 'Streaming', color: '#FF6B5B', sortOrder: 1 },
  { id: 'music', name: 'Music', color: '#2DD4BF', sortOrder: 2 },
  { id: 'productivity', name: 'Productivity', color: '#3D5F8F', sortOrder: 3 },
  { id: 'cloud', name: 'Cloud & storage', color: '#5B8DEF', sortOrder: 4 },
  { id: 'fitness', name: 'Health & fitness', color: '#34C38F', sortOrder: 5 },
  { id: 'news', name: 'News & reading', color: '#F2A93B', sortOrder: 6 },
  { id: 'gaming', name: 'Gaming', color: '#9B7BEF', sortOrder: 7 },
  { id: 'utilities', name: 'Utilities & phone', color: '#55687F', sortOrder: 8 },
  { id: 'finance', name: 'Finance & insurance', color: '#0F766E', sortOrder: 9 },
  { id: 'other', name: 'Other', color: '#A0AEC0', sortOrder: 10 },
]

export const FREE_SUBSCRIPTION_LIMIT = 10
export const PREMIUM_PRICING = { monthly: 3.99, yearly: 24.99 } as const
