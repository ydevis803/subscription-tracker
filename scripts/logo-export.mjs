/**
 * Renders public/icon.svg to the PNG sizes the manifest and iOS need, and a brand sheet that shows the mark
 * at 512, 128, 64, 32 and 16 px on light and dark backgrounds:
 *   node scripts/logo-export.mjs
 * Outputs: public/icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png, icon-1024.png (opaque square for App Store Connect), play-feature-1024x500.png, docs/brand/logo-sheet.png
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const shapes = svg.replace(/^[\s\S]*?<rect[^>]*rx="30"[^>]*\/>/, '').replace(/<\/svg>\s*$/, '')
const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
// Maskable icons keep the art inside the central 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#0B1F3A"/><g transform="translate(64 64) scale(0.78) translate(-64 -64)">${shapes}</g></svg>`
const maskableUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(maskable)

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
mkdirSync('docs/brand', { recursive: true })

async function png(url, size, path, opaque = false) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0;background:${opaque ? '#0B1F3A' : 'transparent'}"><img src="${url}" width="${size}" height="${size}" style="display:block"></body>`)
  await page.waitForTimeout(80)
  await page.screenshot({ path, omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } })
}
await png(dataUrl, 180, 'public/icon-180.png')
await png(dataUrl, 192, 'public/icon-192.png')
await png(dataUrl, 512, 'public/icon-512.png')
await png(maskableUrl, 512, 'public/icon-maskable-512.png')
// App Store Connect: 1024 px, square corners, no alpha (Apple applies its own mask).
const squareUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#0B1F3A"/>${shapes}</svg>`)
await png(squareUrl, 1024, 'public/icon-1024.png', true)
// Google Play feature graphic: 1024 x 500, navy ground, mark centred (no text).
await page.setViewportSize({ width: 1024, height: 500 })
await page.setContent(`<body style="margin:0;background:#0B1F3A;width:1024px;height:500px;display:flex;align-items:center;justify-content:center"><div style="width:340px;height:340px;border-radius:78px;background:#12294B;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 128 128" width="260" height="260">${shapes}</svg></div></body>`)
await page.waitForTimeout(80)
await page.screenshot({ path: 'public/play-feature-1024x500.png', clip: { x: 0, y: 0, width: 1024, height: 500 } })

// Brand sheet
const sizes = [512, 128, 64, 32, 16]
const row = (bg, fg) => `<div style="background:${bg};color:${fg};padding:32px;display:flex;align-items:flex-end;gap:40px;">
  ${sizes.map((s) => `<div style="text-align:center"><img src="${dataUrl}" width="${s}" height="${s}" style="display:block;margin:0 auto;image-rendering:auto"><div style="font:600 13px system-ui;margin-top:10px;opacity:.7">${s} px</div></div>`).join('')}
  <div style="text-align:center"><div style="width:96px;height:96px;border-radius:24px;background:#0B1F3A;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 128 128" width="72" height="72">${shapes}</svg></div><div style="font:600 13px system-ui;margin-top:10px;opacity:.7">mark on navy</div></div>
</div>`
await page.setViewportSize({ width: 1180, height: 720 })
await page.setContent(`<body style="margin:0;font-family:system-ui">
  <div style="padding:24px 32px 8px;font:700 22px system-ui;color:#0B1F3A;background:#fff">Subscription Tracker mark · navy #0B1F3A · mint #2DD4BF · coral #FF6B5B</div>
  ${row('#FFFFFF', '#0B1F3A')}
  ${row('#F4F6FA', '#0B1F3A')}
  ${row('#0B1F3A', '#FFFFFF')}
</body>`)
await page.waitForTimeout(150)
await page.screenshot({ path: 'docs/brand/logo-sheet.png', fullPage: true })
await browser.close()
console.log('exported icons and docs/brand/logo-sheet.png')
