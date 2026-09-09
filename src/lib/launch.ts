import { CONTACT_IS_PLACEHOLDER, SUPPORT_EMAIL } from '@/lib/legal'
import { isStandalone } from '@/lib/install'

/**
 * Owner launch checklist for the web / PWA release. An item can be marked only when this page is running on the
 * published origin: marks made anywhere else (localhost, a preview) are refused, and every mark records the
 * origin and time it was made on.
 */
export type LaunchStatus = 'tested' | 'failed' | 'untested'

export interface LaunchMark {
  status: 'tested' | 'failed'
  at: string
  origin: string
  note?: string
}

export interface AutoResult {
  ok: boolean
  evidence: string
}

export interface LaunchItem {
  id: string
  title: string
  /** What the owner does on a signed-out phone to test it. */
  how: string
  route: string
  /** Optional automated pre-check that runs on the live origin before the owner can mark the item. */
  auto?: () => Promise<AutoResult>
}

const PUBLIC_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? ''

/** The published origin the checklist expects, or null when the owner has not set VITE_APP_URL. */
export function expectedOrigin(): string | null {
  try {
    return PUBLIC_URL ? new URL(PUBLIC_URL).origin : null
  } catch {
    return null
  }
}

/** True only when this page is being viewed on the published origin over HTTPS (or the configured origin exactly). */
export function onLiveOrigin(): boolean {
  if (typeof window === 'undefined') return false
  const expected = expectedOrigin()
  if (!expected) return false
  return window.location.origin === expected
}

const STORAGE = 'subscription-tracker.launch-marks'

export function readMarks(): Record<string, LaunchMark> {
  try {
    const raw = localStorage.getItem(STORAGE)
    const all = raw ? (JSON.parse(raw) as Record<string, LaunchMark>) : {}
    const expected = expectedOrigin()
    // Marks only count for the origin they were made on.
    return Object.fromEntries(Object.entries(all).filter(([, m]) => m.origin === expected))
  } catch {
    return {}
  }
}

export function writeMark(id: string, mark: LaunchMark | null): void {
  try {
    const raw = localStorage.getItem(STORAGE)
    const all = raw ? (JSON.parse(raw) as Record<string, LaunchMark>) : {}
    if (mark) all[id] = mark
    else delete all[id]
    localStorage.setItem(STORAGE, JSON.stringify(all))
  } catch {
    // ignore
  }
}

async function status(path: string): Promise<number> {
  try {
    const res = await fetch(path, { cache: 'no-store' })
    await res.arrayBuffer().catch(() => undefined)
    return res.status
  } catch {
    return 0
  }
}

export const LAUNCH_ITEMS: LaunchItem[] = [
  {
    id: 'name-icon',
    title: 'App name and icon',
    how: 'Open the live URL, check the tab title reads Subscription Tracker and the receipt icon shows in the tab and the manifest.',
    route: '/',
    auto: async () => {
      const [m, i192, i512] = await Promise.all([fetch('/manifest.webmanifest', { cache: 'no-store' }).then((r) => r.json()).catch(() => null), status('/icon-192.png'), status('/icon-512.png')])
      const name = (m as { name?: string } | null)?.name
      const ok = document.title === 'Subscription Tracker' && name === 'Subscription Tracker' && i192 === 200 && i512 === 200
      return { ok, evidence: ok ? `Title and manifest name are “Subscription Tracker”; icons 192 and 512 respond.` : `title=${document.title}, manifest name=${name ?? 'missing'}, icons ${i192}/${i512}` }
    },
  },
  {
    id: 'public-url',
    title: 'Public URL',
    how: 'Type the public address on a phone that has never opened the app. It must load over HTTPS without warnings.',
    route: '/',
    auto: async () => {
      const expected = expectedOrigin()
      const here = window.location.origin
      const https = window.location.protocol === 'https:'
      const ok = !!expected && here === expected && https
      return { ok, evidence: expected ? `Expected ${expected}; this page is on ${here} (${https ? 'HTTPS' : 'not HTTPS'}).` : 'VITE_APP_URL is not set, so there is no published URL to compare against.' }
    },
  },
  {
    id: 'visibility',
    title: 'Visibility',
    how: 'Confirm the app is reachable without a login and that owner pages need the key: open /__readiness without ?key= and expect not-found.',
    route: '/__readiness',
    auto: async () => {
      const root = await status('/')
      const robots = await fetch('/robots.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '')
      const blocked = /Disallow:\s*\/\s*$/m.test(robots)
      const ok = root === 200 && !blocked
      return { ok, evidence: `Root responds ${root}; robots.txt ${robots ? (blocked ? 'blocks crawling' : 'allows crawling') : 'absent (allowed)'}. Owner pages are gated by VITE_STORE_PREVIEW_KEY in production.` }
    },
  },
  {
    id: 'onboarding',
    title: 'First-time onboarding',
    how: 'On a signed-out phone: Show me my total → pick two services → set a limit → See my total → Open my dashboard. Under a minute, no paywall.',
    route: '/',
  },
  {
    id: 'sign-up',
    title: 'Sign-up and login',
    how: 'Create a test account on the live site, sign out, sign in again and see the same subscriptions. Delete the test account afterwards from Settings → Delete account.',
    route: '/auth/sign-up',
    auto: async () => {
      const health = await fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      const ok = !!(health as { ok?: boolean } | null)?.ok
      const mail = (health as { mail?: string } | null)?.mail
      return { ok, evidence: ok ? `API is up; password reset mail mode: ${mail}.` : 'The API did not answer, so sign-up cannot work.' }
    },
  },
  {
    id: 'primary-action',
    title: 'Primary action persists',
    how: 'Run a renewal check to “all clear”, reload the page, and confirm Home still shows the completed check and the monthly total.',
    route: '/check',
  },
  {
    id: 'premium-boundary',
    title: 'Premium boundary',
    how: 'With ten subscriptions, tap Add: the Go Premium sheet must appear, lead to /premium with $3.99 and $24.99, and close cleanly.',
    route: '/premium',
  },
  {
    id: 'legal',
    title: 'Legal pages',
    how: 'Open Terms, Privacy, Support and Delete account from the sign-up screen and from Settings. Contact details must be real.',
    route: '/legal/privacy',
    auto: async () => {
      const codes = await Promise.all(['/legal/privacy', '/legal/terms', '/support', '/account/delete'].map(status))
      const ok = codes.every((c) => c === 200) && !CONTACT_IS_PLACEHOLDER
      return { ok, evidence: `Pages respond ${codes.join('/')}; contact details ${CONTACT_IS_PLACEHOLDER ? 'are still placeholders' : 'are set'}.` }
    },
  },
  {
    id: 'support',
    title: 'Support contact',
    how: 'Tap the support email on /support; it must open a mail draft to your real address.',
    route: '/support',
    auto: async () => {
      const ok = !/example\.com$/i.test(SUPPORT_EMAIL) && SUPPORT_EMAIL.includes('@')
      return { ok, evidence: ok ? `Support email is ${SUPPORT_EMAIL}.` : `Support email is still ${SUPPORT_EMAIL}.` }
    },
  },
  {
    id: 'mobile-display',
    title: 'Mobile display',
    how: 'On the phone: no horizontal scroll on Home, list, calendar and timeline; the bottom nav never covers content; forms stay usable with the keyboard open.',
    route: '/',
    auto: async () => {
      const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
      const theme = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? ''
      const ok = /width=device-width/.test(viewport) && /viewport-fit=cover/.test(viewport) && theme === '#0B1F3A' && document.documentElement.scrollWidth <= window.innerWidth
      return { ok, evidence: `viewport “${viewport}”, theme-color ${theme || 'missing'}, no horizontal overflow on this screen: ${document.documentElement.scrollWidth <= window.innerWidth}.` }
    },
  },
  {
    id: 'install',
    title: 'Install to home screen',
    how: 'Follow the Add to Home Screen steps on /support on both an iPhone (Safari) and an Android phone (Chrome); the installed icon must open the app full screen.',
    route: '/support',
    auto: async () => {
      const m = (await fetch('/manifest.webmanifest', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { display?: string; icons?: { purpose?: string }[]; start_url?: string } | null
      const maskable = !!m?.icons?.some((i) => i.purpose === 'maskable')
      const ok = m?.display === 'standalone' && !!m?.start_url && maskable && !!document.querySelector('link[rel="apple-touch-icon"]')
      return { ok, evidence: `manifest display=${m?.display ?? 'missing'}, start_url=${m?.start_url ?? 'missing'}, maskable icon ${maskable ? 'present' : 'missing'}, apple-touch-icon ${document.querySelector('link[rel="apple-touch-icon"]') ? 'present' : 'missing'}. Currently running ${isStandalone() ? 'installed (standalone)' : 'in the browser'}.` }
    },
  },
]
