# Release report · Subscription Tracker 1.0

Audit date: 9 September 2026. Audited as a first-time customer, a returning customer and the owner, on a phone viewport (375 and 320 px wide) and desktop, against the development server and a production build served the way the live site is served.

## Live URL to test

    https://subscription-tracker-production-3487.up.railway.app

Published on 10 September 2026 as a single Railway service: the API serves the production build and stores accounts in SQLite on a mounted volume at /data. Owner pages need `?key=<VITE_STORE_PREVIEW_KEY>`, for example `/__launch?key=…`; the analytics dashboard additionally asks for OWNER_KEY.

Before the public deploy, the same checks ran against a local production build at http://127.0.0.1:8791 and http://localhost:8791.

## Tested journeys

| Persona | Journey | Result |
| --- | --- | --- |
| First-time customer | Welcome → services → limit → first win → dashboard, no paywall, legal links on the welcome screen | Pass |
| First-time customer | Every bottom tab and every secondary screen (notes, history, timeline, total, week, reminders, settings, premium, invite, support, privacy, terms, delete, not-found) at 375 px: no horizontal scroll, no raw error text, intentional empty states | Pass |
| First-time customer | New subscription form: empty submit shows field errors, valid submit lands on the detail; monthly limit validation | Pass |
| First-time customer | Reminders: browser-notification permission denied is explained, delivery limits stated honestly | Pass |
| Returning customer | Reload: Today card, monthly total and streak; renewal check to all clear persists across reload and on the server | Pass |
| Returning customer | Sign-up keeps device data, sign-out returns to the public start, sign-in restores the same data | Pass |
| Returning customer | Free → 7-day trial → trial ended → Start Premium as guest (account explainer) → account → Activate Premium · $24.99 → activated → manage (End Premium) → free again; Profile badge and Insights lock/unlock follow | Pass |
| Returning customer | Backup outage: offline banner with Retry, change kept locally, pushed after recovery | Pass (journey suite) |
| Returning customer | Account deletion with password confirm; server confirms 401 afterwards, device returns to the start screen | Pass |
| Owner | Owner pages return not-found without the key on the production build; readiness, launch, listing, screenshots and analytics open with it | Pass |
| Owner | Launch checklist marks accepted only on the published origin; App Store and Google Play preparation sections validate and mask as designed | Pass |
| Owner | Milestone analytics: seven events fire once each, payload is event + day only, dashboard rates carry labelled denominators | Pass |

Automated suites on the development server: journeys 50/50 with zero raw-error hits and zero console errors; permissions 42/42; accessibility audit 0 findings; visual QA 0 findings; mobile audit at its baseline (calendar day cells 40 px wide at 320 px, by design).

## Fixes made in this audit

1. **Navigation could leave the app when a tab hit the browser's history cap.** Chrome keeps at most 50 entries per tab; at the cap `pushState` adds no real entry, so finishing onboarding (which unwinds its step entries) walked out of the app to an earlier site. Reproduced on the production build in a busy tab. Fix: the app now detects a capped history and, while capped, never uses history stepping: onboarding finishes with a plain navigation, sheets do not rely on Back to close, and the smart Back falls back to its parent route. Verified on the production build: onboarding, sheet close and Back from a detail all stay on the app's origin.
2. **Fire-and-forget requests never counted as finished.** The milestone-analytics send, the offline banner's Retry probe and the owner-page URL probes read only the response status and never drained the body, so Chrome kept each request open until garbage collection. Real users saw no symptom, but any tool waiting for the network to go idle (the accessibility audit, and potentially store review automation) stalled on the first page load. Every such call now drains its response; the audit passes at 0 findings and first load reaches network idle in under a second on both builds.

## Remaining manual store tasks (cannot be done inside the app)

Done on the live service: public https address, VITE_APP_URL, owner preview key, OWNER_KEY, contact details in the legal pages, persistent database volume.

1. Configure `SMTP_URL` (and `MAIL_FROM`) on the Railway service so password-reset emails are delivered; until then they are written to `server/outbox/` on the volume.
2. Work through `/__launch?key=…` on a signed-out phone and mark each of the 11 items after testing it live.
3. For a native store build, route Premium purchases through StoreKit / Google Play Billing or remove the Start Premium button from that build; this build records Premium locally with no payment.
4. Capture the store screenshots with `npm run store:shots`, and complete the App Store and Google Play preparation sections on `/__launch` when a native build is planned.
5. Answer the store data-safety questionnaires from the Privacy Policy's "Data types we use" section, including the seven anonymous milestone counts.
6. Optional: attach a custom domain in Railway, then update `VITE_APP_URL` and redeploy.
