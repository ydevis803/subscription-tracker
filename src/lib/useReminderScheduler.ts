import { useEffect } from 'react'
import { useSettings, useSubscriptions } from '@/hooks/useData'
import { nextReminder, scheduleOf } from '@/lib/reminders'
import { formatMoney, monthlyEquivalent } from '@/lib/money'
import { daysFromToday, renewalsInRange, todayISO } from '@/lib/dates'

/**
 * Fires a browser notification at the next reminder moment, but only while this tab is open and only
 * when the user turned notifications on and the browser granted permission. Nothing runs in the background.
 */
export function useReminderScheduler() {
  const settings = useSettings()
  const subs = useSubscriptions()
  useEffect(() => {
    if (!settings || !subs) return
    const s = scheduleOf(settings)
    if (!s.browserNotifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const next = nextReminder(s)
    if (!next) return
    const delay = Math.min(next.getTime() - Date.now(), 2_147_000_000)
    if (delay < 0) return
    const timer = window.setTimeout(() => {
      const upcoming = renewalsInRange(subs, todayISO(), daysFromToday(7))
      const currency = subs[0]?.currency ?? 'USD'
      try {
        new Notification('Time to check your renewals', {
          body: `${upcoming.length} ${upcoming.length === 1 ? 'renewal' : 'renewals'} in the next 7 days · monthly total ${formatMoney(monthlyEquivalent(subs), currency)}`,
          tag: 'subscription-tracker-reminder',
        })
      } catch {
        // notifications are best-effort
      }
    }, delay)
    return () => window.clearTimeout(timer)
  }, [settings, subs])
}
