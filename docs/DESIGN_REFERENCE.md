# Subscription Tracker – visual reference

These screenshots are the source of truth for how every screen should look. Compare against them after any UI change. Regenerate with the dev server running:

```bash
npm run screenshots
```

The script (`scripts/screenshots.mjs`) drives the installed Google Chrome through `playwright-core` in a fresh profile, so it never touches real user data. Captures are 375×812 at 2x; full pages are rendered at their natural height so the bottom navigation sits at the real bottom.

## Logo

See `docs/brand/logo-sheet.png` for the mark at every size on light and dark. Navy tile #0B1F3A (rx 30/128), mint receipt #2DD4BF with three navy line items, coral renewal dot #FF6B5B ringed in navy. Never add text to the mark; never thin the shapes.

## Design rules the screenshots encode

- Navy (`#0B1F3A`) for headers, primary buttons and the bottom nav active state. Mint (`#2DD4BF`) for positive money, confirmations and the main call to action on onboarding and Premium. Coral (`#FF6B5B`) only for urgency: renewals within 3 days, price increases, cancellation notes, destructive actions.
- Onboarding is four screens, never more: welcome, two preference questions, first win. Progress bar and Back on every step after the welcome; answers survive Back and a reload.
- Accounts stay out of the way: guests use everything locally; the account explainer sheet always precedes sign-up, and only Premium activation requires an account.
- Collections (list, calendar, insights, price history, notes) share one filter toolkit (`src/components/app/Filters.tsx`): search field with clear, wrapping chips (single or multi), a `Sort:` select, a collapsible `Filters` panel with an active count, a `Showing X of Y` results bar with a coral one-tap `Clear filters`, and a filtered empty state that names the active search and filters. Views are remembered for the browser session.
- The core journey is the renewal check (`/check`): Home shows one card in three states (Start check, Resume with progress, All clear for 7 days). Each renewal gets one screen with a mint Keep it and secondary Remind me / Cancel it; every decision is saved immediately, Previous lets you change one, and completion shows an animated check with the monthly total.
- The signature experience is the rolling renewal timeline (`/timeline`, entry card on Home and link from the Calendar): a horizon slider, category totals you tap to highlight, running totals per row, notes added in place, and a bottom bar with Add to calendar (.ics with reminders) and Copy summary. A one-time explanation card is reopenable from the info button.
- The monthly total is explained on `/total` (tap the hero on Home): active and trial plans converted to a monthly share (yearly ÷ 12, quarterly ÷ 3, weekly × 52 ÷ 12), paused and cancelled excluded; the limit has specific validation, a suggested value and a stored change history; the six-month trend is derived from start dates, cancellations and price changes.
- Cancellation notes show visible progress (decisions made, money freed per month from cancelled noted plans, next milestone at 1/3/5/10/20/50 decisions and $10/25/50/100/250 freed), a Next up card that loops through the most urgent note with Keep / Cancel / Snooze, and an all-decided state that suggests the next renewal to note.
- Spending insights are connected everywhere: Home shows the top headline under "Where it goes", Profile has a "Spending insights" link with the monthly figure and top category, and Settings → Display has a "Spending insights" toggle whose off state hides the Home section and replaces the Insights tab with a reversible "Turn on insights" card.
- Recent history and resume: `settings.recentActivity` keeps up to 12 positions (renewal checks in progress or completed, timeline views, calendar months, monthly-limit changes). Home shows a "Pick up where you left off" card (the newest saved view or completed check; an in-progress check stays on its own card) with a History sheet where each item has an × that only removes the entry. Positions restore through query strings: `/timeline?h=60&cat=music`, `/calendar?month=2026-10`, `/check?id=12`.
- Daily loop: the Today card on Home picks exactly one next action by priority (resume check → due decisions → renewal inside the heads-up window → check the next 30 days → confirm estimated dates → all clear), records a check-in per day (`settings.checkIns`, gaps allowed, never a penalty), counts today's wins from timestamps, and rotates one reward from a pool (insights, milestones, recommendations) by day. After a gap it summarises what happened since the last visit.
- Streak: a day counts once when it holds a meaningful action (check decision, note decision, subscription add/edit/pause/cancel, mark as paid, price change, limit change), derived from timestamps in local time; one single-day grace per run (coral-ringed dot, "Missed yesterday… safe this once"); best streak stored in `settings.bestStreak` and only ever raised; the info sheet lists exactly what counts and what does not.
- One clearly dominant action per screen: sticky submit on forms, floating "Add subscription" on the list, mint "Start Premium", dark "+" on Notes.
- 44px minimum tap targets. Round icon buttons, filter chips, text links and the floating button come from `src/components/ui/Button.tsx`; cards, badges, empty and error states from `src/components/ui/Primitives.tsx`.
- Text wraps; nothing is truncated with an ellipsis. Filter chips wrap to a second row instead of scrolling sideways. No horizontal scrolling at 320px.
- Amounts use tabular figures. Category color shows on service marks, calendar dots and charts.

## Index

| File | Screen / state |
| --- | --- |
| 01-onboarding-welcome | Navy outcome-led welcome, progress 1/4, mint "Show me my total" |
| 02-onboarding-services | Question 1: which services you pay for, currency picker, typical prices, running total |
| 03-onboarding-limit-and-headsup | Question 2: monthly limit pills or custom amount, heads-up window (1/3/7/14 days) |
| 04-onboarding-first-win | Personalized first win: monthly total vs limit, next charge, picked services with estimated dates |
| 05-onboarding-first-win-no-picks | First win when nothing was picked: limit and heads-up recap, add first subscription or explore samples |
| 06-home-dashboard | Navy hero with monthly total and budget bar, upcoming-window stats, milestone card when newly earned, Today card (next action, week check-ins, wins, streak, fresh reward), check card, Your week entry, Continue card, decision alerts, upcoming renewals, category snapshot (includes the seven-day starter card at Day 1) |
| 07-check-review-item | Renewal check: progress "1 of N" with saved cue, one renewal card, mint Keep it plus Remind me and Cancel it |
| 08-check-complete | Renewal check completion: animated mint check, "all clear for 30 days", monthly total now, kept/reminders/cancelled |
| 09-home-all-clear | Home after a completed check: all-clear Today card, and the invite card offered only after this positive moment (hidden while over budget or with other problems) |
| 10-home-challenge-days | Seven-day starter card expanded: seven progress dots, last win, current day task with minutes and CTA, the full day list (done / current / locked), never-expire note and Hide |
| 11-home-rating-prompt | Home rating prompt after a repeat success: five large star targets, visible frequency cap, Not now; inline, never blocking |
| 12-sheet-feedback-private | Low score: private feedback sheet with the note field, privacy line, Send privately and Not now |
| 13-sheet-rating-store | High score: App Store rating placeholder sheet (coming soon) with Maybe later |
| 14-invite | invite |
| 15-monthly-total | monthly-total |
| 16-weekly-summary | weekly-summary |
| 17-subscriptions-list | subscriptions-list |
| 18-subscription-add-form | subscription-add-form |
| 19-subscription-detail | subscription-detail |
| 20-subscription-edit-form-price-change | subscription-edit-form-price-change |
| 21-sheet-cancellation-note | sheet-cancellation-note |
| 22-sheet-log-price-change | sheet-log-price-change |
| 23-sheet-confirm-cancel | sheet-confirm-cancel |
| 24-renewal-calendar | renewal-calendar |
| 25-calendar-day-sheet | calendar-day-sheet |
| 26-calendar-month-settled | calendar-month-settled |
| 27-timeline-first-visit | timeline-first-visit |
| 28-timeline-category-highlight | timeline-category-highlight |
| 29-timeline-row-actions | timeline-row-actions |
| 30-insights-free | insights-free |
| 31-price-history | price-history |
| 32-cancellation-notes | cancellation-notes |
| 33-profile | profile |
| 34-sheet-edit-profile | sheet-edit-profile |
| 35-settings | settings |
| 36-reminders | reminders |
| 37-premium-plans | premium-plans |
| 38-sheet-premium-confirm | sheet-premium-confirm |
| 39-home-trial-day | home-trial-day |
| 40-premium-trial | premium-trial |
| 41-home-trial-ended | home-trial-ended |
| 42-sheet-account-explainer | sheet-account-explainer |
| 43-auth-sign-up | auth-sign-up |
| 44-auth-sign-in | auth-sign-in |
| 45-auth-forgot-password | auth-forgot-password |
| 46-auth-reset-link-missing | auth-reset-link-missing |
| 47-profile-signed-in | profile-signed-in |
| 48-subscriptions-list-limit-reached | subscriptions-list-limit-reached |
| 49-sheet-paywall | sheet-paywall |
| 50-premium-activated | premium-activated |
| 51-insights-premium | insights-premium |
| 52-premium-manage | premium-manage |
| 53-profile-premium | profile-premium |
| 54-sheet-confirm-erase | sheet-confirm-erase |
| 55-home-empty | home-empty |
| 56-subscriptions-empty | subscriptions-empty |
| 57-calendar-empty | calendar-empty |
| 58-insights-empty | insights-empty |
| 59-notes-empty | notes-empty |
| 60-price-history-empty | price-history-empty |
| 61-settings-empty-with-load-samples | settings-empty-with-load-samples |
| 62-legal-privacy | Privacy Policy: effective date, who we are (placeholder owner), short version, data types, purposes, storage, retention, deletion steps, rights, contact block |
| 63-legal-terms | Terms of Use: ten numbered sections including not-financial-advice, accounts, Free vs Premium pricing, governing law placeholder, contact block |
| 64-support | Support: expandable FAQ, self-service buttons (backup, reminders, private feedback), email a person with version line, legal links, contact block |
| 65-delete-account | Delete account: coral warning card, what gets deleted with live counts, before-you-go steps, numbered steps, primary destructive action, cannot-sign-in route |
| 66-sheet-delete-confirm | Delete confirmation sheet: explicit no-undo copy, password confirm for an account or Erase all data / Keep it for device data |
| 67-not-found | not-found |
