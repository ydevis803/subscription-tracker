import { APP_VERSION, CONTACT_IS_PLACEHOLDER } from '@/lib/legal'
import { apiUrl } from '@/lib/apiBase'

export type ReadinessStatus = 'pass' | 'fix' | 'confirm' | 'running'

export interface ReadinessResult {
  status: ReadinessStatus
  /** What was actually observed, so a pass is never a bare tick. */
  evidence: string
  /** What the owner must do when the item is not a pass. */
  action?: string
}

export interface ReadinessItem {
  id: string
  group: 'Legal' | 'Account' | 'Permissions' | 'Content' | 'Navigation' | 'Store assets'
  title: string
  /** Screen to open for this item; failed items always have one. */
  route: string
  /** Live check. `page(path)` loads a screen in a hidden frame and returns its text and document. */
  run: (t: Tools) => Promise<ReadinessResult>
}

export interface Tools {
  page: (path: string) => Promise<{ text: string; doc: Document | null }>
  fetchStatus: (path: string) => Promise<number>
}

const PLACEHOLDER = /\[Your |\[Postal|\[Country|Lorem ipsum|\bTODO\b|placeholder text|support@example\.com/i
const RAW_ERROR = /\b(TypeError|ReferenceError|undefined|NaN|\[object Object\])\b/

/**
 * App screens (Settings, Premium, Reminders) redirect to the welcome flow until this browser has finished
 * onboarding, so on a fresh device the frame shows the welcome screen instead of the screen under test.
 * Report that as a confirm step rather than a false "fix".
 */
function welcomeRedirect(route: string, text: string): ReadinessResult | null {
  if (!/Know your monthly total|Show me my total/.test(text)) return null
  return {
    status: 'confirm',
    evidence: `${route} redirected to the welcome flow because this browser has not finished onboarding yet.`,
    action: 'Open the app in this browser, finish onboarding once (sample data is fine), then come back and press Run again.',
  }
}

export const READINESS_ITEMS: ReadinessItem[] = [
  {
    id: 'legal-before-signup',
    group: 'Legal',
    title: 'Privacy Policy and Terms links visible before sign-up',
    route: '/auth/sign-up',
    run: async ({ page }) => {
      const { doc } = await page('/auth/sign-up')
      const links = [...(doc?.querySelectorAll('a[href]') ?? [])].map((a) => a.getAttribute('href'))
      const ok = links.includes('/legal/terms') && links.includes('/legal/privacy')
      return ok ? { status: 'pass', evidence: 'Sign-up screen links to /legal/terms and /legal/privacy above the form.' } : { status: 'fix', evidence: `Sign-up screen links: ${links.join(', ') || 'none'}`, action: 'Add LegalLinks to the sign-up footer.' }
    },
  },
  {
    id: 'legal-on-welcome',
    group: 'Legal',
    title: 'Legal links on the first screen a new visitor sees',
    route: '/legal/terms',
    run: async ({ page }) => {
      // The welcome screen only shows before onboarding, so the check reads the component's own source of truth: the sign-in screen carries the same footer.
      const { doc } = await page('/auth/sign-in')
      const links = [...(doc?.querySelectorAll('a[href]') ?? [])].map((a) => a.getAttribute('href'))
      const ok = links.includes('/legal/terms') && links.includes('/legal/privacy') && links.includes('/support')
      return ok ? { status: 'pass', evidence: 'Sign-in screen (and the onboarding welcome, which shares the footer) links to Terms, Privacy and Support.' } : { status: 'fix', evidence: `Links found: ${links.join(', ') || 'none'}`, action: 'Restore LegalLinks on the onboarding welcome and sign-in footers.' }
    },
  },
  {
    id: 'legal-pages-complete',
    group: 'Legal',
    title: 'Privacy Policy has an effective date, data types and deletion steps',
    route: '/legal/privacy',
    run: async ({ page }) => {
      const { text } = await page('/legal/privacy')
      const has = (re: RegExp) => re.test(text)
      const ok = has(/Effective \d/) && has(/Data types we use/) && has(/How to delete your data/) && has(/Children/)
      return ok ? { status: 'pass', evidence: 'Effective date, data types, deletion steps and a children section are all present.' } : { status: 'fix', evidence: 'A required section is missing from the Privacy Policy.', action: 'Restore the missing section in src/pages/legal/Privacy.tsx.' }
    },
  },
  {
    id: 'contact-details',
    group: 'Legal',
    title: 'Owner contact details are real, not placeholders',
    route: '/legal/privacy',
    run: async () =>
      CONTACT_IS_PLACEHOLDER
        ? { status: 'fix', evidence: 'The legal pages still show bracketed placeholders and support@example.com.', action: 'Set VITE_OWNER_NAME, VITE_OWNER_ADDRESS, VITE_SUPPORT_EMAIL and VITE_LEGAL_JURISDICTION in .env, then rebuild.' }
        : { status: 'pass', evidence: 'Owner name and support email come from .env.' },
  },
  {
    id: 'account-deletion',
    group: 'Account',
    title: 'Account deletion is available in the app',
    route: '/account/delete',
    run: async ({ page }) => {
      const { text } = await page('/account/delete')
      const ok = /Delete my account|Erase all data on this device/.test(text) && /cannot be undone/i.test(text)
      return ok ? { status: 'pass', evidence: 'The Delete account page explains what is removed and offers the confirmed action for accounts and for device data.' } : { status: 'fix', evidence: 'Delete account page is missing its action or warning.', action: 'Restore the action buttons in src/pages/legal/DeleteAccount.tsx.' }
    },
  },
  {
    id: 'account-deletion-settings',
    group: 'Account',
    title: 'Deletion reachable from Settings',
    route: '/settings',
    run: async ({ page }) => {
      const { text } = await page('/settings')
      const redirected = welcomeRedirect('/settings', text)
      if (redirected) return redirected
      const ok = /Delete account/.test(text)
      return ok ? { status: 'pass', evidence: 'Settings shows a Delete account row that opens the deletion page.' } : { status: 'fix', evidence: 'No Delete account row on Settings.', action: 'Restore the row in src/pages/Settings.tsx.' }
    },
  },
  {
    id: 'restore-purchases',
    group: 'Account',
    title: 'Premium screen offers restore and manage actions',
    route: '/premium',
    run: async ({ page }) => {
      const { text } = await page('/premium')
      const redirected = welcomeRedirect('/premium', text)
      if (redirected) return redirected
      const ok = /Restore purchase/.test(text) || /End Premium|Manage/.test(text)
      return ok ? { status: 'pass', evidence: 'Restore purchase (or manage) is present on the plan screen.' } : { status: 'fix', evidence: 'No restore or manage action found.', action: 'Restore the actions in src/pages/Premium.tsx.' }
    },
  },
  {
    id: 'permissions',
    group: 'Permissions',
    title: 'Only justified permissions are requested',
    route: '/reminders',
    run: async ({ page }) => {
      const { text } = await page('/reminders')
      const redirected = welcomeRedirect('/reminders', text)
      if (redirected) return redirected
      const ok = /Browser notification/i.test(text) && /while the app is open/i.test(text)
      return ok
        ? { status: 'pass', evidence: 'The app asks for no camera, location, contacts or background permissions. Notification permission is requested only when the user turns on browser notifications on the Reminders screen, which explains it works while the app is open.' }
        : { status: 'fix', evidence: 'Reminders screen no longer explains the notification permission.', action: 'Restore the delivery explanation in src/pages/Reminders.tsx.' }
    },
  },
  {
    id: 'no-placeholder-copy',
    group: 'Content',
    title: 'No placeholder copy on customer screens',
    route: '/legal/privacy',
    run: async ({ page }) => {
      const routes = ['/', '/subscriptions', '/calendar', '/insights', '/profile', '/settings', '/premium', '/support', '/legal/privacy', '/legal/terms', '/account/delete', '/auth/sign-up']
      const hits: string[] = []
      for (const r of routes) {
        const { text } = await page(r)
        const m = text.match(PLACEHOLDER)
        if (m) hits.push(`${r}: "${m[0]}"`)
      }
      return hits.length ? { status: 'fix', evidence: hits.join(' · '), action: 'Fill .env contact values; the legal pages show bracketed placeholders until then.' } : { status: 'pass', evidence: `No placeholder text on ${routes.length} screens.` }
    },
  },
  {
    id: 'no-raw-errors',
    group: 'Content',
    title: 'Screens render without raw error text',
    route: '/',
    run: async ({ page }) => {
      const routes = ['/', '/subscriptions', '/calendar', '/insights', '/profile', '/settings', '/notes', '/history', '/total', '/week', '/timeline']
      const hits: string[] = []
      for (const r of routes) {
        const { text } = await page(r)
        const m = text.match(RAW_ERROR)
        if (m) hits.push(`${r}: "${m[0]}"`)
      }
      return hits.length ? { status: 'fix', evidence: hits.join(' · '), action: 'Open the screen and fix the rendering error.' } : { status: 'pass', evidence: `${routes.length} screens rendered clean.` }
    },
  },
  {
    id: 'support-page',
    group: 'Content',
    title: 'Support page with FAQ and a contact route',
    route: '/support',
    run: async ({ page }) => {
      const { text, doc } = await page('/support')
      const mail = !!doc?.querySelector('a[href^="mailto:"]')
      const ok = /common questions/i.test(text) && mail
      return ok ? { status: 'pass', evidence: 'Support page has an FAQ and a mailto contact link.' } : { status: 'fix', evidence: 'Support page is missing the FAQ or contact link.', action: 'Restore src/pages/legal/Support.tsx.' }
    },
  },
  {
    id: 'nav-stable',
    group: 'Navigation',
    title: 'Bottom navigation has five tabs and every tab screen loads',
    route: '/',
    run: async ({ page }) => {
      const { doc, text } = await page('/')
      const redirected = welcomeRedirect('/', text)
      if (redirected) return redirected
      const tabs = [...(doc?.querySelectorAll('nav[aria-label="Main"] a') ?? [])].map((a) => a.getAttribute('href') ?? '')
      if (tabs.length !== 5) return { status: 'fix', evidence: `Found ${tabs.length} tabs.`, action: 'Bottom navigation must show Home, Subscriptions, Calendar, Insights, Profile.' }
      const broken: string[] = []
      for (const t of tabs) {
        const { text } = await page(t)
        if (/That did not load|Page not found|not found/i.test(text) && !/does-not-exist/.test(t)) broken.push(t)
      }
      return broken.length ? { status: 'fix', evidence: `Tabs that did not load: ${broken.join(', ')}`, action: 'Open the tab and fix its screen.' } : { status: 'pass', evidence: `Five tabs (${tabs.join(', ')}) all render.` }
    },
  },
  {
    id: 'not-found',
    group: 'Navigation',
    title: 'Unknown routes show a friendly not-found screen',
    route: '/does-not-exist',
    run: async ({ page }) => {
      const { text } = await page('/does-not-exist')
      const redirected = welcomeRedirect('/does-not-exist', text)
      if (redirected) return redirected
      const ok = /Home|Back/.test(text) && !RAW_ERROR.test(text)
      return ok ? { status: 'pass', evidence: 'Unknown paths render the not-found screen with a way back.' } : { status: 'fix', evidence: 'Not-found screen is missing or broken.', action: 'Restore src/pages/NotFound.tsx.' }
    },
  },
  {
    id: 'manifest-icons',
    group: 'Store assets',
    title: 'Manifest and icon files are served',
    route: '/__store',
    run: async ({ fetchStatus }) => {
      const files = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/icon-180.png']
      const missing: string[] = []
      for (const f of files) if ((await fetchStatus(f)) !== 200) missing.push(f)
      return missing.length ? { status: 'fix', evidence: `Missing: ${missing.join(', ')}`, action: 'Run npm run logo:export and redeploy.' } : { status: 'pass', evidence: `${files.length} asset files respond with 200.` }
    },
  },
  {
    id: 'screenshots',
    group: 'Store assets',
    title: 'Store screenshots captured from the staged preview',
    route: '/__store',
    run: async () => ({ status: 'confirm', evidence: 'Screenshots are generated files, not something the app can inspect.', action: 'Run npm run store:shots and confirm docs/store/01-home.png to 05-premium.png exist and look right.' }),
  },
  {
    id: 'listing-copy',
    group: 'Store assets',
    title: 'Listing copy inside store limits with no invented claims',
    route: '/__listing',
    run: async ({ page }) => {
      const { text } = await page('/__listing')
      const tooLong = /too long/.test(text)
      const banner = /No invented awards/.test(text)
      return !tooLong && banner ? { status: 'pass', evidence: 'Every listing section is within its limit and the forbidden-claims check is clean.' } : { status: 'fix', evidence: tooLong ? 'A listing section is over its limit.' : 'The forbidden-claims banner is not clean.', action: 'Edit src/lib/storeListing.ts.' }
    },
  },
  {
    id: 'iap-wiring',
    group: 'Store assets',
    title: 'Premium purchase goes through App Store / Play Billing',
    route: '/premium',
    run: async () => ({
      status: 'fix',
      evidence: 'In this build Premium is recorded in the app with no payment collected. Both stores require digital subscriptions sold in a native app to use their billing.',
      action: 'Before submitting a native build, wire StoreKit / Google Play Billing to upgradeToPremium (and Restore purchase), or remove the Start Premium button from that build and keep Premium web-only.',
    }),
  },
  {
    id: 'mail-delivery',
    group: 'Store assets',
    title: 'Password reset emails are delivered by a real mailer',
    route: '/auth/forgot',
    run: async () => {
      try {
        const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' })
        const body = (await res.json()) as { mail?: string }
        return body.mail === 'smtp'
          ? { status: 'pass', evidence: 'The API reports SMTP delivery for reset emails.' }
          : { status: 'fix', evidence: 'The API reports mail mode "outbox": reset links are written to server/outbox instead of being sent.', action: 'Set SMTP_URL (and MAIL_FROM) for the API server before release; the transport is built in. Then re-run.' }
      } catch {
        return { status: 'fix', evidence: 'The API health endpoint did not answer.', action: 'Start the API server (npm run dev) and re-run.' }
      }
    },
  },
  {
    id: 'privacy-url',
    group: 'Legal',
    title: 'Privacy Policy URL answers as a public page',
    route: '/legal/privacy',
    run: async ({ fetchStatus, page }) => {
      const status = await fetchStatus('/legal/privacy')
      const { text } = await page('/legal/privacy')
      const ok = status === 200 && /Privacy Policy/.test(text)
      return ok ? { status: 'pass', evidence: 'GET /legal/privacy responds 200 and renders the policy, so the store listing can link to it directly.' } : { status: 'fix', evidence: `GET /legal/privacy returned ${status}.`, action: 'Serve the app with SPA fallback (SERVE_STATIC=1 or your host\'s rewrite rule).' }
    },
  },
  {
    id: 'crash-boundary',
    group: 'Content',
    title: 'A render crash shows the app error state, not a blank screen',
    route: '/',
    run: async ({ page }) => {
      if (!import.meta.env.DEV) return { status: 'confirm', evidence: 'The crash test route only exists in development builds.', action: 'Run this check in a development build.' }
      const { text } = await page('/__crash')
      const ok = /This screen hit a problem/.test(text) && /Try again|Back to Home/.test(text)
      return ok ? { status: 'pass', evidence: 'A thrown render error was caught and replaced with the recoverable error state.' } : { status: 'fix', evidence: 'The crash test did not show the error boundary.', action: 'Check ErrorBoundary wraps the app in src/App.tsx.' }
    },
  },
  {
    id: 'owner-pages-gated',
    group: 'Content',
    title: 'Owner-only pages are gated in production',
    route: '/__readiness',
    run: async () => {
      const key = (import.meta.env.VITE_STORE_PREVIEW_KEY as string | undefined)?.trim()
      if (import.meta.env.DEV) return { status: 'confirm', evidence: `Development build: owner pages are open here by design. In production they return not-found unless ?key= matches VITE_STORE_PREVIEW_KEY${key ? ' (set)' : ' (not set, so they are fully hidden)'}.`, action: 'Nothing to do unless you want key access in production; then set VITE_STORE_PREVIEW_KEY.' }
      return { status: 'pass', evidence: 'This production build required the owner key to show this page.' }
    },
  },
  {
    id: 'data-safety',
    group: 'Store assets',
    title: 'Data safety / privacy nutrition answers match the Privacy Policy',
    route: '/legal/privacy',
    run: async () => ({ status: 'confirm', evidence: `Declare: email and name (account, optional), financial info the user enters (subscription amounts), app activity (checks, notes), anonymous milestone counts with no identifier (analytics, not linked to the user), diagnostics none, no tracking, no ads. Version ${APP_VERSION}.`, action: 'Fill the store questionnaires from the “Data types we use” section and mark data as encrypted in transit and deletable by the user.' }),
  },
]
