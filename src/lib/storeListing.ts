import { FREE_SUBSCRIPTION_LIMIT } from '@/db/schema'
import { price, TRIAL_DAYS, YEARLY_SAVING_PCT } from '@/lib/plan'
import { APP_VERSION } from '@/lib/legal'

/**
 * Store listing copy, kept in one place so every claim can be checked against a real screen. Nothing here
 * quotes user counts, ratings or awards; every feature line names the route that delivers it.
 */
export const LISTING_LIMITS = {
  name: 30, // App Store: 30 characters
  subtitle: 30, // App Store subtitle
  promo: 170, // App Store promotional text
  short: 80, // Google Play short description
  full: 4000, // App Store description / Play full description
  keywords: 100, // App Store keyword field (comma-separated)
}

export const NAME_OPTIONS = ['Subscription Tracker', 'Renewal Radar: Subscriptions', 'Subscription Tracker & Total', 'Every Renewal: Bill Tracker', 'Recurring: Subscription Total']

export const SUBTITLE = 'Catch every renewal in time'

export const PROMO = `${FREE_SUBSCRIPTION_LIMIT} subscriptions free. See your monthly total, catch renewals before they charge and keep cancellation notes that come back in time. Premium: unlimited, plus insights.`

export const SHORT_DESCRIPTION = 'See every recurring charge before it renews, with your monthly total in view.'

export const FULL_DESCRIPTION = `Subscription Tracker is for people who want control of their monthly digital spending. It shows every recurring charge before it quietly renews, adds them into one honest monthly total, and keeps the notes you need to cancel in time.

WHAT YOU GET

Know your number
Your monthly total is worked out from every active subscription, with yearly plans spread per month and a limit you set. The dashboard shows how close each month gets to it.

Catch renewals before they charge
A short renewal check walks through what is about to charge you, one tap each: keep it, set a reminder, or mark it cancelled. Home tells you when you are all clear.

Decide before it renews
Cancellation notes carry a reason and a date. They come back on your dashboard before the charge, and progress shows how much you have freed up per month.

See the month ahead
A renewal calendar and a rolling timeline lay out every charge in order, with category totals, your notes in place, and an export to your own calendar.

Spot the creep
Price changes are recorded with a date and a note, so you can see what went up, when, and by how much.

Build the habit
A daily next action, a seven-day starter challenge, streaks and a weekly summary keep the total honest without becoming a chore.

FEATURES
• Track ${FREE_SUBSCRIPTION_LIMIT} subscriptions free, no account needed to start
• Monthly total with a spending limit and history
• Renewal check, calendar and timeline with category totals
• Cancellation notes with reminders that show on your dashboard
• Price-change history for every subscription
• Spending insights by category and billing cycle
• Weekly summary, streaks, milestones and a seven-day starter challenge
• Search, filters and sorting across your list
• Export a backup of your data at any time
• Optional free account to back up and restore on another device

REMINDERS, HONESTLY
Reminders appear on the Home screen when you open the app, and as a browser notification while the app is open. This version does not send push notifications while the app is closed or email reminders.

PREMIUM
Premium removes the ${FREE_SUBSCRIPTION_LIMIT}-subscription limit and adds a 12-month projection, a price-increase impact report and an unused-subscription detector, for ${price('monthly')} a month or ${price('yearly')} a year (save ${YEARLY_SAVING_PCT}%). A ${TRIAL_DAYS}-day trial needs no card.

PRIVACY
No adverts, no analytics trackers, no data brokers. Without an account, your data stays on your device. With an account, only you can read it, and you can export or delete everything from Settings.`

export const KEYWORDS = ['subscription tracker', 'recurring charges', 'renewal reminder', 'monthly budget', 'cancel subscriptions', 'bill tracker', 'subscription manager', 'price increase', 'free trial tracker', 'spending insights']

/** The App Store keyword field is 100 characters in total, so this is the ideas list distilled into single terms. */
export const KEYWORD_FIELD = 'subscriptions,renewal,recurring,bills,budget,cancel,trial,price,spending,tracker,manager,charges'

export const RELEASE_NOTES = `Version ${APP_VERSION}

Welcome to Subscription Tracker.

• Add your subscriptions in under a minute and see your monthly total straight away
• Renewal check: review what charges next, one tap each
• Renewal calendar and timeline with category totals and your notes in place
• Cancellation notes with reminders that come back before the charge
• Price-change history, spending insights and a weekly summary
• Seven-day starter challenge, streaks and milestones
• Export a backup, or create a free account to restore on another device
• Premium (optional): unlimited subscriptions, 12-month projection, price-increase impact and unused-subscription detector, with a ${TRIAL_DAYS}-day trial`

/** Each claim in the copy, with the screen that delivers it. The listing page lists these so the owner can check them. */
export const CLAIMS: { claim: string; route: string }[] = [
  { claim: `Track ${FREE_SUBSCRIPTION_LIMIT} subscriptions free, no account needed`, route: '/subscriptions' },
  { claim: 'Monthly total with a limit and history', route: '/total' },
  { claim: 'Renewal check, one tap per charge', route: '/check' },
  { claim: 'Renewal calendar', route: '/calendar' },
  { claim: 'Timeline with category totals, notes and calendar export', route: '/timeline' },
  { claim: 'Cancellation notes with reminders and progress', route: '/notes' },
  { claim: 'Price-change history', route: '/history' },
  { claim: 'Spending insights by category and cycle', route: '/insights' },
  { claim: 'Weekly summary', route: '/week' },
  { claim: 'Seven-day starter challenge, streaks and milestones', route: '/' },
  { claim: 'Reminders on Home and browser notifications while open; no push while closed', route: '/reminders' },
  { claim: 'Export a backup; optional account to back up and restore', route: '/settings' },
  { claim: `Premium ${price('monthly')}/month or ${price('yearly')}/year, ${TRIAL_DAYS}-day trial without a card`, route: '/premium' },
  { claim: 'No adverts or trackers; delete everything from Settings', route: '/legal/privacy' },
]

/** Words that would make a listing dishonest for a brand-new app. The page fails loudly if any slips in. */
export const FORBIDDEN = [/award/i, /#1\b/i, /\bbest[- ]selling\b/i, /\b(million|thousands of|\d[\d,]*\+?) (users|downloads|customers)\b/i, /\brated\b/i, /\bfeatured by\b/i, /\bpush notifications? (to|on) your (phone|device)\b/i]

export function forbiddenHits(text: string): string[] {
  return FORBIDDEN.map((re) => text.match(re)?.[0]).filter((m): m is string => !!m)
}
