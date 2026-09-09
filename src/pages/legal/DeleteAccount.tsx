import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ContactBlock, LegalPage, LegalSection } from '@/components/app/LegalLayout'
import { SUPPORT_EMAIL, mailto } from '@/lib/legal'
import { useAuth } from '@/auth/AuthContext'
import { useNotes, usePriceChanges, useSubscriptions } from '@/hooks/useData'
import { resetAllData } from '@/db/repo'
import { describeError } from '@/lib/errors'
import { leaveSheet } from '@/lib/navigation'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Primitives'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { PasswordField } from '@/pages/auth/AuthLayout'

/**
 * Explains exactly what deletion removes, then confirms the permanent action: with the password for an
 * account, or an explicit confirm sheet for device-only data. Reachable before sign-up so nobody has to
 * create an account to learn how to leave.
 */
export default function DeleteAccount() {
  const navigate = useNavigate()
  const toast = useToast()
  const auth = useAuth()
  const subs = useSubscriptions()
  const notes = useNotes()
  const changes = usePriceChanges()
  const [del, setDel] = useState<{ open: boolean; password: string; show: boolean; error: string; busy: boolean }>({ open: false, password: '', show: false, error: '', busy: false })
  const [confirmErase, setConfirmErase] = useState(false)
  const [erasing, setErasing] = useState(false)
  const signedIn = auth.status === 'signed-in'
  const counts = { subs: subs?.length ?? 0, notes: notes?.length ?? 0, changes: changes?.length ?? 0 }

  return (
    <LegalPage title="Delete account" subtitle="Permanent, and entirely in your hands">
      <Card className="border-coral-100 bg-coral-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-100 text-coral-700">
            <Icon name="alert" size={20} />
          </span>
          <div>
            <p className="text-[0.9375rem] font-bold text-coral-700">This cannot be undone</p>
            <p className="mt-0.5 text-[0.875rem] leading-snug text-navy-900">
              {signedIn
                ? `Deleting removes your account (${auth.user?.email}) and every record it holds from our server and from this device.`
                : 'You have no account, so everything lives on this device. Erasing removes all of it from this browser.'}
            </p>
          </div>
        </div>
      </Card>

      <LegalSection title="What gets deleted">
        <ul>
          {signedIn && <li>Your account: email address, name and password.</li>}
          <li>
            {counts.subs} {counts.subs === 1 ? 'subscription' : 'subscriptions'}, {counts.changes} price {counts.changes === 1 ? 'change' : 'changes'} and {counts.notes} cancellation {counts.notes === 1 ? 'note' : 'notes'}.
          </li>
          <li>Renewal checks, streaks, milestones, challenge progress, reminder settings, your monthly limit and its history.</li>
          <li>Any private feedback notes, your plan record and billing history.</li>
          <li>Unsaved drafts and the cached sign-in on this device.</li>
        </ul>
        <p>Nothing is kept for “recovery”. Once confirmed, it is gone.</p>
      </LegalSection>

      <LegalSection title="Before you go">
        <ol className="list-decimal">
          <li>
            Export a backup if you might want a record later: Settings → Data → Export backup.{' '}
            <button type="button" onClick={() => navigate('/settings')} className="inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">
              Open Settings
            </button>
          </li>
          {signedIn && <li>Sign out on any other device you use. Those copies are removed the next time they open the app and find the account gone.</li>}
          <li>Then confirm below.</li>
        </ol>
      </LegalSection>

      <LegalSection title="Steps">
        {signedIn ? (
          <ol className="list-decimal">
            <li>Tap “Delete my account”.</li>
            <li>Enter your password to confirm it is really you.</li>
            <li>Your account and data are deleted immediately and you return to the start screen.</li>
          </ol>
        ) : (
          <ol className="list-decimal">
            <li>Tap “Erase all data on this device”.</li>
            <li>Confirm on the sheet that appears.</li>
            <li>Everything on this device is removed and you return to the start screen.</li>
          </ol>
        )}
      </LegalSection>

      {signedIn ? (
        <Button full size="lg" variant="coral" onClick={() => setDel({ open: true, password: '', show: false, error: '', busy: false })} leading={<Icon name="trash" size={20} />}>
          Delete my account
        </Button>
      ) : (
        <div className="space-y-2">
          <Button full size="lg" variant="coral" onClick={() => setConfirmErase(true)} leading={<Icon name="trash" size={20} />}>
            Erase all data on this device
          </Button>
          <Button full size="lg" variant="ghost" onClick={() => navigate('/auth/sign-in?next=/account/delete')}>
            Have an account? Sign in to delete it
          </Button>
        </div>
      )}

      <LegalSection title="Cannot sign in?">
        <p>
          Email <a href={mailto('Delete my account')} className="inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">{SUPPORT_EMAIL}</a> from the address on the account with the subject “Delete my account”. We verify the address and delete the account within 30 days, then confirm by email.
        </p>
      </LegalSection>

      <ContactBlock subject="Delete my account" />

      <Sheet open={del.open} onClose={() => setDel((d) => ({ ...d, open: false }))} title="Delete your account?">
        <p className="text-[0.9375rem] leading-relaxed text-muted">
          This permanently deletes your account, all {counts.subs} subscriptions, every price change and note, and the copy on this device. There is no undo.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (del.busy) return
            if (!del.password) return setDel((d) => ({ ...d, error: 'Enter your password to confirm.' }))
            setDel((d) => ({ ...d, busy: true, error: '' }))
            try {
              await auth.deleteAccount(del.password)
              toast.info('Your account and data have been deleted.')
              leaveSheet(navigate, '/')
            } catch (err) {
              setDel((d) => ({ ...d, busy: false, error: describeError(err, 'delete the account') }))
            }
          }}
          className="mt-4 space-y-4"
          noValidate
        >
          <PasswordField label="Confirm with your password" value={del.password} onChange={(v) => setDel((d) => ({ ...d, password: v, error: '' }))} error={del.error} show={del.show} onToggle={() => setDel((d) => ({ ...d, show: !d.show }))} autoComplete="current-password" />
          <Button type="submit" full size="lg" variant="coral" loading={del.busy}>
            Delete account and all data
          </Button>
          <Button type="button" full size="lg" variant="ghost" onClick={() => setDel((d) => ({ ...d, open: false }))}>
            Keep my account
          </Button>
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        title="Erase everything on this device?"
        body="All subscriptions, price history, notes and your profile will be deleted from this device. There is no undo. Export a backup first if you might want it back."
        confirmLabel="Erase all data"
        loading={erasing}
        onConfirm={async () => {
          if (erasing) return
          setErasing(true)
          try {
            await resetAllData()
            toast.info('Everything on this device has been erased.')
            leaveSheet(navigate, '/')
          } catch (err) {
            toast.error(describeError(err, 'erase the data'))
            setErasing(false)
            setConfirmErase(false)
          }
        }}
      />
    </LegalPage>
  )
}
