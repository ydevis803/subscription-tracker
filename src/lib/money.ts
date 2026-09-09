import type { BillingCycle, Subscription } from '@/db/schema'

export function toMonthly(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly':
      return (amount * 52) / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
  }
}

export function toYearly(amount: number, cycle: BillingCycle): number {
  return toMonthly(amount, cycle) * 12
}

export function isCounted(sub: Subscription): boolean {
  return sub.status === 'active' || sub.status === 'trial'
}

export function monthlyEquivalent(subs: Subscription[]): number {
  return subs.filter(isCounted).reduce((sum, s) => sum + toMonthly(s.amount, s.billingCycle), 0)
}

export function formatMoney(amount: number, currency = 'USD', opts: { compact?: boolean } = {}): string {
  const abs = Math.abs(amount)
  const fractionDigits = opts.compact && (abs >= 1000 || Number.isInteger(amount)) ? 0 : 2
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(1)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
}

export const CYCLE_NAME: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'CHF', name: 'Swiss Franc' },
]

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const MAX_BUDGET = 1_000_000

/**
 * Validate a monthly limit typed by the user. Returns a specific message, or null when valid.
 * `parsed` is the number to save (null when the field is empty, which clears the limit).
 */
export function validateBudget(raw: string, currency: string): { error: string | null; parsed: number | null } {
  const text = raw.trim()
  if (text === '') return { error: null, parsed: null }
  if (!/^\d+(\.\d{0,2})?$/.test(text)) {
    if (/[^\d.]/.test(text)) return { error: 'Use numbers only, for example 120.', parsed: null }
    if ((text.match(/\./g) ?? []).length > 1) return { error: 'Only one decimal point, for example 120.50.', parsed: null }
    return { error: 'Use at most two decimal places, for example 120.50.', parsed: null }
  }
  const n = Number(text)
  if (n <= 0) return { error: `The limit must be more than ${formatMoney(0, currency)}. Leave it empty to have no limit.`, parsed: null }
  if (n > MAX_BUDGET) return { error: `That is above ${formatMoney(MAX_BUDGET, currency, { compact: true })}. Check the amount.`, parsed: null }
  return { error: null, parsed: round2(n) }
}

/** A sensible starting limit: current spending rounded up to a round number, with a little headroom. */
export function suggestBudget(monthlyTotal: number): number {
  if (monthlyTotal <= 0) return 50
  const step = monthlyTotal < 100 ? 10 : monthlyTotal < 1000 ? 25 : 100
  return Math.ceil((monthlyTotal * 1.05) / step) * step
}
