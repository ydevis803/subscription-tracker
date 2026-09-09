# Data model

Two stores hold the same records: IndexedDB in the browser (Dexie, one database per account plus one for guests) and SQLite on the server (one row per record, keyed by owner). The browser copy is the working set; the server copy is the backup that sign-in restores.

## Ownership

Every private record carries `ownerId` (browser) / `user_id` (server). Guests use `ownerId: null` inside the guest database. Accounts get their own browser database (`subscription-tracker-u<id>`), which is deleted on sign-out, and rows on the server are always scoped by `user_id`. Deleting a user on the server cascades to sessions, reset tokens, profile, settings, subscriptions and, through subscriptions, to price changes and notes.

## Entities

| Entity | Browser table | Server table | Parent | Purpose |
| --- | --- | --- | --- | --- |
| Subscription | `subscriptions` | `subscriptions` | user | One recurring charge: name, category, amount, currency, billing cycle, next renewal, start date, status, payment method label, website, notes, trial end, cancelled date, reminder override, `renewalEstimated`, `createdAt`, `updatedAt` |
| PriceChange | `priceChanges` | `price_changes` | subscription | previous and new amount, effective date, note, `createdAt`, `updatedAt` |
| CancellationNote | `cancellationNotes` | `cancellation_notes` | subscription | reason, content, remind-on date, open/done, `createdAt`, `updatedAt` |
| BillingEvent | `billingEvents` | `billing_events` | user | Premium plan upgrades, downgrades, interval changes |
| Profile | `profile` (singleton id 1) | `user_profiles` | user | name, email, currency, goal, onboarding flag and answers, plan tier, Premium interval and dates, `createdAt`, `updatedAt` |
| Settings | `settings` (singleton id 1) | `user_settings` | user | reminder default, monthly budget, notification toggles, display options, `createdAt`, `updatedAt` |
| Category | `categories` | (static) | none | Ten fixed spending categories with colours |
| User | (not stored) | `users` | none | email, name, scrypt password hash |
| Session / PasswordReset | (cookie only) | `sessions`, `password_resets` | user | hashed tokens with expiry |

## Indexes and why they exist

Browser (Dexie schema v2):

- `subscriptions`: `[status+nextRenewalDate]` for the list filter and the calendar/upcoming queries; `[categoryId+status]` for category filtering and spending insights; single-field indexes on `ownerId`, `status`, `categoryId`, `nextRenewalDate`, `billingCycle`, `name`.
- `priceChanges`: `[subscriptionId+effectiveDate]` so a subscription's history reads in date order without sorting; `effectiveDate` for the global history screen.
- `cancellationNotes`: `[subscriptionId+status]` for a subscription's open notes; `[status+remindOn]` for dashboard reminders.
- `billingEvents`: `occurredAt`.

Server (SQLite):

- `subscriptions(user_id, status, next_renewal_date)`, `price_changes(user_id, subscription_id, effective_date)`, `cancellation_notes(user_id, status, remind_on)`, `sessions(user_id)`.
- Composite primary keys `(user_id, id)` keep the browser's record ids stable across devices without collisions between users.

## Migrations

- Browser: Dexie version 2 upgrades in place. It stamps `ownerId` from the database name, fills missing timestamps, and deletes any price change or note whose subscription no longer exists. Version 1 stores are kept, nothing is renamed.
- Server: the v1 `user_data` JSON blob table is kept. On startup, each un-migrated blob is written into the v2 tables and marked with `migrated_at`. `GET /api/data` and `PUT /api/data` keep the same request and response shapes, so older clients keep working.

## Integrity rules

- `deleteSubscription` removes its price changes and notes in one transaction. On the server the same happens through `ON DELETE CASCADE`.
- `addPriceChange` and `addNote` refuse to create a child for a subscription that does not exist.
- A snapshot push replaces the account's rows atomically and drops any child whose parent is not in the snapshot.
- `GET /api/data/integrity` returns the row counts an account owns and its orphan count (always 0 by construction). `auditIntegrity()` in `src/db/repo.ts` does the same for the active browser database.
