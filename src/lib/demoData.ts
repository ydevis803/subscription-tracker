import type { CancellationNote, PriceChange, Subscription } from '@/db/schema'
import { daysFromToday, todayISO } from '@/lib/dates'

/**
 * Realistic, consistent demo data for the store-screenshot preview. Never written to any database and never
 * mixed with a real user's records: the preview renders from this module only. Dates are relative to today
 * so the frames always look current.
 */
const now = new Date().toISOString()
const base = { currency: 'USD', paymentMethod: 'Visa ···· 4421', website: '', notes: '', trialEndsAt: null, cancelledAt: null, reminderDaysBefore: null, renewalEstimated: false, createdAt: now, updatedAt: now } as const

export const DEMO_NAME = 'Sam'

export const DEMO_SUBSCRIPTIONS: Subscription[] = [
  { id: 1, ...base, name: 'Netflix', categoryId: 'streaming', amount: 17.99, billingCycle: 'monthly', nextRenewalDate: daysFromToday(2), startDate: '2024-07-09', status: 'active' },
  { id: 2, ...base, name: 'Spotify Premium', categoryId: 'music', amount: 11.99, billingCycle: 'monthly', nextRenewalDate: daysFromToday(5), startDate: '2023-03-14', status: 'active' },
  { id: 3, ...base, name: 'iCloud+', categoryId: 'cloud', amount: 2.99, billingCycle: 'monthly', nextRenewalDate: daysFromToday(9), startDate: '2022-11-01', status: 'active' },
  { id: 4, ...base, name: 'Adobe Creative Cloud', categoryId: 'productivity', amount: 659.88, billingCycle: 'yearly', nextRenewalDate: daysFromToday(18), startDate: '2023-10-02', status: 'active' },
  { id: 5, ...base, name: 'Peloton App', categoryId: 'fitness', amount: 12.99, billingCycle: 'monthly', nextRenewalDate: daysFromToday(12), startDate: '2024-01-20', status: 'active' },
  { id: 6, ...base, name: 'The New York Times', categoryId: 'news', amount: 4.0, billingCycle: 'monthly', nextRenewalDate: daysFromToday(21), startDate: '2024-05-11', status: 'active' },
  { id: 7, ...base, name: 'Xbox Game Pass', categoryId: 'gaming', amount: 19.99, billingCycle: 'monthly', nextRenewalDate: daysFromToday(26), startDate: '2023-08-30', status: 'active' },
  { id: 8, ...base, name: 'Notion Plus', categoryId: 'productivity', amount: 10.0, billingCycle: 'monthly', nextRenewalDate: daysFromToday(15), startDate: '2024-02-15', status: 'active' },
  { id: 9, ...base, name: 'Headspace', categoryId: 'fitness', amount: 69.99, billingCycle: 'yearly', nextRenewalDate: daysFromToday(40), startDate: '2023-12-04', status: 'paused' },
]

export const DEMO_NOTES: CancellationNote[] = [
  { id: 1, subscriptionId: 4, reason: 'too-expensive', content: 'Cancel before the annual renewal. Downgrade to the Photography plan instead.', remindOn: daysFromToday(11), status: 'open', createdAt: now, updatedAt: now },
  { id: 2, subscriptionId: 7, reason: 'not-using', content: 'Only played twice this month. Pause until winter.', remindOn: daysFromToday(20), status: 'open', createdAt: now, updatedAt: now },
  { id: 3, subscriptionId: 9, reason: 'not-using', content: 'Paused after the challenge ended.', remindOn: null, status: 'done', createdAt: now, updatedAt: now },
]

export const DEMO_PRICE_CHANGES: PriceChange[] = [
  { id: 1, subscriptionId: 1, previousAmount: 15.49, newAmount: 17.99, effectiveDate: '2025-01-09', note: 'Standard plan price increase', createdAt: now, updatedAt: now },
  { id: 2, subscriptionId: 2, previousAmount: 10.99, newAmount: 11.99, effectiveDate: '2025-07-02', note: '', createdAt: now, updatedAt: now },
  { id: 3, subscriptionId: 4, previousAmount: 599.88, newAmount: 659.88, effectiveDate: '2024-10-02', note: 'Annual plan increase', createdAt: now, updatedAt: now },
]

export const DEMO_BUDGET = 140
export const DEMO_TODAY = todayISO()
