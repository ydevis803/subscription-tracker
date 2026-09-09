/**
 * Accessibility audit: runs axe-core (WCAG 2.1 A/AA + best practice) on every screen and the main sheets,
 * then checks focus visibility and reduced-motion handling by hand.
 *
 *   node scripts/a11y-audit.mjs
 *
 * Needs the dev server (npm run dev). Uses a fresh browser context, so nothing of yours is touched.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await context.newPage()
const findings = []
const note = (state, kind, detail) => findings.push({ state, kind, detail })

const go = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(async () => { await page.waitForTimeout(400); await page.goto(BASE + path, { waitUntil: 'networkidle' }) })
  await page.waitForTimeout(500)
}
const click = async (text) => page.getByRole('button', { name: text, exact: false }).first().click()

const axe = async (state) => {
  await page.waitForTimeout(250)
  await page.addScriptTag({ content: AXE })
  const res = await page.evaluate(async () => {
    const dialog = document.querySelector('[role=dialog]')
    const r = await window.axe.run(dialog ?? document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, rules: { region: { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false } } })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join(' ').trim().slice(0, 140)) }))
  })
  for (const v of res) note(state, `${v.impact}:${v.id}`, `${v.help} — ${v.nodes.join(' | ')}`)
}

/** Tab through the page and make sure every focused element shows a visible focus style. */
const focusPass = async (state, max = 40) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  const seen = new Set()
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      const key = el.tagName + '#' + el.id + '.' + el.className + '|' + (el.textContent || '').slice(0, 20)
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
      const ring = cs.boxShadow && cs.boxShadow !== 'none'
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName
      return { key, ok: outline || ring, name }
    })
    if (!r) break
    if (seen.has(r.key)) break
    seen.add(r.key)
    if (!r.ok) note(state, 'focus-not-visible', r.name)
  }
}

try {
  await go('/')
  await axe('onboarding-welcome')
  await focusPass('onboarding-welcome')
  await click('Show me my total')
  for (const name of ['Netflix', 'Spotify']) await click(name)
  await axe('onboarding-services')
  await click('Continue')
  await axe('onboarding-limit')
  await click('$100')
  await click('3 days')
  await click('See my total')
  await axe('onboarding-first-win')
  await click('Back')
  await click('Back')
  for (const name of ['Netflix', 'Spotify']) await click(name)
  await click('Continue without adding')
  await click('See my total')
  await click('Explore with sample data')
  await page.locator('nav[aria-label="Main"]').waitFor()

  const routes = ['/', '/subscriptions', '/subscriptions/new', '/subscriptions/1', '/subscriptions/1/edit', '/timeline', '/total', '/week', '/reminders', '/calendar', '/insights', '/history', '/notes', '/profile', '/settings', '/premium', '/invite', '/auth/sign-up', '/auth/sign-in', '/auth/forgot', '/does-not-exist']
  for (const r of routes) {
    await go(r)
    await axe(r)
    await focusPass(r, 25)
  }

  // Validation errors must be announced next to the field.
  await go('/subscriptions/new')
  await click('Add subscription')
  await page.waitForTimeout(300)
  await axe('/subscriptions/new with errors')
  const errs = await page.evaluate(() => [...document.querySelectorAll('[aria-invalid=true]')].map((el) => {
    const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)
    const msgs = ids.map((id) => document.getElementById(id)).filter(Boolean)
    return { name: el.getAttribute('aria-label') || el.id || el.name, described: msgs.length > 0, live: msgs.some((m) => m.getAttribute('role') === 'alert' || m.getAttribute('aria-live')), text: msgs.map((m) => m.textContent?.trim()).join(' | ') }
  }))
  if (errs.length === 0) note('/subscriptions/new with errors', 'no-invalid-fields', 'submitting an empty form marked no field aria-invalid')
  for (const e of errs) if (!e.described || !e.live) note('/subscriptions/new with errors', 'error-not-announced', JSON.stringify(e))

  // Sheets
  await go('/notes')
  await click('Add note')
  await page.waitForTimeout(400)
  await axe('sheet notes add')
  await page.keyboard.press('Escape')
  await go('/profile')
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.waitForTimeout(400)
  await axe('sheet edit profile')
  await page.keyboard.press('Escape')
  await go('/settings')
  await click('Send feedback')
  await page.waitForTimeout(400)
  await axe('sheet feedback')
  await page.keyboard.press('Escape')
  await go('/premium')
  await click('Start Premium')
  await page.waitForTimeout(400)
  await axe('sheet premium')
  await page.keyboard.press('Escape')
  await go('/subscriptions/1')
  await click('Log change')
  await page.waitForTimeout(400)
  await axe('sheet log price change')
  await page.keyboard.press('Escape')

  // Renewal check
  await go('/')
  await page.getByRole('button', { name: /Start check|Review it now|Resume check|Wrap up/ }).first().click()
  await page.waitForURL(BASE + '/check')
  await page.getByText('of', { exact: false }).first().waitFor()
  await axe('/check')

  // Reduced motion: no running CSS animations on Home or in a sheet.
  await context.close()
  const rm = await browser.newContext({ viewport: { width: 375, height: 740 }, reducedMotion: 'reduce' })
  const p2 = await rm.newPage()
  await p2.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(300)
  const anims = await p2.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => { const cs = getComputedStyle(el); return cs.animationName !== 'none' && cs.animationDuration !== '0s' && cs.animationPlayState !== 'paused' }).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.') + ' ' + getComputedStyle(el).animationName).slice(0, 10))
  for (const a of anims) note('reduced-motion /', 'animation-still-running', a)
  await rm.close()
} catch (e) {
  note('runner', 'error', String(e).split('\n')[0])
}
await browser.close()

const grouped = {}
for (const f of findings) (grouped[f.kind] ??= []).push(f)
for (const [kind, list] of Object.entries(grouped).sort()) {
  console.log(`\n== ${kind} (${list.length})`)
  for (const f of list) console.log(`  ${f.state}: ${f.detail}`)
}
console.log(`\n${findings.length} findings`)
