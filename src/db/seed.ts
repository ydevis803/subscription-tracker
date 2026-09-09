import { currentOwnerId, db, type CancellationNote, type PriceChange, type Subscription } from './schema'
import { daysFromToday, monthsFromToday, toISO } from '@/lib/dates'
import { subDays, subMonths } from 'date-fns'

type SubSeed = Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'currency'>

function past(days: number): string {
  return toISO(subDays(new Date(), days))
}
function pastMonths(n: number): string {
  return toISO(subMonths(new Date(), n))
}

export function buildSampleSubscriptions(): SubSeed[] {
  return [
    {
      name: 'Netflix',
      categoryId: 'streaming',
      amount: 17.99,
      billingCycle: 'monthly',
      nextRenewalDate: daysFromToday(2),
      startDate: pastMonths(26),
      status: 'active',
      paymentMethod: 'Visa •••• 4421',
      website: 'https://netflix.com/account',
      notes: 'Standard plan, shared with Sam.',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'Spotify Premium',
      categoryId: 'music',
      amount: 11.99,
      billingCycle: 'monthly',
      nextRenewalDate: daysFromToday(5),
      startDate: pastMonths(38),
      status: 'active',
      paymentMethod: 'Visa •••• 4421',
      website: 'https://spotify.com/account',
      notes: '',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'iCloud+ 200GB',
      categoryId: 'cloud',
      amount: 2.99,
      billingCycle: 'monthly',
      nextRenewalDate: daysFromToday(9),
      startDate: pastMonths(19),
      status: 'active',
      paymentMethod: 'Apple Pay',
      website: 'https://icloud.com',
      notes: 'Photos backup for both phones.',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'Adobe Creative Cloud',
      categoryId: 'productivity',
      amount: 659.88,
      billingCycle: 'yearly',
      nextRenewalDate: daysFromToday(24),
      startDate: pastMonths(23),
      status: 'active',
      paymentMethod: 'Mastercard •••• 8810',
      website: 'https://account.adobe.com',
      notes: 'Annual prepaid. Only using Lightroom these days.',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: 14,
    },
    {
      name: 'Peloton App',
      categoryId: 'fitness',
      amount: 12.99,
      billingCycle: 'monthly',
      nextRenewalDate: daysFromToday(12),
      startDate: pastMonths(7),
      status: 'active',
      paymentMethod: 'Visa •••• 4421',
      website: 'https://onepeloton.com',
      notes: '',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'The New York Times',
      categoryId: 'news',
      amount: 25.0,
      billingCycle: 'quarterly',
      nextRenewalDate: daysFromToday(41),
      startDate: pastMonths(14),
      status: 'active',
      paymentMethod: 'Mastercard •••• 8810',
      website: 'https://nytimes.com/subscription',
      notes: 'Promo rate ends this year.',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'Xbox Game Pass',
      categoryId: 'gaming',
      amount: 19.99,
      billingCycle: 'monthly',
      nextRenewalDate: daysFromToday(17),
      startDate: pastMonths(11),
      status: 'paused',
      paymentMethod: 'Visa •••• 4421',
      website: 'https://xbox.com/account',
      notes: 'Paused over summer.',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'Apple TV+',
      categoryId: 'streaming',
      amount: 9.99,
      billingCycle: 'monthly',
      nextRenewalDate: daysFromToday(4),
      startDate: past(3),
      status: 'trial',
      paymentMethod: 'Apple Pay',
      website: 'https://tv.apple.com',
      notes: 'Free week for the new season.',
      trialEndsAt: daysFromToday(4),
      cancelledAt: null,
      reminderDaysBefore: 1,
    },
    {
      name: 'Notion Plus',
      categoryId: 'productivity',
      amount: 96.0,
      billingCycle: 'yearly',
      nextRenewalDate: monthsFromToday(4),
      startDate: pastMonths(8),
      status: 'active',
      paymentMethod: 'Mastercard •••• 8810',
      website: 'https://notion.so/my-account',
      notes: '',
      trialEndsAt: null,
      cancelledAt: null,
      reminderDaysBefore: null,
    },
    {
      name: 'Headspace',
      categoryId: 'fitness',
      amount: 69.99,
      billingCycle: 'yearly',
      nextRenewalDate: pastMonths(2),
      startDate: pastMonths(14),
      status: 'cancelled',
      paymentMethod: 'Visa •••• 4421',
      website: 'https://headspace.com',
      notes: 'Cancelled after switching to free breathing app.',
      trialEndsAt: null,
      cancelledAt: past(70),
      reminderDaysBefore: null,
    },
  ]
}

export async function seedSampleData(currency: string): Promise<void> {
  const now = new Date().toISOString()
  const ownerId = currentOwnerId()
  const seeds = buildSampleSubscriptions()
  await db.transaction('rw', db.subscriptions, db.priceChanges, db.cancellationNotes, async () => {
    const ids: number[] = []
    for (const s of seeds) {
      const id = await db.subscriptions.add({ ...s, ownerId, currency, createdAt: now, updatedAt: now })
      ids.push(id as number)
    }
    const byName = (name: string) => ids[seeds.findIndex((s) => s.name === name)]

    const priceChanges: Omit<PriceChange, 'id'>[] = [
      {
        subscriptionId: byName('Netflix'),
        previousAmount: 13.99,
        newAmount: 15.49,
        effectiveDate: pastMonths(20),
        note: 'Standard plan price increase',
        createdAt: now,
      },
      {
        subscriptionId: byName('Netflix'),
        previousAmount: 15.49,
        newAmount: 17.99,
        effectiveDate: pastMonths(7),
        note: 'Announced by email',
        createdAt: now,
      },
      {
        subscriptionId: byName('Spotify Premium'),
        previousAmount: 9.99,
        newAmount: 10.99,
        effectiveDate: pastMonths(14),
        note: '',
        createdAt: now,
      },
      {
        subscriptionId: byName('Spotify Premium'),
        previousAmount: 10.99,
        newAmount: 11.99,
        effectiveDate: past(52),
        note: 'Second increase in two years',
        createdAt: now,
      },
      {
        subscriptionId: byName('iCloud+ 200GB'),
        previousAmount: 2.99,
        newAmount: 2.99,
        effectiveDate: pastMonths(19),
        note: 'Upgraded from 50GB plan',
        createdAt: now,
      },
      {
        subscriptionId: byName('Peloton App'),
        previousAmount: 12.99,
        newAmount: 12.99,
        effectiveDate: pastMonths(7),
        note: 'Started at full price',
        createdAt: now,
      },
      {
        subscriptionId: byName('Adobe Creative Cloud'),
        previousAmount: 599.88,
        newAmount: 659.88,
        effectiveDate: pastMonths(11),
        note: 'Annual rate went up at renewal',
        createdAt: now,
      },
    ].filter((p) => p.previousAmount !== p.newAmount)

    await db.priceChanges.bulkAdd(priceChanges.map((p) => ({ ...p, ownerId, updatedAt: now })))

    const notes: Omit<CancellationNote, 'id'>[] = [
      {
        subscriptionId: byName('Adobe Creative Cloud'),
        reason: 'too-expensive',
        content:
          'Only use Lightroom now. Switch to the Photography plan before the annual renewal instead of paying for the full suite again. Cancelling early triggers a fee, so do it in the last 14 days.',
        remindOn: daysFromToday(10),
        status: 'open',
        createdAt: now,
        updatedAt: now,
      },
      {
        subscriptionId: byName('Apple TV+'),
        reason: 'trial-ending',
        content: 'Decide before the trial converts. Finish the series first, then cancel unless the second show is good.',
        remindOn: daysFromToday(3),
        status: 'open',
        createdAt: now,
        updatedAt: now,
      },
      {
        subscriptionId: byName('Xbox Game Pass'),
        reason: 'not-using',
        content: 'Resume in autumn when the new releases land, otherwise let it go.',
        remindOn: daysFromToday(45),
        status: 'open',
        createdAt: now,
        updatedAt: now,
      },
      {
        subscriptionId: byName('Headspace'),
        reason: 'switching',
        content: 'Cancelled and switched to a free app. Confirmation email received.',
        remindOn: null,
        status: 'done',
        createdAt: past(70),
        updatedAt: past(70),
      },
    ]
    await db.cancellationNotes.bulkAdd(notes.map((n) => ({ ...n, ownerId })))
  })
}

