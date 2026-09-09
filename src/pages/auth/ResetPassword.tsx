import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '@/lib/errors'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { AuthLayout, PasswordField } from './AuthLayout'

export default function ResetPassword() {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const inFlight = useRef(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    const errs: typeof errors = {}
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (confirm !== password) errs.confirm = 'Passwords do not match.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    inFlight.current = true
    setBusy(true)
    try {
      await resetPassword(token, password)
      toast.success('Password updated. You are signed in.')
      navigate('/', { replace: true })
    } catch (err) {
      setErrors({ form: describeError(err, 'reset your password') })
      setBusy(false)
      inFlight.current = false
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset your password" backTo="/auth/sign-in">
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-coral-100 text-coral-700">
            <Icon name="alert" size={28} />
          </span>
          <h2 className="text-lg font-bold text-navy-900">This link is incomplete</h2>
          <p className="mt-1.5 max-w-[300px] text-[0.875rem] text-muted">Open the link from your email, or request a new one.</p>
          <Link to="/auth/forgot" className="mt-5 w-full">
            <Button full size="lg">
              Request a new link
            </Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" backTo="/auth/sign-in" subtitle="This signs you out everywhere else, then signs you in here.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errors.form && (
          <div className="rounded-xl bg-coral-50 px-3 py-2.5 text-[0.875rem] font-medium text-coral-700" role="alert">
            <p className="flex items-start gap-2">
              <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
              {errors.form}
            </p>
            <Link to="/auth/forgot" className="mt-1 inline-flex min-h-11 items-center pl-6 font-semibold underline decoration-2 underline-offset-2">
              Request a new link
            </Link>
          </div>
        )}
        <PasswordField label="New password" value={password} onChange={setPassword} error={errors.password} show={show} onToggle={() => setShow((s) => !s)} autoComplete="new-password" />
        <PasswordField label="Repeat new password" value={confirm} onChange={setConfirm} error={errors.confirm} show={show} onToggle={() => setShow((s) => !s)} autoComplete="new-password" />
        <Button type="submit" full size="lg" variant="mint" loading={busy}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  )
}
