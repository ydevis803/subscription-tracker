import type { AnalyticsEvent } from '@/lib/analytics'

/**
 * The single first-week experiment. One hypothesis, one change, one success metric, one guardrail, so the
 * result can be read without untangling several changes at once. Aimed at the drop-off that new habit apps
 * lose most users to: the day after first use.
 */
export interface Experiment {
  id: string
  name: string
  targetDropOff: { from: AnalyticsEvent; to: AnalyticsEvent; label: string }
  hypothesis: string
  change: string
  notChanging: string
  successMetric: { label: string; numerator: AnalyticsEvent; denominator: AnalyticsEvent; baselineNote: string; target: string }
  guardrail: { label: string; numerator: AnalyticsEvent; denominator: AnalyticsEvent; rule: string }
  duration: string
  decision: string
}

export const FIRST_WEEK_EXPERIMENT: Experiment = {
  id: 'tomorrow-card-on-first-win',
  name: 'Tomorrow card on the first-win screen',
  targetDropOff: { from: 'onboarding_completed', to: 'day_two_return', label: 'Completed onboarding → returned on day two' },
  hypothesis: 'New users leave after the first win because nothing tells them what tomorrow is for. If the first-win screen names one concrete task for tomorrow (“Tomorrow: your first renewal check, about a minute”) and lets them pick a reminder time in one tap, more of them will come back the next day.',
  change: 'Add a single “Tomorrow” card to the first-win screen with the Day 2 task and a one-tap reminder time (default 09:00). Nothing else on the screen moves.',
  notChanging: 'Onboarding steps, the Home layout, the seven-day challenge copy, reminder defaults for existing users, and Premium placement all stay exactly as they are during the test.',
  successMetric: { label: 'Day-two return rate', numerator: 'day_two_return', denominator: 'onboarding_completed', baselineNote: 'Read the rate for the seven days before the change from this dashboard; that is the baseline.', target: 'At least 10 percentage points higher than the baseline over one week, with at least 50 completed onboardings in each period.' },
  guardrail: { label: 'Onboarding completion rate', numerator: 'onboarding_completed', denominator: 'onboarding_started', rule: 'Must not fall by more than 3 percentage points; if it does, the card is costing more than it earns and the change is reverted.' },
  duration: 'Seven full days, starting on a Monday so both periods cover the same weekdays.',
  decision: 'Keep the card if the success metric meets its target and the guardrail holds. Otherwise revert it and test the next single change: moving the reminder-time choice into onboarding itself.',
}
