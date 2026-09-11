import { useEffect, useMemo, useRef, useState } from 'react'
import { useChallengeVisit } from '@/lib/useChallengeVisit'
import { useNavigate } from 'react-router-dom'
import { updateSettings } from '@/db/repo'
import { useSettings } from '@/hooks/useData'
import { DAY_LABELS, describeDays, isPaused, nextReminder, scheduleOf, timeZoneLabel, type ReminderSchedule } from '@/lib/reminders'
import { daysFromToday, formatDate, toISO } from '@/lib/dates'
import { addDays } from 'date-fns'
import { describeError } from '@/lib/errors'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button, Chip } from '@/components/ui/Button'
import { TextField, Toggle } from '@/components/ui/Field'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Card, SectionTitle, Skeleton } from '@/components/ui/Primitives'
import { useToast } from '@/components/ui/Toast'
import { format } from 'date-fns'
import { isNativeApp } from '@/lib/native'

type Permission = 'unsupported' | 'default' | 'granted' | 'denied'
const readPermission = (): Permission => (typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as Permission))
// Inside the iOS shell the device delivers reminders (local notifications); the browser path is untouched.
const native = isNativeApp()

export default function Reminders() {
  const navigate = useNavigate()
  useChallengeVisit('reminders')
  const toast = useToast()
  const settings = useSettings()
  const schedule = useMemo(() => scheduleOf(settings), [settings])
  const [flash, setFlash] = useState<string | null>(null)
  const [permission, setPermission] = useState<Permission>(native ? 'default' : readPermission)
  useEffect(() => {
    if (!native) return
    void import('@/lib/nativeNotifications').then((m) => m.nativePermission()).then(setPermission)
  }, [])
  const lock = useRef(false)
  const tz = useMemo(() => timeZoneLabel(), [])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(t)
  }, [])

  const save = async (patch: Partial<ReminderSchedule>, label = 'Saved') => {
    if (lock.current) return
    lock.current = true
    try {
      await updateSettings({ reminderSchedule: { ...schedule, ...patch } })
      setFlash(label)
      window.setTimeout(() => setFlash(null), 1400)
    } catch (e) {
      toast.error(describeError(e, 'save your reminder settings'))
    } finally {
      lock.current = false
    }
  }

  const enableBrowser = async (on: boolean) => {
    if (native) {
      if (!on) return save({ browserNotifications: false }, 'Notifications off')
      const m = await import('@/lib/nativeNotifications')
      let p = await m.nativePermission()
      if (p === 'default') p = await m.requestNativePermission()
      setPermission(p)
      if (p === 'granted') return save({ browserNotifications: true }, 'Notifications on')
      return toast.error('Notifications are off for this app in iOS Settings. Allow them there, then try again.')
    }
    if (!on) return save({ browserNotifications: false }, 'Browser notifications off')
    if (typeof Notification === 'undefined') return toast.error('This browser does not support notifications, so we cannot turn them on.')
    let p = Notification.permission
    if (p === 'default') p = await Notification.requestPermission()
    setPermission(p as Permission)
    if (p === 'granted') return save({ browserNotifications: true }, 'Browser notifications on')
    toast.error(p === 'denied' ? 'Notifications are blocked for this site in your browser settings. Allow them there, then try again.' : 'Permission was not granted, so notifications stay off.')
  }

  const next = nextReminder(schedule, now)
  const paused = isPaused(schedule)

  return (
    <div>
      <PageHeader
        title="Reminders"
        back
        backTo="/settings"
        subtitle="A nudge to check upcoming renewals and your monthly total"
        right={
          <span className={`flex items-center gap-1 text-[0.75rem] font-semibold text-mint-700 transition-opacity ${flash ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
            <Icon name="check" size={14} /> {flash ?? 'Saved'}
          </span>
        }
      />
      <Page className="space-y-5">
        {!settings ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : (
          <>
            <Card className={`p-4 ${paused ? 'border-coral-100 bg-coral-50' : 'border-mint-100 bg-mint-50'}`}>
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">{paused ? 'Paused' : 'Next reminder'}</p>
              <p className="mt-0.5 text-[1rem] font-bold text-navy-900">
                {paused
                  ? schedule.pausedUntil
                    ? `Back ${formatDate(toISO(addDays(new Date(schedule.pausedUntil + 'T12:00:00'), 1)), 'EEE d MMM')} at ${schedule.time}`
                    : 'Until you resume them'
                  : next
                    ? `${format(next, 'EEEE d MMM')} at ${format(next, 'HH:mm')}`
                    : 'Pick at least one day'}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {describeDays(schedule.days)} · {schedule.time} · {tz}
              </p>
            </Card>

            <section>
              <SectionTitle>Days</SectionTitle>
              <Card className="p-4">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder days">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <Chip
                      key={d}
                      selected={schedule.days.includes(d)}
                      onClick={() => save({ days: schedule.days.includes(d) ? schedule.days.filter((x) => x !== d) : [...schedule.days, d] })}
                      className="min-w-[3.25rem] justify-center"
                    >
                      {DAY_LABELS[d]}
                    </Chip>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => save({ days: [1, 2, 3, 4, 5] })}>
                    Weekdays
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => save({ days: [0, 1, 2, 3, 4, 5, 6] })}>
                    Every day
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => save({ days: [1] })}>
                    Mondays only
                  </Button>
                </div>
              </Card>
            </section>

            <section>
              <SectionTitle>Time</SectionTitle>
              <Card className="p-4">
                <TextField
                  type="time"
                  label="Remind me at"
                  value={schedule.time}
                  onChange={(e) => e.target.value && save({ time: e.target.value })}
                  hint={`Shown in your time zone, ${tz}. If you travel, reminders follow the device clock.`}
                />
              </Card>
            </section>

            <section>
              <SectionTitle>Pause</SectionTitle>
              <Card className="p-4">
                <Toggle
                  label="Pause reminders"
                  description={paused ? 'Nothing will nudge you while paused. Your subscriptions are still tracked.' : 'Take a break without changing your schedule.'}
                  checked={paused}
                  onChange={(v) => save(v ? { paused: true } : { paused: false, pausedUntil: null }, v ? 'Reminders paused' : 'Reminders resumed')}
                />
                {paused && (
                  <div className="mt-2">
                    <p className="mb-1.5 text-[0.8125rem] font-semibold text-navy-800">Resume automatically</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'In 1 week', until: daysFromToday(6) },
                        { label: 'In 2 weeks', until: daysFromToday(13) },
                        { label: 'In a month', until: daysFromToday(29) },
                      ].map((o) => (
                        <Chip key={o.label} selected={schedule.pausedUntil === o.until} onClick={() => save({ pausedUntil: o.until }, `Paused, back ${formatDate(toISO(addDays(new Date(o.until + 'T12:00:00'), 1)), 'd MMM')}`)}>
                          {o.label}
                        </Chip>
                      ))}
                      <Chip selected={schedule.pausedUntil === null} onClick={() => save({ pausedUntil: null }, 'Paused until you resume')}>
                        Until I resume
                      </Chip>
                    </div>
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionTitle>How reminders reach you</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                <Delivery icon="home" title="In the app, on your Today card" status="Always on" tone="mint" body="Every visit shows whether today's reminder is due, done or paused." />
                <div className="px-4 py-3">
                  <Toggle
                    label={native ? 'Notification on this phone' : 'Browser notification while the app is open'}
                    description={
                      native
                        ? permission === 'denied'
                          ? 'Turned off for this app in iOS Settings.'
                          : schedule.browserNotifications && permission === 'granted'
                            ? 'Allowed. iOS shows the reminder at the chosen time, even when the app is closed.'
                            : 'Asks iOS for permission. Fires at the chosen time even when the app is closed.'
                        : permission === 'unsupported'
                        ? 'Not supported by this browser.'
                        : permission === 'denied'
                          ? 'Blocked in your browser settings for this site.'
                          : schedule.browserNotifications && permission === 'granted'
                            ? 'Allowed. A notification appears at reminder time if this app is open in a tab.'
                            : 'Asks for permission. Only works while this app is open in a tab.'
                    }
                    checked={schedule.browserNotifications && permission === 'granted'}
                    onChange={enableBrowser}
                  />
                </div>
                {native ? (
                  <Delivery icon="bell" title="While the app is closed" status={schedule.browserNotifications && permission === 'granted' ? 'Scheduled on this phone' : 'Needs the switch above'} tone={schedule.browserNotifications && permission === 'granted' ? 'mint' : 'navy'} body="Reminders are booked with iOS for the next six weeks and refreshed every time you open the app, so no server is involved." />
                ) : (
                  <Delivery icon="bell" title="Push while the app is closed" status="Not available in this version" tone="navy" body="This build has no push service, so nothing can reach a closed app or a locked phone. We say so rather than promise it." />
                )}
                <Delivery icon="mail" title="Email reminders" status="Not available yet" tone="navy" body="No email service is connected in this version." />
              </Card>
            </section>

            <Button full variant="secondary" onClick={() => navigate('/')} leading={<Icon name="home" size={18} />}>
              See today's reminder state on Home
            </Button>
          </>
        )}
      </Page>
    </div>
  )
}

function Delivery({ icon, title, status, tone, body }: { icon: IconName; title: string; status: string; tone: 'mint' | 'navy'; body: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === 'mint' ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-faint'}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-[0.875rem] font-semibold ${tone === 'mint' ? 'text-ink' : 'text-muted'}`}>{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${tone === 'mint' ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-muted'}`}>{status}</span>
        </span>
        <span className="block text-[0.75rem] leading-snug text-muted">{body}</span>
      </span>
    </div>
  )
}
