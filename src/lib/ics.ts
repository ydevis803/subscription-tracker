import type { CancellationNote } from '@/db/schema'
import type { RenewalOccurrence } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const ymd = (iso: string) => iso.replace(/-/g, '')
const nextDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
/** Fold long lines at 75 octets as the iCalendar spec requires. */
const fold = (line: string) => {
  const out: string[] = []
  let rest = line
  while (rest.length > 73) {
    out.push(rest.slice(0, 73))
    rest = ' ' + rest.slice(73)
  }
  out.push(rest)
  return out.join('\r\n')
}

/** Build an iCalendar file with one all-day event per renewal and a reminder alarm before each. */
export function buildRenewalCalendar(occurrences: RenewalOccurrence[], notes: CancellationNote[], leadDays: number): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Subscription Tracker//Renewal timeline//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Subscription renewals']
  for (const o of occurrences) {
    const sub = o.subscription
    const openNotes = notes.filter((n) => n.subscriptionId === sub.id && n.status === 'open')
    const description = [
      `${sub.name} renews for ${formatMoney(o.amount, sub.currency)}.`,
      sub.paymentMethod ? `Paid with ${sub.paymentMethod}.` : '',
      ...openNotes.map((n) => `Note: ${n.content}`),
      sub.website ? `Manage: ${sub.website}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:renewal-${sub.id}-${ymd(o.date)}@subscription-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(o.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(o.date))}`,
      fold(`SUMMARY:${esc(`${sub.name} renews · ${formatMoney(o.amount, sub.currency)}`)}`),
      fold(`DESCRIPTION:${esc(description)}`),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      fold(`DESCRIPTION:${esc(`${sub.name} renews in ${leadDays} ${leadDays === 1 ? 'day' : 'days'}`)}`),
      `TRIGGER:-P${Math.max(0, leadDays)}D`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/** Plain-text summary of the timeline, for sharing or pasting into notes. */
export function buildTimelineSummary(
  occurrences: RenewalOccurrence[],
  notes: CancellationNote[],
  categories: { name: string; total: number; count: number }[],
  horizonDays: number,
  currency: string,
  formatDay: (iso: string) => string,
): string {
  const total = occurrences.reduce((s, o) => s + o.amount, 0)
  const head = [`Renewal timeline · next ${horizonDays} days`, `${formatMoney(total, currency)} across ${occurrences.length} ${occurrences.length === 1 ? 'renewal' : 'renewals'}`]
  const cats = categories.map((c) => `${c.name} ${formatMoney(c.total, currency)} (${c.count})`).join(' · ')
  const rows = occurrences.map((o) => {
    const n = notes.filter((x) => x.subscriptionId === o.subscription.id && x.status === 'open')
    return [`${formatDay(o.date)} · ${o.subscription.name} · ${formatMoney(o.amount, o.subscription.currency)}`, ...n.map((x) => `    Note: ${x.content}`)].join('\n')
  })
  return [...head, '', cats, '', ...rows].join('\n')
}
