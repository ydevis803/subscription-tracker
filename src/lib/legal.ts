/**
 * Everything an owner needs to replace before shipping lives here or in .env (see .env.example):
 *   VITE_OWNER_NAME, VITE_OWNER_ADDRESS, VITE_SUPPORT_EMAIL, VITE_LEGAL_JURISDICTION
 * The bracketed defaults are deliberately visible in the app so a placeholder is never mistaken for real detail.
 */
const env = import.meta.env as Record<string, string | undefined>

export const APP_NAME = 'Subscription Tracker'
export const APP_VERSION = '1.0'
/** Date the current Privacy Policy and Terms took effect (ISO). Update when either document changes. */
export const LEGAL_EFFECTIVE_DATE = '2026-09-09'

export const OWNER_NAME = env.VITE_OWNER_NAME?.trim() || '[Your company or name]'
export const OWNER_ADDRESS = env.VITE_OWNER_ADDRESS?.trim() || '[Postal address]'
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL?.trim() || 'support@example.com'
export const LEGAL_JURISDICTION = env.VITE_LEGAL_JURISDICTION?.trim() || '[Country or state]'

/** True while any contact detail is still a placeholder, so the pages can say so. */
export const CONTACT_IS_PLACEHOLDER = !env.VITE_SUPPORT_EMAIL?.trim() || !env.VITE_OWNER_NAME?.trim()

export const LEGAL_ROUTES = {
  privacy: '/legal/privacy',
  terms: '/legal/terms',
  support: '/support',
  deleteAccount: '/account/delete',
} as const

export function mailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME}: ${subject}`)}`
}

export function formatEffectiveDate(iso: string = LEGAL_EFFECTIVE_DATE): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}
