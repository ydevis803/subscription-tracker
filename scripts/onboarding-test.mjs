/**
 * Brand-new-user onboarding check: finishes in under 60s with human-paced taps,
 * Back keeps answers, a reload mid-flow keeps the draft, answers persist after finishing,
 * and the dashboard is personalised. Run with the dev server up: node scripts/onboarding-test.mjs
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PACE = 700 // ms a person takes between taps

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
const page = await context.newPage()
const failures = []
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures.push(msg) }
const tap = async (name) => { await page.getByRole('button', { name, exact: false }).first().click(); await page.waitForTimeout(PACE) }
const pressed = async (name) => page.getByRole('button', { name, exact: false }).first().getAttribute('aria-pressed')

await page.goto(BASE + '/', { waitUntil: 'networkidle' })
const t0 = Date.now()
await tap('Show me my total')
check(await page.getByText('Which of these do you pay for?').isVisible(), 'screen 2 shows service question')
await tap('Netflix'); await tap('Spotify'); await tap('iCloud+')
check((await pressed('Netflix')) === 'true', 'Netflix selected')
await tap('Continue')
check(await page.getByText('comfortable monthly limit').isVisible(), 'screen 3 shows limit question')
await tap('$100'); await tap('7 days')
// Back keeps answers
await tap('Back')
check((await pressed('Netflix')) === 'true' && (await pressed('Spotify')) === 'true', 'Back to screen 2 keeps selected services')
await tap('Continue')
check((await pressed('$100')) === 'true' && (await pressed('7 days')) === 'true', 'screen 3 keeps limit and heads-up after Back')
// Reload mid-flow keeps the draft
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(PACE)
check(await page.getByText('comfortable monthly limit').isVisible(), 'reload mid-flow returns to the same step')
check((await pressed('$100')) === 'true', 'reload keeps the chosen limit')
await tap('See my total')
check(await page.getByText('Your first win').isVisible(), 'screen 4 shows the first win')
check(await page.getByText('$32.97').isVisible(), 'first win shows the computed total for the picks')
check(await page.getByText('under your $100 limit').isVisible(), 'first win compares total to limit')
await tap('Open my dashboard')
await page.waitForURL(BASE + '/'); await page.waitForTimeout(800)
const elapsed = (Date.now() - t0) / 1000
check(elapsed < 60, `finished onboarding in ${elapsed.toFixed(1)}s (limit 60s)`)
// Home is personalised
const home = await page.locator('body').innerText()
check(home.includes('$32.97'), 'home shows monthly total from picks')
check(home.includes('Budget $100.00'), 'home shows the chosen budget')
check(home.includes('renewal dates are estimated'), 'home flags estimated dates')
check(/next 7 days/i.test(home), 'home upcoming window matches heads-up choice')
// Answers persist across a full reload
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1000)
const after = await page.locator('body').innerText()
check(after.includes('$32.97') && after.includes('Budget $100.00'), 'answers persist after reload')
check(!after.includes('Show me my total'), 'onboarding does not reappear after reload')
const stored = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('subscription-tracker')
  req.onsuccess = () => {
    const db = req.result
    const tx = db.transaction(['profile', 'settings', 'subscriptions'])
    const out = {}
    tx.objectStore('profile').get(1).onsuccess = (e) => (out.profile = e.target.result)
    tx.objectStore('settings').get(1).onsuccess = (e) => (out.settings = e.target.result)
    tx.objectStore('subscriptions').getAll().onsuccess = (e) => (out.subs = e.target.result)
    tx.oncomplete = () => res(out)
  }
}))
check(stored.settings?.monthlyBudget === 100 && stored.settings?.defaultReminderDays === 7, 'settings stored: budget 100, heads-up 7')
check(stored.profile?.currency === 'USD' && stored.profile?.onboardingComplete === true && (stored.profile?.setupServices ?? []).length === 3, 'profile stored with 3 setup services')
check(stored.subs?.length === 3 && stored.subs.every((s) => s.renewalEstimated === true), '3 subscriptions created with estimated dates')
await page.goto(BASE + '/settings', { waitUntil: 'networkidle' }); await page.waitForTimeout(600)
check((await page.getByLabel('Monthly budget').inputValue()) === '100', 'settings screen shows budget 100')
await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED')
process.exit(failures.length ? 1 : 0)
