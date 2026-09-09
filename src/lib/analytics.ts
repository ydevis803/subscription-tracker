import { db } from '@/db/schema'
import { todayISO, toISO } from '@/lib/dates'

/**
 * Owner-only, count-only analytics. Six milestones, each sent at most once per profile, as `{ event, day }`
 * and nothing else: no identifier, no account, no amounts, no names. The server only increments a counter
 * per event per day. Sent flags live in settings.analyticsSent so a milestone can never be counted twice,
 * even across devices for the same account.
 */
export const ANALYTICS_EVENTS = ['onboarding_started', 'onboarding_completed', 'first_core_action', 'day_two_return', 'day_seven_return', 'premium_view', 'premium_conversion'] as const
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

export const EVENT_LABELS: Record<AnalyticsEvent, { title: string; when: string }> = {
  onboarding_started: { title: 'Onboarding started', when: 'The welcome screen is shown for the first time on a new profile.' },
  onboarding_completed: { title: 'Onboarding completed', when: 'The dashboard opens for the first time after the four-screen setup.' },
  first_core_action: { title: 'First core action', when: 'The first renewal check reaches all clear.' },
  day_two_return: { title: 'Day-two return', when: 'The app is opened on the calendar day after the profile was created.' },
  day_seven_return: { title: 'Day-seven return', when: 'The app is opened six or seven days after the profile was created.' },
  premium_view: { title: 'Premium viewed', when: 'The plan screen is opened for the first time.' },
  premium_conversion: { title: 'Premium conversion', when: 'A trial is started or a plan is activated for the first time.' },
}

const QUEUE_KEY = 'subscription-tracker.analytics-queue'

function readQueue(): { event: AnalyticsEvent; day: string }[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as { event: AnalyticsEvent; day: string }[]
  } catch {
    return []
  }
}
function writeQueue(q: { event: AnalyticsEvent; day: string }[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    // ignore
  }
}

async function send(event: AnalyticsEvent, day: string): Promise<boolean> {
  try {
    const res = await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, day }), credentials: 'omit', keepalive: true })
    return res.ok
  } catch {
    return false
  }
}

/** Retry anything that could not be sent earlier (offline). Safe to call often. */
export async function flushAnalytics(): Promise<void> {
  const q = readQueue()
  if (!q.length) return
  const remaining: typeof q = []
  for (const item of q) if (!(await send(item.event, item.day))) remaining.push(item)
  writeQueue(remaining)
}

/**
 * Record a milestone once. Returns true when it was sent (or queued) for the first time, false when it had
 * already been counted for this profile.
 */
export async function track(event: AnalyticsEvent): Promise<boolean> {
  let fresh = false
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(1)
    if (!s) return
    const sent = s.analyticsSent ?? {}
    if (sent[event]) return
    fresh = true
    await db.settings.update(1, { analyticsSent: { ...sent, [event]: new Date().toISOString() } })
  })
  if (!fresh) return false
  const day = todayISO()
  if (!(await send(event, day))) writeQueue([...readQueue(), { event, day }])
  void flushAnalytics()
  return true
}

/** Days since the profile was created, in local calendar days (0 on the first day). */
export function dayIndex(createdAtISO: string): number {
  const first = toISO(new Date(createdAtISO))
  const a = new Date(first + 'T00:00:00')
  const b = new Date(todayISO() + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Called on each dashboard visit: fires the return milestones when today is the right day. */
export async function trackReturn(createdAtISO: string): Promise<void> {
  const d = dayIndex(createdAtISO)
  if (d === 1) await track('day_two_return')
  if (d === 6 || d === 7) await track('day_seven_return')
}
