import type { BillingCycle, CategoryId } from '@/db/schema'

/** Common services offered during onboarding, with typical USD prices. */
export interface ServicePreset {
  id: string
  name: string
  categoryId: CategoryId
  amount: number
  billingCycle: BillingCycle
  website: string
}

export const SERVICE_PRESETS: ServicePreset[] = [
  { id: 'netflix', name: 'Netflix', categoryId: 'streaming', amount: 17.99, billingCycle: 'monthly', website: 'https://netflix.com/account' },
  { id: 'spotify', name: 'Spotify', categoryId: 'music', amount: 11.99, billingCycle: 'monthly', website: 'https://spotify.com/account' },
  { id: 'youtube', name: 'YouTube Premium', categoryId: 'streaming', amount: 13.99, billingCycle: 'monthly', website: 'https://youtube.com/paid_memberships' },
  { id: 'prime', name: 'Amazon Prime', categoryId: 'streaming', amount: 14.99, billingCycle: 'monthly', website: 'https://amazon.com/prime' },
  { id: 'disney', name: 'Disney+', categoryId: 'streaming', amount: 15.99, billingCycle: 'monthly', website: 'https://disneyplus.com/account' },
  { id: 'applemusic', name: 'Apple Music', categoryId: 'music', amount: 10.99, billingCycle: 'monthly', website: 'https://music.apple.com' },
  { id: 'icloud', name: 'iCloud+', categoryId: 'cloud', amount: 2.99, billingCycle: 'monthly', website: 'https://icloud.com' },
  { id: 'googleone', name: 'Google One', categoryId: 'cloud', amount: 1.99, billingCycle: 'monthly', website: 'https://one.google.com' },
  { id: 'chatgpt', name: 'ChatGPT Plus', categoryId: 'productivity', amount: 20, billingCycle: 'monthly', website: 'https://chatgpt.com' },
  { id: 'gamepass', name: 'Xbox Game Pass', categoryId: 'gaming', amount: 19.99, billingCycle: 'monthly', website: 'https://xbox.com/account' },
  { id: 'appletv', name: 'Apple TV+', categoryId: 'streaming', amount: 12.99, billingCycle: 'monthly', website: 'https://tv.apple.com' },
  { id: 'claude', name: 'Claude', categoryId: 'productivity', amount: 20, billingCycle: 'monthly', website: 'https://claude.ai' },
  { id: 'max', name: 'Max', categoryId: 'streaming', amount: 16.99, billingCycle: 'monthly', website: 'https://max.com' },
  { id: 'gym', name: 'Gym membership', categoryId: 'fitness', amount: 39.99, billingCycle: 'monthly', website: '' },
  { id: 'phone', name: 'Phone plan', categoryId: 'utilities', amount: 45, billingCycle: 'monthly', website: '' },
  { id: 'adobe', name: 'Adobe Creative Cloud', categoryId: 'productivity', amount: 59.99, billingCycle: 'monthly', website: 'https://account.adobe.com' },
]

/** Rough conversion from USD so suggested prices look sensible in other currencies. */
const CURRENCY_FACTOR: Record<string, number> = { USD: 1, EUR: 1, GBP: 0.85, CAD: 1.35, AUD: 1.5, BRL: 5.5, INR: 85, JPY: 150, MXN: 18, CHF: 0.9 }

export function localAmount(usd: number, currency: string): number {
  const f = CURRENCY_FACTOR[currency] ?? 1
  const v = usd * f
  return f >= 10 ? Math.round(v) : Math.round(v * 100) / 100
}

export function presetById(id: string): ServicePreset | undefined {
  return SERVICE_PRESETS.find((p) => p.id === id)
}

/** Budget suggestions shown as quick pills. */
export const BUDGET_PRESETS_USD = [50, 100, 150, 250]

/** Spread estimated renewal dates over the coming month so the timeline is not one big cluster. */
export function estimatedRenewalOffset(index: number): number {
  return 3 + ((index * 5) % 26)
}
