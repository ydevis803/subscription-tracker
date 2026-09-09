import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { recordInvite } from '@/db/repo'
import { useNotes, usePriceChanges, useProfile, useSettings, useSubscriptions } from '@/hooks/useData'
import { INVITE_BADGES, appLink, copyText, inviteProgress, invitationMessage, shareInvitation } from '@/lib/referral'
import { formatDate, toISO } from '@/lib/dates'
import { describeError } from '@/lib/errors'
import { PageHeader } from '@/components/layout/PageHeader'
import { Page } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Card, ProgressBar, SectionTitle, Skeleton } from '@/components/ui/Primitives'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'

const NUMBERS_KEY = 'subscription-tracker.invite-include-numbers'

/**
 * The referral screen: a personal invitation with the app link, share and copy actions with visible feedback,
 * and cosmetic badges for progress. It never promises money and never sees who the invitation goes to.
 */
export default function Invite() {
  const navigate = useNavigate()
  const toast = useToast()
  const profile = useProfile()
  const settings = useSettings()
  const subs = useSubscriptions()
  const changes = usePriceChanges()
  const notes = useNotes()
  const [includeNumbers, setIncludeNumbers] = useState(() => {
    try {
      return localStorage.getItem(NUMBERS_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [busy, setBusy] = useState<'share' | 'link' | 'message' | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)
  const inFlight = useRef(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const loading = !profile || !settings || !subs || !changes || !notes
  const message = useMemo(() => (loading ? '' : invitationMessage({ profile, subs, changes, notes, includeNumbers })), [loading, profile, subs, changes, notes, includeNumbers])
  const link = appLink()
  const progress = inviteProgress(settings)

  const flash = (set: (v: boolean) => void) => {
    set(true)
    timers.current.push(window.setTimeout(() => set(false), 2200))
  }

  const toggleNumbers = (v: boolean) => {
    setIncludeNumbers(v)
    try {
      localStorage.setItem(NUMBERS_KEY, v ? '1' : '0')
    } catch {
      // ignore
    }
  }

  const afterInvite = async (via: 'share' | 'copy-link' | 'copy-message') => {
    const before = inviteProgress(settings)
    await recordInvite(via)
    const nowCount = before.count + 1
    const badge = INVITE_BADGES.find((b) => b.at === nowCount)
    if (badge) toast.success(`Badge earned: ${badge.title}`)
  }

  const run = async (kind: 'share' | 'link' | 'message', fn: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast.error(describeError(e, 'share your invitation'))
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  const share = () =>
    run('share', async () => {
      const outcome = await shareInvitation(message)
      if (outcome === 'shared') {
        toast.success('Invitation sent')
        await afterInvite('share')
      } else if (outcome === 'copied') {
        flash(setCopiedMessage)
        toast.success('Sharing is not available here, so the message was copied. Paste it anywhere.')
        await afterInvite('copy-message')
      } else if (outcome === 'unavailable') {
        setFallback(message)
      }
    })

  const copyLink = () =>
    run('link', async () => {
      if (await copyText(link)) {
        flash(setCopiedLink)
        toast.success('Link copied')
        await afterInvite('copy-link')
      } else setFallback(link)
    })

  const copyMessage = () =>
    run('message', async () => {
      if (await copyText(message)) {
        flash(setCopiedMessage)
        toast.success('Invitation text copied')
        await afterInvite('copy-message')
      } else setFallback(message)
    })

  return (
    <div>
      <PageHeader title="Invite a friend" back backTo="/profile" />
      <Page className="space-y-5">
        <Card className="bg-navy-900 p-5 text-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-500 text-navy-900">
            <Icon name="gift" size={24} />
          </span>
          <h1 className="mt-4 text-[1.5rem] font-bold leading-tight">Know someone paying for things they forgot?</h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-navy-100">Send them a personal invitation. They get the same free start you did: ten subscriptions, every renewal in view, no card needed.</p>
        </Card>

        <section>
          <SectionTitle>Your invitation</SectionTitle>
          <Card className="p-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink" data-testid="invite-message">
                {message}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2 text-[0.75rem] text-navy-800">
              <Icon name="external" size={14} className="shrink-0 text-mint-700" />
              <span className="min-w-0 break-all">{link}</span>
            </div>
            <Toggle label="Include my numbers" description={includeNumbers ? 'Mentions how many subscriptions you track and your monthly total' : 'Keeps the message general with no amounts'} checked={includeNumbers} onChange={toggleNumbers} />
            <div className="mt-1 space-y-2">
              <Button full size="lg" variant="mint" loading={busy === 'share'} disabled={loading || busy !== null} onClick={share} leading={<Icon name="external" size={20} />}>
                Share invitation
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="md" variant={copiedLink ? 'primary' : 'secondary'} loading={busy === 'link'} disabled={loading || busy !== null} onClick={copyLink} leading={<Icon name={copiedLink ? 'check' : 'copy'} size={18} />} aria-live="polite">
                  {copiedLink ? 'Link copied' : 'Copy link'}
                </Button>
                <Button size="md" variant={copiedMessage ? 'primary' : 'secondary'} loading={busy === 'message'} disabled={loading || busy !== null} onClick={copyMessage} leading={<Icon name={copiedMessage ? 'check' : 'copy'} size={18} />} aria-live="polite">
                  {copiedMessage ? 'Text copied' : 'Copy text'}
                </Button>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Your badges</SectionTitle>
          <Card className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Invitations shared</p>
                <p className="tabular text-[1.75rem] font-bold leading-none text-navy-900">{progress.count}</p>
              </div>
              {progress.lastAt && <p className="text-right text-[0.75rem] text-muted">Last shared {formatDate(toISO(new Date(progress.lastAt)), 'd MMM')}</p>}
            </div>
            {progress.next ? (
              <>
                <div className="mt-3">
                  <ProgressBar value={progress.count} max={progress.next.at} />
                </div>
                <p className="mt-2 text-[0.8125rem] text-muted">
                  {progress.next.at - progress.count} more {progress.next.at - progress.count === 1 ? 'invitation' : 'invitations'} to earn {progress.next.title}.
                </p>
              </>
            ) : (
              <p className="mt-2 text-[0.8125rem] text-muted">Every badge earned. Thank you for passing it on.</p>
            )}
            <ul className="mt-3 divide-y divide-line">
              {INVITE_BADGES.map((b) => {
                const earned = progress.count >= b.at
                return (
                  <li key={b.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${earned ? 'bg-mint-100 text-mint-700' : 'bg-navy-50 text-faint'}`}>
                      <Icon name={b.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[0.875rem] font-semibold ${earned ? 'text-ink' : 'text-muted'}`}>{b.title}</span>
                      <span className="block text-[0.75rem] leading-snug text-muted">{earned ? 'Earned · shows on your profile' : b.howTo}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-navy-50 px-3 py-2 text-[0.75rem] leading-snug text-navy-800">
              <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-mint-700" />
              <span>Badges are cosmetic. There is no cash reward, and the app never learns who you invited. Only the moment you shared is saved.</span>
            </p>
          </Card>
        </section>

        <Button full variant="ghost" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </Page>

      <Sheet open={fallback !== null} onClose={() => setFallback(null)} title="Copy by hand">
        <p className="text-[0.8125rem] text-muted">Clipboard access is blocked here. Select the text below and copy it.</p>
        <textarea readOnly value={fallback ?? ''} onFocus={(e) => e.target.select()} className="mt-2 h-36 w-full rounded-2xl border border-line bg-canvas p-3 text-[0.875rem] text-ink" />
        <Button full size="lg" variant="secondary" className="mt-3" onClick={() => setFallback(null)}>
          Done
        </Button>
      </Sheet>
    </div>
  )
}
