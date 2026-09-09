# Subscription Tracker

See every recurring charge before it quietly renews.

A mobile-first web app for people who want control of their monthly digital spending. Data is stored locally on the device (IndexedDB), so it works offline and needs no account.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 on a phone-sized viewport. `npm run build` produces a production bundle in `dist/`.

## Legal pages

Privacy Policy (`/legal/privacy`), Terms of Use (`/legal/terms`), Support (`/support`) and Delete Account (`/account/delete`) are reachable before an account exists: from the onboarding welcome screen, the sign-up and sign-in screens, the account explainer sheet, and Settings → About & legal. Owner details are placeholders until `.env` sets `VITE_OWNER_NAME`, `VITE_OWNER_ADDRESS`, `VITE_SUPPORT_EMAIL` and `VITE_LEGAL_JURISDICTION` (see `.env.example`); the pages flag placeholders visibly. The effective date lives in `LEGAL_EFFECTIVE_DATE` in `src/lib/legal.ts`.

## Permissions

Every personal record belongs to the signed-in account that wrote it; the owner comes from the session, never from the request. There is no admin role because nothing in the product needs one. [docs/PERMISSIONS.md](docs/PERMISSIONS.md) lists the intended permission for every entity and the public surface; `npm run test:permissions` checks the rules against the dev server.

## Accounts and sync

Guests can use everything without an account; data stays in the browser. A free account backs the data up so it can be restored on another device. Account creation is only suggested when it genuinely matters (saving progress after tracking something, or activating Premium), always preceded by a short explanation of why.

- `server/` is a small Node API (no framework) using the built-in `node:sqlite` module. Passwords are hashed with scrypt, sessions are random tokens stored hashed and sent as an HttpOnly, SameSite=Lax cookie, mutating requests are checked against the request origin, and sign-in / reset requests are rate limited.
- Each account's data is a JSON snapshot on the server (`PUT /api/data`), pushed automatically after every change and pulled on sign-in. Each account also gets its own IndexedDB database in the browser, which is deleted on sign-out so a signed-out visitor never sees another person's data.
- Password reset emails are written to `server/outbox/` until an email provider is wired in.
- `npm run dev` starts the API on port 8787 and Vite on 5173 (proxying `/api`). `npm run start` serves the built app and API from one process. Set `COOKIE_SECURE=1` behind HTTPS and `ALLOWED_ORIGIN_HOSTS` behind a proxy that rewrites the Host header.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 (navy / mint / coral theme in `src/index.css`)
- Dexie (IndexedDB) for persistence, `dexie-react-hooks` for live queries
- react-router for navigation, date-fns for date math

## Screens

| Route | Screen |
| --- | --- |
| `/` (first run) | Onboarding (4 screens): outcome-led welcome, which services you pay for (with currency), monthly limit + heads-up window, personalized first win showing the total and next charge |
| `/` | Home dashboard: monthly total, budget bar, next 7/30 days, alerts, upcoming renewals, category snapshot |
| `/check` | Renewal check: guided pass over the next 30 days, one decision per renewal (keep, remind, cancel), saved as you go, resumable, celebration on completion |
| `/subscriptions` | Subscription list with search, status filter, category filter, sort, free-limit banner |
| `/subscriptions/new` | Add subscription form |
| `/subscriptions/:id` | Subscription detail: stats, pause/resume, mark as paid, cancellation notes, price history, details, cancel/delete |
| `/subscriptions/:id/edit` | Edit form (amount changes are recorded as price history) |
| `/total` | Monthly total: how the number is made, per-subscription shares, limit with validation and history, six-month trend |
| `/timeline` | Renewal timeline: rolling horizon, category totals, running totals, notes in place, export to calendar (.ics) or copy a summary |
| `/calendar` | Renewal calendar: month grid, category totals, renewal timeline with cancellation notes |
| `/insights` | Spending insights: category donut, billing mix, biggest items; Premium: 12-month projection, price-increase impact, savings detector |
| `/history` | Price-change history across all subscriptions with price drift |
| `/notes` | Cancellation notes: open reminders, completed notes, add note |
| `/profile` | Profile with plan badge, stats, links, edit name/email |
| `/settings` | Currency, budget, reminders, display, export, load samples, erase data |
| `/premium` | Premium plans ($3.99/month or $24.99/year), activation (asks for an account first), manage/end plan |
| `/invite` | Invite a friend: personal invitation with the app link, share / copy link / copy text with copied feedback, cosmetic badges (no cash rewards). Offered only after a positive moment (completed check, settled decisions, a good week) and never while over budget or in an error state |
| Home rating prompt | After renewal checks completed on two different days (never on the first day, never during a problem), one inline card asks for a score. Low scores open a private feedback note stored only with the user's data; high scores show an App Store rating placeholder. Not now works, at most three asks 60 days apart, never again once answered. Settings → Send feedback opens the same private form any time |
| Home seven-day starter | Beginner challenge around the renewal check and monthly total: seven days that unlock in order, each under ten minutes, each completed from real data (no manual tick), each showing a win in the user's numbers and pointing to one existing feature (total, check, list, calendar, notes, insights, reminders). Seven progress dots on Home and Profile; days never expire; Hide / Show on Home again |
| `/auth/sign-up` | Create account (name, email, password); guest data moves into the account |
| `/auth/sign-in` | Sign in; offers to merge guest data if both sides have data |
| `/auth/forgot` | Request a password reset link |
| `/auth/reset` | Choose a new password from the emailed link |

## Data entities (Dexie tables in `src/db/schema.ts`)

- `subscriptions`: name, category, amount, currency, billing cycle, next renewal, start date, status (active/trial/paused/cancelled), payment method label, website, notes, trial end, reminder override
- `priceChanges`: subscription, previous amount, new amount, effective date, note
- `cancellationNotes`: subscription, reason, content, remind-on date, open/done
- `profile`: name, email, currency, goal, onboarding flag, onboarding answers, plan tier, premium interval and renewal
- `settings`: default reminder days, monthly budget (with change history), notification toggles, week start, list options, spending insights on/off
- `categories`: ten spending categories with colors
- `billingEvents`: upgrade / downgrade / interval changes for the user's own Premium plan
- `renewalChecks`: guided checks over the next 30 days with per-renewal decisions and a completion summary

## End-to-end journeys

`npm run test:journeys` (dev server running) drives seven journeys in a fresh browser context and reports each step: new visitor to first win; returning user checking renewals and the monthly total; create, edit and delete a subscription; a free user reaching the Premium boundary; a Premium (trial) user using the timeline with category totals and cancellation notes; logout and login; and a temporary backup outage with Retry. Every visited screen is scanned for raw error text and console errors, and the main screens are probed for dead buttons (a tap that changes nothing). Records it creates are prefixed TEST and the account it creates is deleted at the end.

## Visual QA

`npm run qa:visual` (dev server running) walks every screen at 375 and 1280 px, presses the first controls on each screen and reads their computed style mid-press to prove every tap answers, checks sibling cards in each grid row for equal heights, flags headings that wrap to three lines or leave a one-word orphan, scans for generic copy, and checks the desktop column stays centred without horizontal scroll. Design rules it protects: one vertical rhythm (`space-y-5`) on content pages, a global press-down and hover tint on every button and link, brand coral buttons with navy text (5.9:1), mint for the primary positive action, and a framed 480 px column on desktop.

## Mobile audit

`npm run audit:mobile` (dev server running) opens every screen and sheet at 320 and 360 px in a fresh browser context and reports horizontal overflow, clipped text, controls under 44 px, content hidden behind fixed bars, sheets that do not fit, and inputs a keyboard-height viewport would hide. Shared controls (buttons, chips, text links, segmented tabs, icon buttons) are at least 44 px tall; calendar day cells are 40 px wide at 320 px because seven columns must fit, and 56 px tall.

## Offline behaviour

The app is local-first, so adding, editing and deciding keep working without a connection and are never lost. What needs the network is signing in or up, account backup and Premium activation, and the app says so rather than claiming full offline support. A sticky banner appears when the network is down or a backup cannot reach the server, with Retry; it clears itself when a request gets through and a pending backup is pushed automatically when the browser comes back online. Typed input in the subscription form, cancellation note sheet, feedback sheet and the sign-up / sign-in forms (never passwords) is kept in local storage until it is saved or discarded, so a refresh, a lost connection or an accidental Back restores it with a "we kept what you typed" notice.

## Performance

Screens other than Home and onboarding are code-split and lazy-loaded behind a page-shaped skeleton (never a spinner); the chunks behind the tabs are prefetched once Home is idle, and libraries (React, Dexie, date-fns) sit in their own long-lived chunks. Home renders the total, next charges and today's action first and defers the weekly summary and category breakdown to an idle callback behind same-size placeholders. Data hooks keep the last result per scope in memory, so a screen visited before paints instantly while IndexedDB is re-read. Account pulls send `If-None-Match` with the last snapshot validator and the server answers `304` when nothing changed. The app renders no raster images; service marks are text and every icon is an inline SVG with a viewBox.

## Accessibility

`npm run audit:a11y` (dev server running) runs axe-core (WCAG 2.1 A/AA and best practice) on every screen and sheet, tabs through each page to confirm a visible focus style, submits an empty form to confirm errors are linked to their fields and announced, and loads Home with reduced motion to confirm no animation runs. Conventions: every icon-only control has an `aria-label`; field messages are linked with `aria-describedby` and use `role="alert"`; status is always text or an icon as well as colour (badges, alerts, progress bars carry labels and values); the focus ring is a 3px mint outline; font sizes are in rem so browser text scaling applies; `text-faint` (#5F6F86) and `coral-700` (#B03A2B) meet 4.5:1 on white and the tinted surfaces; service marks pick white or navy initials by contrast.

## Launch checklist

`/__launch` (owner-only) is the web / PWA launch list: app name and icon, public URL, visibility, first-time onboarding, sign-up and login, primary action persistence, Premium boundary, legal pages, support contact, mobile display, and install-to-home-screen. Items can be marked “Tested live” only while the page is open on the published origin (`VITE_APP_URL`); automated pre-checks run on that origin first, and each mark records where and when it was made. The install steps shown to users on /support come from `src/lib/install.ts` and put the reader's own platform first (Safari on iOS, Chrome on Android, Chrome or Edge on desktop).

## Release blockers

Two things cannot be fixed inside the app and stay marked Fix on `/__readiness` until the owner does them: fill the four contact variables in `.env`, and, for a native store build, route Premium purchases through StoreKit / Google Play Billing (this build records Premium locally with no payment) or remove the purchase button from that build. Password reset emails are written to `server/outbox/` until an SMTP transport is configured (`/api/health` reports the mail mode). A render crash anywhere is caught by an error boundary that shows the app's error state with a reload, never a blank screen.

## Store readiness

`/__readiness` (same owner-only gate) is the launch checklist. Each item runs a live check: it loads the real screen in a hidden same-origin frame or fetches the served file, then shows Pass, Fix or Confirm with the evidence it saw and a link to the screen. Items: legal links before sign-up and on entry screens, complete Privacy Policy, real contact details (Fix until `.env` is filled), account deletion on its page and from Settings, restore/manage on the plan screen, justified permissions, no placeholder copy, no raw errors, Support page, five stable tabs, not-found screen, manifest and icons, screenshots and data-safety answers (Confirm by hand), listing copy within limits.

## Store listing

`/__listing` (same owner-only gate as the screenshot preview) holds the listing copy from `src/lib/storeListing.ts`: five app-name options under 30 characters, the chosen subtitle, promotional text, short and full descriptions organised by outcomes then features, ten keywords and version 1.0 release notes. Every section has its own Copy button with a character count against the store limit, a banner fails loudly if the copy ever contains awards, ratings, user counts or unsupported push claims, and a claims check lists each statement with the screen that delivers it.

## Store screenshots

`/__store` stages five phone frames (outcome-led Home, renewal timeline with category totals and cancellation notes, subscription list, visible progress, Premium value) with short headline overlays, a consistent status bar and the real bottom navigation. It renders only from `src/lib/demoData.ts`, never from the database, so no private data can appear. It is open in development builds and, in production, only with `?key=` matching `VITE_STORE_PREVIEW_KEY`; it is not linked from the app. `npm run store:shots` captures each frame at 3× (1170 × 2532) into `docs/store/` plus a thumbnail strip.

## Logo

The mark is a mint receipt with three bold line items and a coral renewal dot on a navy tile, inspired by the receipt symbol but drawn with thick shapes only, no text, so it reads at 16 px. Source of truth: `src/components/ui/Logo.tsx` (React) and `public/icon.svg` (favicon and manifest), kept identical. `npm run logo:export` renders the PNG sizes (180 for iOS, 192 and 512, plus a maskable 512 with the art inside the safe zone) and `docs/brand/logo-sheet.png`, which shows the mark at 512 to 16 px on white, canvas and navy. It appears in the Home header (no tile, on navy), the onboarding welcome and the loading splash (lighter navy tile on navy).

## Visual reference

The data model, indexes and migration rules are described in `docs/DATA_MODEL.md`. Reference screenshots of every screen live in `docs/screenshots/` and are indexed in `docs/DESIGN_REFERENCE.md`. Regenerate them with `npm run screenshots` while the dev server is running.

## Free vs Premium

Free tracks up to 10 non-cancelled subscriptions and includes the dashboard, calendar, price history, notes and basic insights. Premium removes the cap and unlocks the 12-month projection, price-increase impact and unused-subscription detector. Activation in this build is recorded locally; payment collection is expected to run through the app store when shipped.
