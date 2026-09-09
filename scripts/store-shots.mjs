/**
 * Captures the five staged store screens from the owner preview at 3× (1170 × 2532):
 *   node scripts/store-shots.mjs
 * Output: docs/store/01-home.png … 05-premium.png, plus docs/store/thumbnails.png (all five at 1/6 size).
 * Needs the dev server (npm run dev); the route renders demo data only.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const KEY = process.env.VITE_STORE_PREVIEW_KEY ? `?key=${encodeURIComponent(process.env.VITE_STORE_PREVIEW_KEY)}` : ''

mkdirSync('docs/store', { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 2200, height: 1000 }, deviceScaleFactor: 3 })
const page = await context.newPage()
await page.goto(BASE + '/__store' + KEY, { waitUntil: 'networkidle' })
await page.locator('[data-frame="home"]').waitFor()
await page.waitForTimeout(600)

const order = ['home', 'timeline', 'list', 'progress', 'premium']
let i = 0
for (const id of order) {
  i++
  const frame = page.locator(`[data-frame="${id}"]`)
  await frame.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  await frame.screenshot({ path: `docs/store/0${i}-${id}.png` })
  console.log(`saved docs/store/0${i}-${id}.png`)
}

// Thumbnail strip: how the set reads in a store listing.
const thumb = await browser.newPage({ viewport: { width: 1100, height: 240 }, deviceScaleFactor: 1 })
const dataUrl = (path) => 'data:image/png;base64,' + readFileSync(path).toString('base64')
await thumb.setContent(`<body style="margin:0;background:#F4F6FA;display:flex;gap:16px;padding:16px;align-items:flex-start">${order.map((id, n) => `<img src="${dataUrl(`docs/store/0${n + 1}-${id}.png`)}" style="width:195px;height:422px;border-radius:14px;box-shadow:0 4px 12px rgba(11,31,58,.15)">`).join('')}</body>`)
await thumb.setViewportSize({ width: 1100, height: 460 })
await thumb.waitForTimeout(400)
await thumb.screenshot({ path: 'docs/store/thumbnails.png' })
console.log('saved docs/store/thumbnails.png')
await browser.close()
