import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native iOS shell around the unchanged web build. The pages come from the app bundle; data calls go to
 * the public API (VITE_API_URL, see .env.ios). CapacitorHttp routes fetch through native networking so the
 * session cookie is stored and sent by iOS itself rather than by a cross-origin web view.
 */
const config: CapacitorConfig = {
  appId: 'com.ydevis.subscriptiontracker',
  appName: 'Subscription Tracker',
  webDir: 'dist',
  backgroundColor: '#0B1F3A',
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    // Shrink the web view when the keyboard opens (as Safari does with interactive-widget=resizes-content)
    // instead of scrolling the whole document under the status bar.
    Keyboard: { resize: 'native', resizeOnFullScreen: true },
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
  },
}

export default config
