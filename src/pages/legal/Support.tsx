import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ContactBlock, LegalPage, LegalSection } from '@/components/app/LegalLayout'
import { APP_NAME, APP_VERSION, LEGAL_ROUTES, SUPPORT_EMAIL, mailto } from '@/lib/legal'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { FeedbackSheet } from '@/components/app/FeedbackPrompt'

const FAQ: { q: string; a: string }[] = [
  { q: 'Where is my data?', a: 'On your device unless you create an account. With an account, a copy is backed up to our server so you can restore it on another device. Nobody else can read it.' },
  { q: 'Will I get a push notification before a renewal?', a: 'Not yet. Reminders show on the Home screen when you open the app, and in a browser notification while the app is open in a tab. Push while the app is closed and email reminders are not available in this version, and the app never pretends otherwise.' },
  { q: 'How do I move to a new phone?', a: 'Create an account (or sign in) on the old device so your data is backed up, then sign in on the new one. Without an account, export a backup from Settings and keep the file.' },
  { q: 'A renewal date is wrong.', a: 'Open the subscription, tap Edit and set the real billing date. Dates marked “estimated” were guessed from the start date and billing cycle.' },
  { q: 'How do I cancel Premium?', a: 'Settings → Plan → End Premium. In this build the plan is recorded in the app; once distributed through an app store, cancel from the store’s subscription settings.' },
  { q: 'How do I delete everything?', a: 'Settings → Delete account (signed in) or Settings → Erase all data (no account). Both are permanent; export a backup first if you want a record.' },
]

export default function Support() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [open, setOpen] = useState<number | null>(0)
  const [feedback, setFeedback] = useState(false)
  const link = 'inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2'

  return (
    <LegalPage title="Support" subtitle="Answers first, then a human">
      <Card className="p-4">
        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-mint-700">Common questions</p>
        <ul className="mt-2 divide-y divide-line">
          {FAQ.map((f, i) => (
            <li key={f.q}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex min-h-12 w-full items-center gap-3 rounded-xl py-2 text-left active:bg-navy-50">
                <span className="flex-1 text-[0.9375rem] font-semibold text-ink">{f.q}</span>
                <Icon name="chevronDown" size={18} className={`shrink-0 text-faint transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && <p className="pb-3 text-[0.9375rem] leading-relaxed text-muted">{f.a}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <LegalSection title="Fix it yourself">
        <div className="grid grid-cols-1 gap-2 pt-1">
          <Button variant="secondary" onClick={() => navigate('/settings')} leading={<Icon name="download" size={18} />}>
            Export a backup (Settings)
          </Button>
          <Button variant="secondary" onClick={() => navigate('/reminders')} leading={<Icon name="bell" size={18} />}>
            Reminder settings
          </Button>
          <Button variant="secondary" onClick={() => setFeedback(true)} leading={<Icon name="note" size={18} />}>
            Send private feedback
          </Button>
        </div>
      </LegalSection>

      <LegalSection title="Talk to a person">
        <p>
          Email <a href={mailto('Support request')} className={link}>{SUPPORT_EMAIL}</a> and include what you expected, what happened, and the app version below. We reply within five working days. Never send your password.
        </p>
        <p className="text-[0.8125rem] text-muted">
          {APP_NAME} {APP_VERSION} · {auth.status === 'signed-in' ? 'signed in' : 'no account'} · {typeof navigator !== 'undefined' ? navigator.userAgent.split(') ')[0].replace('(', '') : ''}
        </p>
      </LegalSection>

      <LegalSection title="Legal">
        <p>
          <Link to={LEGAL_ROUTES.privacy} className={link}>
            Privacy Policy
          </Link>{' '}
          ·{' '}
          <Link to={LEGAL_ROUTES.terms} className={link}>
            Terms of Use
          </Link>{' '}
          ·{' '}
          <Link to={LEGAL_ROUTES.deleteAccount} className={link}>
            Delete account
          </Link>
        </p>
      </LegalSection>

      <ContactBlock subject="Support request" />
      <FeedbackSheet open={feedback} score={null} source="settings" onClose={() => setFeedback(false)} onSaved={() => setFeedback(false)} />
    </LegalPage>
  )
}
