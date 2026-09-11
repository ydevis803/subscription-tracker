import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { Subscription } from '@/db/schema'
import { isPaused, type ReminderSchedule } from '@/lib/reminders'
import { formatMoney, monthlyEquivalent } from '@/lib/money'
import { daysFromToday, renewalsInRange, toISO, todayISO } from '@/lib/dates'
import { addDays } from 'date-fns'

/**
 * Native delivery for the existing reminder schedule, used only inside the iOS shell. The web app keeps its
 * in-tab browser notification; here the same schedule is handed to iOS as local notifications so they fire
 * at the chosen time even when the app is closed. Nothing else changes: same days, same time, same pause
 * rules, same settings flag (browserNotifications) meaning "notify me".
 */
export type NativePermission = 'default' | 'granted' | 'denied'

const ID_BASE = 41000
/** How far ahead we book reminders. iOS keeps at most 64 pending notifications per app; 6 weeks × 7 days = 42. */
const WEEKS_AHEAD = 6

export async function nativePermission(): Promise<NativePermission> {
  try {
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default'
  } catch {
    return 'denied'
  }
}

export async function requestNativePermission(): Promise<NativePermission> {
  try {
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default'
  } catch {
    return 'denied'
  }
}

/** Every reminder moment in the next WEEKS_AHEAD weeks, honouring the pause and pause-until rules day by day. */
export function upcomingReminderMoments(s: ReminderSchedule, now = new Date()): Date[] {
  if (s.days.length === 0) return []
  const [h, m] = s.time.split(':').map(Number)
  const out: Date[] = []
  for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
    const d = addDays(now, i)
    if (!s.days.includes(d.getDay())) continue
    if (isPaused(s, toISO(d))) continue
    const at = new Date(d)
    at.setHours(h, m, 0, 0)
    if (at.getTime() <= now.getTime()) continue
    out.push(at)
  }
  return out
}

async function cancelAll(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending()
  const ours = notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 1000)
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
}

/**
 * Replace whatever is booked with the current schedule. Safe to call often (on every settings or data change
 * and whenever the app returns to the foreground); it is idempotent.
 */
export async function syncNativeReminders(s: ReminderSchedule, subs: Subscription[]): Promise<number> {
  try {
    await cancelAll()
    if (!s.browserNotifications || (await nativePermission()) !== 'granted') return 0
    const moments = upcomingReminderMoments(s)
    if (!moments.length) return 0
    const upcoming = renewalsInRange(subs, todayISO(), daysFromToday(7))
    const currency = subs[0]?.currency ?? 'USD'
    const body = `${upcoming.length} ${upcoming.length === 1 ? 'renewal' : 'renewals'} in the next 7 days · monthly total ${formatMoney(monthlyEquivalent(subs), currency)}`
    const notifications: LocalNotificationSchema[] = moments.map((at, i) => ({
      id: ID_BASE + i,
      title: 'Time to check your renewals',
      body,
      schedule: { at, allowWhileIdle: true },
      extra: { route: '/check' },
    }))
    await LocalNotifications.schedule({ notifications })
    return notifications.length
  } catch {
    return 0
  }
}

/** Opens the route carried by a tapped notification. Returns the unsubscribe function. */
export function onNativeNotificationTap(handler: (route: string) => void): () => void {
  const sub = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const route = (e.notification.extra as { route?: string } | undefined)?.route
    if (route) handler(route)
  })
  return () => {
    void sub.then((h) => h.remove())
  }
}
