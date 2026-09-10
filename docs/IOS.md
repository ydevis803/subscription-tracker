# iOS app

The iOS app is the unchanged web app inside a native shell (Capacitor). Screens, journeys and design are the
same files as the web build; nothing is forked. The native project lives in `ios/App` and is generated and
updated by Capacitor, so only `capacitor.config.ts`, `.env.ios` and the files under `ios/App/App` that you
edit by hand (icons, Info.plist) are worth committing.

## How it connects to the server

- The pages ship inside the app bundle and load from `capacitor://localhost`.
- Every server call goes through `apiUrl()` in `src/lib/apiBase.ts`, which prefixes `VITE_API_URL`. On the
  web that variable is empty, so paths stay relative exactly as before. `.env.ios` sets it to the public
  Railway address for `vite build --mode ios`.
- `CapacitorHttp` is enabled in `capacitor.config.ts`, so `fetch` runs through native networking and iOS
  keeps the session cookie itself. The server accepts `capacitor://localhost` as an origin for JSON calls;
  browsers can never send that scheme, so the web surface is unchanged.
- Owner-only pages (`/__launch`, `/__readiness`, ...) are hidden in the app because `.env.ios` leaves
  `VITE_STORE_PREVIEW_KEY` empty.

## Commands

| Task | Command |
| --- | --- |
| Build the web bundle for iOS and copy it into the Xcode project | `npm run ios:sync` |
| Open the project in Xcode | `npm run ios:open` |
| Regenerate the app icon and launch image from the logo | `npm run ios:assets` |
| Build for the simulator from the terminal | `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath ios/build build` |
| Install and launch on a booted simulator | `xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/App.app && xcrun simctl launch booted com.ydevis.subscriptiontracker` |

After any change to the web app, run `npm run ios:sync` again before building in Xcode.

## Identity

- Bundle identifier: `com.ydevis.subscriptiontracker`
- Display name: Subscription Tracker
- Xcode 26 with Swift Package Manager; CocoaPods is not needed.

## Known limits (unchanged from the web app, flagged for App Store review)

- Premium is recorded in the app with no payment. Apple requires StoreKit for digital subscriptions, so review
  will reject a Premium purchase until StoreKit is added.
- Reminders are browser notifications and only fire while the app is open. Native push is not wired.
- The end-of-session backup beacon (`navigator.sendBeacon`) is best effort inside the shell; the regular sync
  on the next open covers it.
