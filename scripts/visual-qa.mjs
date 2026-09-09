/**
 * Visual QA scan at phone (375) and desktop (1280) widths:
 *   node scripts/visual-qa.mjs
 * Reports interactive controls with no hover/active/focus feedback, uneven sibling cards in grids, headings
 * that wrap to three lines or leave a one-word orphan, generic copy, and desktop layout problems.
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const findings = []
const note = (w, state, kind, detail) => findings.push({ w, state, kind, detail })

const SCAN = `(() => {
  const out = { noFeedback: [], uneven: [], headings: [], generic: [] }
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const label = (el) => ((el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40))
  out.controls = [...document.querySelectorAll('button, a[href], [role=button]')].filter((el) => vis(el) && !el.closest('[aria-hidden=true]') && !el.closest('[role=dialog]')).slice(0, 10).map((el) => { const r = el.getBoundingClientRect(); return { label: label(el), x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  for (const grid of document.querySelectorAll('[class*="grid-cols-2"], [class*="grid-cols-3"]')) {
    const kids = [...grid.children].filter(vis)
    if (kids.length < 2) continue
    const rows = new Map()
    for (const k of kids) { const r = k.getBoundingClientRect(); const key = Math.round(r.top); rows.set(key, [...(rows.get(key) ?? []), Math.round(r.height)]) }
    for (const hs of rows.values()) if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 2) out.uneven.push(grid.className.split(' ').slice(0, 3).join('.') + ' row heights ' + hs.join('/') + ' first "' + label(kids[0]) + '"')
  }
  for (const h of document.querySelectorAll('h1, h2, h3, [class*="font-bold"]')) {
    if (!vis(h) || h.closest('button, a')) continue
    const cs = getComputedStyle(h)
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25
    const lines = Math.round(h.getBoundingClientRect().height / lh)
    const t = (h.textContent || '').trim()
    if (!t || t.length > 90) continue
    if (lines >= 3) out.headings.push('3+ lines: "' + t.slice(0, 60) + '"')
    else if (lines === 2) {
      const range = document.createRange(); range.selectNodeContents(h)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0)
      const last = rects[rects.length - 1]
      const first = rects[0]
      if (last && first && last.top > first.top && last.width < 48) out.headings.push('orphan: "' + t.slice(0, 60) + '" last line ' + Math.round(last.width) + 'px')
    }
  }
  const body = document.body.innerText
  for (const re of [/Something went wrong/, /\\bLoading\\.\\.\\./, /\\bSubmit\\b/, /\\bClick here\\b/, /\\bLorem\\b/, /\\bError:\\s/, /\\bOK\\b/]) {
    const m = body.match(re); if (m) out.generic.push(m[0])
  }
  return out
})()`

const DESKTOP = `(() => {
  const main = document.querySelector('main') || document.body
  const r = main.getBoundingClientRect()
  const nav = document.querySelector('nav[aria-label="Main"]')
  const navRow = nav?.querySelector('div')?.getBoundingClientRect()
  return { mainWidth: Math.round(r.width), mainLeft: Math.round(r.left), vw: innerWidth, navRowWidth: navRow ? Math.round(navRow.width) : null, bodyBg: getComputedStyle(document.body).backgroundColor, hscroll: document.documentElement.scrollWidth > innerWidth }
})()`

const routes = ['/', '/subscriptions', '/subscriptions/1', '/subscriptions/new', '/calendar', '/timeline', '/insights', '/history', '/notes', '/total', '/week', '/reminders', '/profile', '/settings', '/premium', '/invite', '/support', '/legal/privacy', '/account/delete', '/auth/sign-in', '/does-not-exist']

for (const width of [375, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: width < 700 ? 740 : 900 }, isMobile: width < 700, hasTouch: width < 700 })
  const page = await context.newPage()
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => undefined); await page.waitForTimeout(450) }
  await go('/')
  if ((await page.getByRole('button', { name: 'Show me my total' }).count()) > 0) {
    for (const s of ['Show me my total', 'Continue without adding', 'Skip the limit for now', 'Explore with sample data']) { await page.getByRole('button', { name: s }).first().click(); await page.waitForTimeout(700) }
    await page.locator('nav[aria-label="Main"]').waitFor()
  }
  for (const r of routes) {
    await go(r)
    if (r === '/subscriptions/new' && (await page.locator('[role=dialog]').count()) > 0) await page.keyboard.press('Escape')
    const s = await page.evaluate(SCAN)
    // Press each control and read its computed style mid-press: something must change.
    for (const c of s.controls) {
      if (c.y < 0 || c.y > page.viewportSize().height) continue
      const before = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y)?.closest('button, a[href], [role=button]'); if (!el) return null; const cs = getComputedStyle(el); return [cs.backgroundColor, cs.color, cs.opacity, cs.transform, cs.filter].join('|') }, [c.x, c.y])
      if (!before) continue
      await page.mouse.move(c.x, c.y)
      await page.mouse.down()
      await page.waitForTimeout(120)
      const during = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y)?.closest('button, a[href], [role=button]'); if (!el) return null; const cs = getComputedStyle(el); return [cs.backgroundColor, cs.color, cs.opacity, cs.transform, cs.filter].join('|') }, [c.x, c.y])
      await page.mouse.up()
      await page.waitForTimeout(150)
      if (during && before === during) note(width, r, 'no-feedback', `"${c.label}"`)
      if (page.url() !== BASE + r) await go(r)
    }
    for (const x of s.uneven) note(width, r, 'uneven-grid', x)
    for (const x of s.headings) note(width, r, 'heading-wrap', x)
    for (const x of s.generic) note(width, r, 'generic-copy', x)
    if (width >= 700) {
      const d = await page.evaluate(DESKTOP)
      if (d.hscroll) note(width, r, 'desktop-hscroll', JSON.stringify(d))
      if (d.mainWidth > 520) note(width, r, 'desktop-width', JSON.stringify(d))
      if (d.navRowWidth && d.navRowWidth > 520) note(width, r, 'desktop-nav', JSON.stringify(d))
    }
  }
  if (width >= 700) {
    await go('/')
    await page.screenshot({ path: process.env.OUT_DIR ? process.env.OUT_DIR + '/desktop-home.png' : '/tmp/desktop-home.png', fullPage: false })
    await go('/timeline')
    await page.screenshot({ path: process.env.OUT_DIR ? process.env.OUT_DIR + '/desktop-timeline.png' : '/tmp/desktop-timeline.png', fullPage: false })
  }
  await context.close()
}
await browser.close()

const grouped = {}
for (const f of findings) (grouped[f.kind] ??= []).push(f)
for (const [kind, list] of Object.entries(grouped).sort()) {
  console.log(`\n== ${kind} (${list.length})`)
  const seen = new Set()
  for (const f of list) {
    const key = f.kind + f.detail
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`  [${f.w}] ${f.state}: ${f.detail}`)
  }
}
console.log(`\n${findings.length} findings`)
