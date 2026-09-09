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

## Visual reference

The data model, indexes and migration rules are described in `docs/DATA_MODEL.md`. Reference screenshots of every screen live in `docs/screenshots/` and are indexed in `docs/DESIGN_REFERENCE.md`. Regenerate them with `npm run screenshots` while the dev server is running.

## Free vs Premium

Free tracks up to 10 non-cancelled subscriptions and includes the dashboard, calendar, price history, notes and basic insights. Premium removes the cap and unlocks the 12-month projection, price-increase impact and unused-subscription detector. Activation in this build is recorded locally; payment collection is expected to run through the app store when shipped.
