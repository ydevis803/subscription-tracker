/**
 * Fills the iOS asset catalogue from the app's own logo so the native shell carries the same brand as the
 * web app: the 1024 px App Store icon (from public/icon-1024.png) and a 2732 px launch image (navy
 * background, logo centred, matching the web loading screen).
 *   node scripts/ios-assets.mjs
 */
import { copyFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ICONS = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/'
const SPLASH = 'ios/App/App/Assets.xcassets/Splash.imageset/'

copyFileSync('public/icon-1024.png', ICONS + 'AppIcon-512@2x.png')

const svg = readFileSync('public/icon.svg', 'utf8')
const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
const size = 2732
await page.setViewportSize({ width: size, height: size })
await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:#0B1F3A;display:grid;place-items:center"><img src="${dataUrl}" width="480" height="480" style="display:block"></body>`)
await page.waitForTimeout(100)
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await page.screenshot({ path: SPLASH + name, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
console.log('iOS icon and launch image written from public/icon.svg')
