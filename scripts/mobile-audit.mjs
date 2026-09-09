/**
 * Mobile layout audit: opens every screen (and the main sheets) at narrow phone widths and reports
 * horizontal overflow, clipped text, controls under 44px, content hidden behind fixed bars, sheets that
 * do not fit, and form inputs that a keyboard-height viewport would hide.
 *
 *   node scripts/mobile-audit.mjs            # widths 320 and 360
 *   WIDTHS=320 node scripts/mobile-audit.mjs
 *
 * Needs the dev server (npm run dev). Uses a fresh browser context, so nothing of yours is touched.
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WIDTHS = (process.env.WIDTHS ?? '320,360').split(',').map(Number)
const KEYBOARD_HEIGHT = 380 // what is left of a 640px phone once the keyboard is up

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const findings = []
const note = (width, state, kind, detail) => findings.push({ width, state, kind, detail })

const AUDIT = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight
  const out = { hscroll: null, offenders: [], small: [], clipped: [], covered: [], dialog: null }
  const de = document.documentElement
  if (de.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1) out.hscroll = Math.max(de.scrollWidth, document.body.scrollWidth) - vw
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ').filter(Boolean).slice(0, 3).join('.') + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 32) + '"')
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 }
  const all = [...document.querySelectorAll('body *')]
  for (const el of all) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 && r.left < vw && out.offenders.length < 8) out.offenders.push(label(el) + ' right=' + Math.round(r.right))
  }
  const dialog = document.querySelector('[role=dialog]')
  const scope = dialog ?? document
  for (const el of scope.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=radio], [role=switch], [role=tab]')) {
    if (!visible(el)) continue
    if (el.closest('[aria-hidden=true]')) continue
    const r = el.getBoundingClientRect()
    if (r.height < 43.5 || r.width < 43.5) out.small.push(label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
  }
  for (const el of scope.querySelectorAll('body *')) {
    if (!visible(el) || el.classList.contains('sr-only')) continue
    const cs = getComputedStyle(el)
    if (el.scrollWidth > el.clientWidth + 2 && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' && el.children.length === 0 && (el.textContent || '').trim()) out.clipped.push(label(el) + ' ' + el.scrollWidth + '>' + el.clientWidth)
    if (cs.whiteSpace === 'nowrap' && el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis') out.clipped.push('nowrap ' + label(el))
  }
  if (dialog) {
    const panel = dialog.querySelector(':scope > div:not(button), :scope > form') || dialog.lastElementChild
    const r = panel.getBoundingClientRect()
    out.dialog = { top: Math.round(r.top), bottom: Math.round(r.bottom), vh, fits: r.top >= -1 && r.bottom <= vh + 1 }
  }
  return out
})()`

const COVER = `(() => {
  const vh = window.innerHeight
  const fixed = [...document.querySelectorAll('body *')].filter((el) => { const cs = getComputedStyle(el); return (cs.position === 'fixed' || cs.position === 'sticky') && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().bottom >= vh - 1 && !el.closest('[role=dialog]') && el.getAttribute('aria-live') === null })
  if (!fixed.length) return []
  const barTop = Math.min(...fixed.map((el) => el.getBoundingClientRect().top))
  const main = document.querySelector('main') || document.body
  let maxBottom = 0, worst = ''
  for (const el of main.querySelectorAll('*')) {
    if (el.closest('[role=dialog]')) continue
    const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.position === 'sticky' || cs.display === 'none') continue
    if (fixed.some((f) => f.contains(el))) continue
    if (el.children.length && !el.matches('button, a, input, select, textarea')) continue
    const r = el.getBoundingClientRect(); if (r.height === 0) continue
    if (r.bottom > maxBottom) { maxBottom = r.bottom; worst = el.tagName.toLowerCase() + ' "' + (el.textContent || '').trim().slice(0, 30) + '"' }
  }
  return maxBottom > barTop + 1 ? ['content bottom ' + Math.round(maxBottom) + ' > bar top ' + Math.round(barTop) + ' (' + worst + ')'] : []
})()`

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => note(width, 'page', 'js-error', String(e)))
  const go = async (path) => {
    await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(async () => { await page.waitForTimeout(400); await page.goto(BASE + path, { waitUntil: 'networkidle' }) })
    await page.waitForTimeout(500)
  }
  const click = async (text) => page.getByRole('button', { name: text, exact: false }).first().click()
  const audit = async (state) => {
    await page.waitForTimeout(250)
    const r = await page.evaluate(AUDIT)
    if (r.hscroll) note(width, state, 'horizontal-scroll', `${r.hscroll}px wider than viewport; ${r.offenders.join(' | ')}`)
    for (const s of r.small) note(width, state, 'small-control', s)
    for (const c of r.clipped) note(width, state, 'clipped-text', c)
    if (r.dialog && !r.dialog.fits) note(width, state, 'sheet-overflow', JSON.stringify(r.dialog))
    if (!r.dialog) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(150)
      for (const c of await page.evaluate(COVER)) note(width, state, 'covered-by-bar', c)
      await page.evaluate(() => window.scrollTo(0, 0))
    }
  }
  const keyboard = async (state) => {
    // Shrink the viewport as a software keyboard would (interactive-widget=resizes-content), then focus every field.
    await page.setViewportSize({ width, height: KEYBOARD_HEIGHT })
    await page.waitForTimeout(200)
    const sel = (await page.locator('[role=dialog]').count()) > 0 ? '[role=dialog] input:visible, [role=dialog] textarea:visible, [role=dialog] select:visible' : 'input:visible, textarea:visible, select:visible'
    const fields = await page.locator(sel).count()
    for (let i = 0; i < fields; i++) {
      const f = page.locator(sel).nth(i)
      await f.focus().catch(() => undefined)
      await page.waitForTimeout(120)
      const r = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return null
        const b = el.getBoundingClientRect()
        const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
        const fixedBottom = [...document.querySelectorAll('body *')].filter((x) => { const cs = getComputedStyle(x); return cs.position === 'fixed' && !x.closest('[role=dialog]') && x.getBoundingClientRect().bottom >= window.innerHeight - 1 && x.getBoundingClientRect().height > 0 && x.getAttribute('aria-live') === null }).map((x) => x.getBoundingClientRect().top)
        const floor = fixedBottom.length && !el.closest('[role=dialog]') ? Math.min(...fixedBottom) : window.innerHeight
        return { name: el.getAttribute('aria-label') || el.name || el.id || el.placeholder || el.tagName, top: Math.round(b.top), bottom: Math.round(b.bottom), header: Math.round(header), floor: Math.round(floor), ok: b.top >= header - 1 && b.bottom <= floor + 1 }
      })
      if (r && !r.ok) note(width, state, 'keyboard-hides-input', JSON.stringify(r))
    }
    // The submit control must still be reachable by scrolling.
    const submit = page.locator('[role=dialog] button[type=submit], [role=dialog] button:has-text("Save"), form button[type=submit], button:has-text("Save"), button:has-text("Add subscription"), button:has-text("Send privately")').last()
    if ((await submit.count()) > 0) {
      await submit.scrollIntoViewIfNeeded().catch(() => undefined)
      await page.waitForTimeout(120)
      const r = await submit.evaluate((el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: window.innerHeight, ok: b.top >= 0 && b.bottom <= window.innerHeight + 1 } })
      if (!r.ok) note(width, state, 'keyboard-hides-submit', JSON.stringify(r))
    }
    await page.setViewportSize({ width, height: 640 })
    await page.waitForTimeout(200)
  }

  try {
    // ---------- Onboarding ----------
    await go('/')
    await audit('onboarding-welcome')
    await click('Show me my total')
    for (const name of ['Netflix', 'Spotify']) await click(name)
    await audit('onboarding-services')
    await click('Continue')
    await audit('onboarding-limit')
    await click('$100')
    await click('3 days')
    await click('See my total')
    await audit('onboarding-first-win')
    await click('Back')
    await click('Back')
    for (const name of ['Netflix', 'Spotify']) await click(name)
    await click('Continue without adding')
    await click('See my total')
    await click('Explore with sample data')
    await page.locator('nav[aria-label="Main"]').waitFor()

    // ---------- Screens ----------
    const routes = ['/', '/subscriptions', '/subscriptions/new', '/subscriptions/1', '/subscriptions/1/edit', '/timeline', '/total', '/week', '/reminders', '/calendar', '/insights', '/history', '/notes', '/profile', '/settings', '/premium', '/invite', '/auth/sign-up', '/auth/sign-in', '/auth/forgot', '/does-not-exist']
    for (const r of routes) {
      await go(r)
      await audit(r)
    }
    // Keyboard passes on the forms.
    await go('/subscriptions/new')
    await keyboard('/subscriptions/new')
    await go('/auth/sign-up')
    await keyboard('/auth/sign-up')
    await go('/total')
    await keyboard('/total')
    await go('/reminders')
    await keyboard('/reminders')

    // ---------- Renewal check ----------
    await go('/')
    await page.getByRole('button', { name: /Start check|Review it now|Resume check|Wrap up/ }).first().click()
    await page.waitForURL(BASE + '/check')
    await page.getByText('of', { exact: false }).first().waitFor()
    await audit('/check')
    await click('Remind me')
    await page.waitForTimeout(400)
    await audit('/check after remind')

    // ---------- Sheets ----------
    await go('/notes')
    await click('Add note')
    await page.waitForTimeout(400)
    await audit('sheet notes add')
    await keyboard('sheet notes add')
    await page.keyboard.press('Escape')
    await go('/profile')
    await page.getByRole('button', { name: 'Edit profile' }).click()
    await page.waitForTimeout(400)
    await audit('sheet edit profile')
    await keyboard('sheet edit profile')
    await page.keyboard.press('Escape')
    await go('/settings')
    await click('Send feedback')
    await page.waitForTimeout(400)
    await audit('sheet feedback')
    await keyboard('sheet feedback')
    await page.keyboard.press('Escape')
    await click('Erase all data')
    await page.waitForTimeout(400)
    await audit('sheet confirm erase')
    await page.keyboard.press('Escape')
    await go('/premium')
    await click('Start Premium')
    await page.waitForTimeout(400)
    await audit('sheet premium (guest explainer)')
    await page.keyboard.press('Escape')
    await go('/subscriptions/1')
    await click('Log change')
    await page.waitForTimeout(400)
    await audit('sheet log price change')
    await keyboard('sheet log price change')
    await page.keyboard.press('Escape')
    await go('/calendar')
    const day = page.locator('button[aria-label*="renewal"], button[aria-label*="due"]').first()
    if ((await day.count()) > 0) {
      await day.click()
      await page.waitForTimeout(400)
      await audit('sheet calendar day')
      await page.keyboard.press('Escape')
    }
    await go('/subscriptions/1')
    await click('Mark as cancelled')
    await page.waitForTimeout(400)
    await audit('sheet cancel subscription')
    await page.keyboard.press('Escape')
  } catch (e) {
    note(width, 'runner', 'error', String(e).split('\n')[0])
  }
  await context.close()
}
await browser.close()

const grouped = {}
for (const f of findings) (grouped[`${f.kind}`] ??= []).push(f)
for (const [kind, list] of Object.entries(grouped)) {
  console.log(`\n== ${kind} (${list.length})`)
  for (const f of list) console.log(`  [${f.width}] ${f.state}: ${f.detail}`)
}
console.log(`\n${findings.length} findings`)
