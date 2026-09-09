import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '@/lib/errors'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { AuthLayout, EMAIL_RE } from './AuthLayout'

export default function ForgotPassword() {
  const { requestReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const inFlight = useRef(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    if (!EMAIL_RE.test(email.trim())) return setError('Enter the email you signed up with.')
    inFlight.current = true
    setBusy(true)
    try {
      await requestReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(describeError(err, 'send the reset email'))
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  return (
    <AuthLayout title="Reset your password" backTo="/auth/sign-in" subtitle={sent ? undefined : 'Enter your email and we will send a link that lets you choose a new password.'}>
      {sent ? (
        <div className="fade flex flex-col items-center py-4 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-mint-700">
            <Icon name="mail" size={28} />
          </span>
          <h2 className="text-lg font-bold text-navy-900">Check your inbox</h2>
          <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-muted">
            If an account exists for <span className="font-semibold text-ink">{email.trim()}</span>, a reset link is on its way. It works for one hour.
          </p>
          {import.meta.env.DEV && <p className="mt-3 rounded-xl bg-navy-50 px-3 py-2 text-[12px] text-navy-800">Development build: the email is saved to server/outbox instead of being sent.</p>}
          <Link to="/auth/sign-in" className="mt-5 h-12 w-full">
            <Button full size="lg" variant="secondary">
              Back to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            error={error}
            autoComplete="email"
            autoFocus
          />
          <Button type="submit" full size="lg" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
