# Subscription Tracker – visual reference

These screenshots are the source of truth for how every screen should look. Compare against them after any UI change. Regenerate with the dev server running:

```bash
npm run screenshots
```

The script (`scripts/screenshots.mjs`) drives the installed Google Chrome through `playwright-core` in a fresh profile, so it never touches real user data. Captures are 375×812 at 2x; full pages are rendered at their natural height so the bottom navigation sits at the real bottom.

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
| 06-home-dashboard | Navy hero with monthly total and budget bar, upcoming-window stats, milestone card when newly earned, Today card (next action, week check-ins, wins, streak, fresh reward), check card, Your week entry, Continue card, decision alerts, upcoming renewals, category snapshot |
| 07-check-review-item | Renewal check: progress "1 of N" with saved cue, one renewal card, mint Keep it plus Remind me and Cancel it |
| 08-check-complete | Renewal check completion: animated mint check, "all clear for 30 days", monthly total now, kept/reminders/cancelled |
| 09-home-all-clear | Home after a completed check: all-clear Today card, and the invite card offered only after this positive moment (hidden while over budget or with other problems) |
| 10-invite | Invite a friend: navy hero, generated personal invitation with the app link, Include my numbers toggle, Share / Copy link / Copy text with copied feedback, cosmetic badge progress |
| 11-monthly-total | Monthly total screen: navy hero with a-year/a-day figures and change vs last month, "How this number is made" rules and per-subscription shares, limit field with specific validation, suggested limit and limit history, six-month trend |
| 12-weekly-summary | Weekly summary: labeled week range with This/Last week toggle, three numbered insights (actions by day strip, monthly total start vs now, recommended next action with why) |
| 13-subscriptions-list | Search, status chips, Filters panel toggle and Sort select, results bar, rows, floating add button |
| 14-subscription-add-form | Grouped form cards, name suggestions from the service catalogue, segmented controls, sticky submit |
| 15-subscription-detail | Amount hero, renewal banner (shows "Estimated date" for setup picks), stats, pause/mark paid, notes, price history, details, cancel/delete |
| 16-subscription-edit-form-price-change | Edit form with the coral price-change notice and reason field |
| 17-sheet-cancellation-note | Bottom sheet: reason, note, remind-on date |
| 18-sheet-log-price-change | Bottom sheet: new price, effective date, reason |
| 19-sheet-confirm-cancel | Confirmation sheet, coral confirm |
| 20-renewal-calendar | Search and filters, month grid (tap a day for its sheet, swipe to change month) with dots and day totals, settled card when nothing remains, category totals bar, timeline with inline notes |
| 21-calendar-day-sheet | Calendar day sheet: that day's charges and total, Mark as paid / Open for charges due today, "Add a subscription renewing this day" |
| 22-calendar-month-settled | Calendar completion state: "<Month> is settled" with what went out and what is next, See next month / Open timeline; past days shown paid |
| 23-timeline-first-visit | Renewal timeline on first visit: navy explanation card, horizon slider (7 to 90 days) with animated total, category totals, running-total rows, Add to calendar / Copy summary bar |
| 24-timeline-category-highlight | Timeline with one category highlighted: total switches to that category, other charges dim, Show all link |
| 25-timeline-row-actions | Timeline row expanded: Add note and Open actions |
| 26-insights-free | Highlights (plain-language observations), filters for the monthly total, donut, category bars, billing mix, "Price changes" entry card, biggest items, locked Premium cards; an off state with "Turn on insights" when the Settings toggle is off |
| 27-price-history | Header + to log a change (subscription picker then price sheet), search, direction chips and sort, price drift summary, change rows with percentage badges; empty state offers to log a change |
| 28-cancellation-notes | Progress card (decisions made of total, freed per month, next milestone), Next up card with Keep / Cancel / Snooze, all-decided state, search and reason chips, open notes with Done / cancel / snooze / delete |
| 29-profile | Avatar, plan badge, stats, save-progress or account card, upgrade card, links |
| 30-sheet-edit-profile | Name and email sheet |
| 31-settings | Money, reminders, display, data sections (Account section when signed in) |
| 32-reminders | Reminder preferences: next-reminder/paused card with time zone, day chips and presets, time field, pause with resume-by date, honest delivery methods (in-app always on, browser notification while open, push and email not available) |
| 33-premium-plans | Plan page for a free user: outcome hero with prices, three data-driven benefits, yearly/monthly with yearly value, Try Premium free for 7 days, Start Premium, Restore purchase, Keep the free plan |
| 34-sheet-premium-confirm | Plan confirmation sheet |
| 35-home-trial-day | Home during the seven-day trial: trial card with day N of 7, start and end dates, progress bar, Manage, and today's personalised Premium win |
| 36-premium-trial | Plan page during the trial: hero with day count, Your trial card (started, ends with last day included, included benefits, End trial now), benefits, Keep Premium plans |
| 37-home-trial-ended | Home after the trial ends: one-time card saying nothing was removed, Keep Premium / Stay on free |
| 38-sheet-account-explainer | Friendly explanation shown before creating an account |
| 39-auth-sign-up | Create account: name, email, password with show toggle |
| 40-auth-sign-in | Sign in with forgot-password link |
| 41-auth-forgot-password | Request a reset link |
| 42-auth-reset-link-missing | Reset page opened without a valid link |
| 43-profile-signed-in | Profile with account card: email, sync status, change password, sign out |
| 44-subscriptions-list-limit-reached | Ten tracked, "Free limit reached" banner |
| 45-sheet-paywall | Paywall sheet shown when adding past the free limit |
| 46-premium-activated | Success state after activation |
| 47-insights-premium | Unlocked 12-month projection, price-increase impact, possible savings |
| 48-premium-manage | Active plan card, billing history, end Premium |
| 49-profile-premium | Profile with Premium badge |
| 50-sheet-confirm-erase | Erase-all confirmation |
| 51-home-empty | Dashboard with no subscriptions ("Nothing renews in the next 30 days") |
| 52-subscriptions-empty | List empty state |
| 53-calendar-empty | Calendar empty state |
| 54-insights-empty | Insights empty state |
| 55-notes-empty | Notes zero state: "Decide before it renews" explanation plus "Start with what renews soonest" suggestions with Add note |
| 56-price-history-empty | Price history empty state |
| 57-settings-empty-with-load-samples | Settings showing the "Load sample subscriptions" row |
| 58-not-found | Unknown route |
