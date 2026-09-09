# Subscription Tracker

See every recurring charge before it quietly renews.

A mobile-first web app for people who want control of their monthly digital spending. Data is stored locally on the device (IndexedDB), so it works offline and needs no account.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 on a phone-sized viewport. `npm run build` produces a production bundle in `dist/`.

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

## Mobile audit

`npm run audit:mobile` (dev server running) opens every screen and sheet at 320 and 360 px in a fresh browser context and reports horizontal overflow, clipped text, controls under 44 px, content hidden behind fixed bars, sheets that do not fit, and inputs a keyboard-height viewport would hide. Shared controls (buttons, chips, text links, segmented tabs, icon buttons) are at least 44 px tall; calendar day cells are 40 px wide at 320 px because seven columns must fit, and 56 px tall.

## Accessibility

`npm run audit:a11y` (dev server running) runs axe-core (WCAG 2.1 A/AA and best practice) on every screen and sheet, tabs through each page to confirm a visible focus style, submits an empty form to confirm errors are linked to their fields and announced, and loads Home with reduced motion to confirm no animation runs. Conventions: every icon-only control has an `aria-label`; field messages are linked with `aria-describedby` and use `role="alert"`; status is always text or an icon as well as colour (badges, alerts, progress bars carry labels and values); the focus ring is a 3px mint outline; font sizes are in rem so browser text scaling applies; `text-faint` (#5F6F86) and `coral-700` (#B03A2B) meet 4.5:1 on white and the tinted surfaces; service marks pick white or navy initials by contrast.

## Visual reference

The data model, indexes and migration rules are described in `docs/DATA_MODEL.md`. Reference screenshots of every screen live in `docs/screenshots/` and are indexed in `docs/DESIGN_REFERENCE.md`. Regenerate them with `npm run screenshots` while the dev server is running.

## Free vs Premium

Free tracks up to 10 non-cancelled subscriptions and includes the dashboard, calendar, price history, notes and basic insights. Premium removes the cap and unlocks the 12-month projection, price-increase impact and unused-subscription detector. Activation in this build is recorded locally; payment collection is expected to run through the app store when shipped.
