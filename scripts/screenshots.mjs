/**
 * Captures a reference screenshot of every screen, sheet and state at phone size.
 * Run with the dev server up:  npm run dev  (in another terminal)  then  npm run screenshots
 * Output: docs/screenshots/*.png  (375x812 viewport, 2x, full page)
 */
import { chromium } from 'playwright-core'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = resolve('docs/screenshots')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
  timezoneId: 'America/New_York',
})
const page = await context.newPage()
let n = 0
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(opts.wait ?? 500)
  const file = `${String(++n).padStart(2, '0')}-${name}.png`
  if (opts.fullPage ?? true) {
    // Grow the viewport to the document height so fixed elements (bottom nav, floating button)
    // render at their real position instead of being stitched mid-page.
    const height = await page.evaluate(() => Math.max(812, document.documentElement.scrollHeight))
    await page.setViewportSize({ width: 375, height })
    await page.waitForTimeout(150)
    await page.screenshot({ path: resolve(OUT, file), fullPage: false })
    await page.setViewportSize({ width: 375, height: 812 })
  } else {
    await page.screenshot({ path: resolve(OUT, file), fullPage: false })
  }
  console.log('saved', file)
}
const go = async (path) => {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
  } catch (e) {
    if (!String(e).includes('ERR_ABORTED')) throw e
    await page.waitForTimeout(500) // an in-app navigation raced ours; try once more
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
  }
  await page.waitForTimeout(600)
}
const click = async (text) => {
  await page.getByRole('button', { name: text, exact: false }).first().click()
}

// ---------- Onboarding (4 screens) ----------
await go('/')
await shot('onboarding-welcome', { fullPage: false })
await click('Show me my total')
for (const name of ['Netflix', 'Spotify', 'YouTube Premium', 'iCloud+']) await click(name)
await shot('onboarding-services')
await click('Continue')
await click('$100')
await click('3 days')
await shot('onboarding-limit-and-headsup')
await click('See my total')
await shot('onboarding-first-win')
// Back twice, clear the picks, and take the sample-data path so the rest of the captures have rich data.
await click('Back')
await click('Back')
for (const name of ['Netflix', 'Spotify', 'YouTube Premium', 'iCloud+']) await click(name)
await click('Continue without adding')
await click('See my total')
await shot('onboarding-first-win-no-picks')
await click('Explore with sample data')
await page.locator('nav[aria-label="Main"]').waitFor() // dashboard is up once the bottom nav exists

// ---------- Main screens (free plan, sample data) ----------
await go('/')
await shot('home-dashboard')
// ---------- Renewal check (the core journey) ----------
await page.getByRole('button', { name: /Start check|Review it now|Resume check|Wrap up/ }).first().click()
await page.waitForURL(BASE + '/check')
await page.getByText('of', { exact: false }).first().waitFor()
await shot('check-review-item')
await click('Remind me')
await page.waitForTimeout(500)
let guard = 0
while ((await page.getByRole('button', { name: 'Keep it' }).count()) > 0 && guard++ < 20) {
  await click('Keep it')
  await page.waitForTimeout(450)
}
await page.getByText('all clear', { exact: false }).first().waitFor()
await shot('check-complete')
await click('Back to Home')
await page.waitForURL(BASE + '/')
await page.waitForTimeout(600)
await shot('home-all-clear')
// ---------- Seven-day challenge: all days expanded ----------
await click('All days')
await page.waitForTimeout(300)
await shot('home-challenge-days')
await click('Less')
// ---------- Rating prompt (second completed check on a later day, profile older than today) ----------
await page.evaluate(async () => {
  const open = (name) => new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const d = await open('subscription-tracker')
  const checks = await new Promise((res) => { const r = d.transaction('renewalChecks').objectStore('renewalChecks').getAll(); r.onsuccess = () => res(r.result) })
  const done = checks.find((c) => c.completedAt)
  const yday = new Date(); yday.setDate(yday.getDate() - 1)
  const created = new Date(); created.setDate(created.getDate() - 3)
  await new Promise((res) => {
    const tx = d.transaction(['renewalChecks', 'profile', 'settings'], 'readwrite')
    if (done) tx.objectStore('renewalChecks').put({ ...done, id: 999, startedAt: yday.toISOString(), completedAt: yday.toISOString() })
    const p = tx.objectStore('profile'); p.get(1).onsuccess = (e) => { const v = e.target.result; v.createdAt = created.toISOString(); p.put(v) }
    // The sample data costs more than the $100 limit picked in onboarding; that is a problem state, which rightly hides the prompt. Lift it for the capture.
    const st = tx.objectStore('settings'); st.get(1).onsuccess = (e) => { const v = e.target.result; v.monthlyBudget = 1000; st.put(v) }
    tx.oncomplete = res
  })
  d.close()
})
await go('/')
await page.getByText('How is Subscription Tracker working').waitFor()
await shot('home-rating-prompt')
await page.getByRole('radio', { name: '2 of 5: Needs work' }).click()
await page.waitForTimeout(500)
await shot('sheet-feedback-private', { fullPage: false })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.getByRole('radio', { name: '5 of 5: Love it' }).click()
await page.waitForTimeout(500)
await shot('sheet-rating-store', { fullPage: false })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await click('Not now')
await page.waitForTimeout(400)
// ---------- Invite a friend (offered after the completed check) ----------
await go('/invite')
await page.getByText('Try it here', { exact: false }).waitFor()
await shot('invite')
await go('/total')
await shot('monthly-total')
await go('/week')
await shot('weekly-summary')
await go('/subscriptions')
await shot('subscriptions-list')
await go('/subscriptions/new')
await shot('subscription-add-form')
// find Adobe's id
await go('/subscriptions')
await page.getByRole('button', { name: /Adobe Creative Cloud/ }).first().click()
await page.waitForURL(/\/subscriptions\/\d+$/)
const adobeUrl = page.url().replace(BASE, '')
await page.waitForTimeout(600)
await shot('subscription-detail')
await go(adobeUrl + '/edit')
await page.getByLabel('Amount').fill('699.88')
await shot('subscription-edit-form-price-change')
await go(adobeUrl)
await click('Add note')
await shot('sheet-cancellation-note', { fullPage: false })
await page.keyboard.press('Escape')
await click('Log change')
await shot('sheet-log-price-change', { fullPage: false })
await page.keyboard.press('Escape')
await click('Mark as cancelled')
await shot('sheet-confirm-cancel', { fullPage: false })
await page.keyboard.press('Escape')
await go('/calendar')
await shot('renewal-calendar')
// Day sheet: tap the first day that has renewals, then the previous month's settled card.
await page.locator('[role="group"] button[aria-label*="renewals"]').first().click()
await page.waitForTimeout(500)
await shot('calendar-day-sheet', { fullPage: false })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Previous month' }).click()
await page.waitForTimeout(600)
await shot('calendar-month-settled')
// ---------- Renewal timeline (signature experience) ----------
await go('/timeline')
await shot('timeline-first-visit')
await click('Got it')
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Music' }).first().click()
await page.waitForTimeout(600)
await shot('timeline-category-highlight')
await click('Show all')
await page.locator('ol button[aria-expanded]').first().click()
await page.waitForTimeout(400)
await shot('timeline-row-actions', { fullPage: false })
await go('/insights')
await shot('insights-free')
await go('/history')
await shot('price-history')
await go('/notes')
await shot('cancellation-notes')
await go('/profile')
await shot('profile')
await page.getByRole('button', { name: 'Edit profile' }).click()
await shot('sheet-edit-profile', { fullPage: false })
await page.keyboard.press('Escape')
await go('/settings')
await shot('settings')
await go('/reminders')
await shot('reminders')
await go('/premium')
await shot('premium-plans')
await click('Start Premium')
await shot('sheet-premium-confirm', { fullPage: false })
await page.keyboard.press('Escape')
// ---------- Seven-day trial ----------
await click('Try Premium free')
await page.waitForURL(BASE + '/')
await page.waitForTimeout(800)
await shot('home-trial-day')
await go('/premium')
await shot('premium-trial')
await click('End trial now')
await page.getByRole('button', { name: 'End trial', exact: true }).click()
await page.waitForTimeout(600)
await go('/')
await shot('home-trial-ended')
await click('Stay on free')
await page.waitForTimeout(400)

// ---------- Accounts ----------
await go('/')
await click('Back up my data')
await shot('sheet-account-explainer', { fullPage: false })
await page.keyboard.press('Escape')
await go('/auth/sign-up')
await shot('auth-sign-up', { fullPage: false })
await go('/auth/sign-in')
await shot('auth-sign-in', { fullPage: false })
await go('/auth/forgot')
await shot('auth-forgot-password', { fullPage: false })
await go('/auth/reset')
await shot('auth-reset-link-missing', { fullPage: false })
await go('/auth/sign-up')
await page.getByLabel('Name').fill('Yanet')
await page.getByLabel('Email').fill(`shots-${Date.now()}@example.com`)
await page.getByLabel('Password', { exact: true }).fill('a long enough passphrase')
await click('Create account')
await page.locator('nav[aria-label="Main"]').waitFor()
await go('/profile')
await shot('profile-signed-in')

// ---------- Free limit paywall ----------
await go('/subscriptions/new')
await page.getByLabel('Name').fill('YouTube Premium')
await page.getByLabel('Amount').fill('13.99')
await click('Add subscription')
await page.waitForURL(/\/subscriptions\/\d+$/)
await go('/subscriptions')
await shot('subscriptions-list-limit-reached')
await click('Add subscription')
await shot('sheet-paywall', { fullPage: false })
await page.keyboard.press('Escape')

// ---------- Premium ----------
await go('/premium')
await click('Start Premium')
await click('Activate Premium')
await page.waitForTimeout(600)
await shot('premium-activated', { fullPage: false })
await go('/insights')
await shot('insights-premium')
await go('/premium')
await shot('premium-manage')
await go('/profile')
await shot('profile-premium', { fullPage: false })

// ---------- Empty states ----------
await go('/settings')
await click('Erase all data')
await shot('sheet-confirm-erase', { fullPage: false })
await page.getByRole('button', { name: 'Erase all data' }).last().click()
await page.waitForTimeout(800)
await click('Show me my total')
await click('Continue without adding')
await click('Skip the limit for now')
await click('Add my first subscription')
await page.waitForURL(BASE + '/subscriptions/new')
await page.getByText('New subscription').waitFor()
await go('/')
await shot('home-empty')
await go('/subscriptions')
await shot('subscriptions-empty')
await go('/calendar')
await shot('calendar-empty')
await go('/insights')
await shot('insights-empty')
await go('/notes')
await shot('notes-empty')
await go('/history')
await shot('price-history-empty')
await go('/settings')
await shot('settings-empty-with-load-samples')
await go('/does-not-exist')
await shot('not-found', { fullPage: false })

await browser.close()
console.log(`done: ${n} screenshots in ${OUT}`)
