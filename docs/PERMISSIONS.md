# Permissions

Subscription Tracker has exactly two kinds of caller: a **guest** (no account, data stays in the browser) and a **signed-in account**. There is no admin role, no sharing, and no public content derived from anyone's records. Every personal record belongs to exactly one owner, and the owner is always taken from the session, never from the request body.

Run `node scripts/permissions-test.mjs` against the dev server to check every rule below.

## Why there is no admin role

Nothing in the product needs one. There is no moderation, no shared content, no support console and no cross-account report. Adding an admin role would create a way to read other people's financial records that the product itself never uses, so the API has no admin routes at all; anything under `/api/admin` is a plain 404. Operational tasks (backups, migrations) are done on the server host with the SQLite file, outside the API, and are documented in the README.

## Identity

| What | Where | Rule |
| --- | --- | --- |
| Session | `sessions` table, `st_session` cookie | Cookie holds a random 256-bit token; only its SHA-256 is stored. `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=1` (required in production). 30-day expiry; expired rows purged on startup. Sign-out deletes the row, so the old cookie is useless. Changing the password revokes every other session. |
| Password | `users.password_hash` | scrypt with a per-user salt. Never returned by any endpoint (`publicUser` exposes id, email, name, createdAt only). |
| Reset token | `password_resets` | Random 256-bit token, hashed at rest, one hour, single use; sent to the account email only. Forgot-password answers `ok` whether or not the email exists. |
| Owner id | `user_id` on every data row | Set from the session on every write. An `ownerId` inside a payload is ignored and overwritten. |

## Entities

"Owner" means the signed-in account whose session made the request. Guests have no server rows at all.

| Entity | Storage | Read | Create / update / delete | Public? |
| --- | --- | --- | --- | --- |
| `users` (email, name, password hash) | SQLite | Owner only, via `GET /api/auth/me` (no hash). | Owner only: `PATCH /api/auth/me` (name), `POST /api/auth/change-password`, `DELETE /api/auth/me` (password required, rate limited). Deleting cascades to every row below. | No |
| `sessions` | SQLite | Never exposed. | Created on sign-up / sign-in / reset; destroyed on sign-out, password change, account deletion. | No |
| `password_resets` | SQLite | Never exposed. | Created by forgot-password, consumed once by reset. | No |
| `subscriptions` | SQLite `(user_id, id)` | Owner only, inside `GET /api/data`. | Owner only, as part of `PUT /api/data`; the whole set is replaced atomically for that owner. | No |
| `price_changes` | SQLite, child of a subscription of the same owner (composite foreign key) | Owner only. | Owner only; a change whose parent is not in the same snapshot is dropped, never orphaned. | No |
| `cancellation_notes` | SQLite, child of a subscription of the same owner | Owner only. | Owner only, same rule as price changes. | No |
| `renewal_checks` | SQLite `(user_id, id)` | Owner only. | Owner only. | No |
| `billing_events` (Premium history) | SQLite `(user_id, id)` | Owner only. | Owner only. Premium is recorded locally in this build; there is no payment processor and no entitlement anyone else can read. | No |
| `user_profiles` (name, currency, goal, plan, trial dates) | SQLite JSON per owner | Owner only. | Owner only. | No |
| `user_settings` (limits, reminders, streaks, milestones, challenge, invites, **private feedback notes**, rating prompt) | SQLite JSON per owner | Owner only. | Owner only. Feedback notes are never surfaced anywhere but the author's own device and account. | No |
| Integrity counts | `GET /api/data/integrity` | Owner's own row counts only. | n/a | No |
| Local guest database (`subscription-tracker` in IndexedDB) | Browser | Whoever can use that browser profile. | Same. Merged into the account or dropped, at the user's choice, on first sign-in. | No |
| Local account database (`subscription-tracker-u<id>`) | Browser | Whoever can use that browser profile while signed in. Deleted from the device on sign-out, and on the next launch if the server says the session is gone. | Same | No |
| Drafts (`subscription-tracker.draft:*` in localStorage) | Browser | Same device only. Never contain passwords. Removed on save or discard, expire after seven days. | Same | No |
| Cached account identity (id, email, name in localStorage) | Browser | Same device; lets the app open the right local database while offline. Cleared on sign-out. | Same | No |
| Reset emails in `server/outbox/` | Server disk (development mailer only) | Server operator. Never served over HTTP and git-ignored. Use a real mailer (`MAILER`) in production. | n/a | No |

## Intended public surface

These are the only things reachable without a session, and each is meant to be:

| Path | Why public |
| --- | --- |
| Static app files under `dist/` (when `SERVE_STATIC=1`) | The app itself, including `index.html`, chunks, `icon.svg`, `manifest.webmanifest`. Contains no user data. Path traversal outside `dist/` is refused. |
| `GET /api/health` | Uptime probe; returns `{ ok: true }` only. |
| `POST /api/auth/sign-up`, `sign-in`, `forgot`, `reset` | Creating and recovering access. All are same-origin only, JSON only, and rate limited per IP (and per email for sign-in). Sign-up returns 409 for an existing email; everything else avoids revealing whether an email exists. |
| Onboarding, marketing copy, price list | Product copy shipped with the app; never derived from a user's records. |

Everything else under `/api/` requires a valid session and acts only on that account. Unknown `/api/` paths are 404, including `/api/admin/*` and `/api/users/*`.

## Cross-site and transport rules

* Every mutating route checks `Origin` (or `Sec-Fetch-Site`) against the request host, or `ALLOWED_ORIGIN_HOSTS` behind a proxy, and requires `Content-Type: application/json`, so a browser form or a third-party page cannot write with the user's cookie.
* All responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` and a minimal `Permissions-Policy`; API responses are `Cache-Control: no-store`.
* Bodies are capped at 1 MB.
* Run behind HTTPS with `COOKIE_SECURE=1` in production; without it the cookie is not marked `Secure`.

## Shared devices

The app is local-first, so anyone who can unlock the phone or browser profile can open whatever is stored there. That is the same trust boundary as any other app on the device. The Profile screen says so and offers Sign out, which removes the local copy of the account's data.
