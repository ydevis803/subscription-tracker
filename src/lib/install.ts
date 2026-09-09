/** Add-to-home-screen guidance that matches the browser the user is actually holding. */
export type Platform = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop-chrome' | 'desktop-safari' | 'desktop-other'

export function detectPlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): Platform {
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  const isChrome = /Chrome\/|CriOS\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)
  const isSafari = /Safari\//.test(ua) && !/Chrome\/|CriOS\/|Android/.test(ua)
  if (isIOS) return /CriOS\/|FxiOS\/|EdgiOS\//.test(ua) ? 'ios-other' : 'ios-safari'
  if (isAndroid) return isChrome ? 'android-chrome' : 'android-other'
  if (isChrome) return 'desktop-chrome'
  if (isSafari) return 'desktop-safari'
  return 'desktop-other'
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export interface InstallGuide {
  title: string
  steps: string[]
  note?: string
}

export function installGuide(platform: Platform = detectPlatform()): InstallGuide {
  switch (platform) {
    case 'ios-safari':
      return { title: 'iPhone or iPad (Safari)', steps: ['Tap the Share button at the bottom of Safari (the square with an arrow).', 'Scroll the sheet and tap “Add to Home Screen”.', 'Tap “Add” in the top right. The icon appears on your Home Screen and opens full screen.'], note: 'Only Safari can add web apps to the iOS Home Screen. Reminders in the browser tab are not available inside the installed app on iOS.' }
    case 'ios-other':
      return { title: 'iPhone or iPad', steps: ['Open this page in Safari (copy the link, then paste it into Safari).', 'Tap the Share button, then “Add to Home Screen”.', 'Tap “Add”.'], note: 'Chrome, Firefox and Edge on iOS cannot add web apps to the Home Screen; Safari can.' }
    case 'android-chrome':
      return { title: 'Android (Chrome)', steps: ['Tap the three-dot menu in the top right of Chrome.', 'Tap “Add to Home screen” (on some phones it says “Install app”).', 'Confirm. The icon appears on your home screen and opens without the browser bar.'] }
    case 'android-other':
      return { title: 'Android', steps: ['Open the browser menu.', 'Look for “Add to Home screen” or “Install”.', 'Confirm to add the icon.'], note: 'Chrome gives the most complete install; Samsung Internet and Firefox also support it.' }
    case 'desktop-chrome':
      return { title: 'Desktop (Chrome or Edge)', steps: ['Click the install icon at the right end of the address bar (a monitor with an arrow).', 'Click “Install”. The app opens in its own window and appears in your apps.'] }
    case 'desktop-safari':
      return { title: 'Mac (Safari)', steps: ['Choose File → Add to Dock.', 'Confirm. The app opens from the Dock in its own window.'] }
    default:
      return { title: 'This browser', steps: ['Open the browser menu.', 'Choose “Install” or “Add to Home screen” if offered, or bookmark this page.'] }
  }
}

export const ALL_GUIDES: Platform[] = ['ios-safari', 'android-chrome', 'desktop-chrome']
