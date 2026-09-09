import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '@/lib/errors'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { AuthLayout, EMAIL_RE, PasswordField, useNextPath } from './AuthLayout'

export default function SignIn() {
  const { signIn, pendingMerge, resolveMerge } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const next = useNextPath()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [merging, setMerging] = useState<null | 'keep' | 'drop'>(null)

  const inFlight = useRef(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    const errs: typeof errors = {}
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    inFlight.current = true
    setBusy(true)
    try {
      const { merge } = await signIn({ email: email.trim(), password })
      if (merge) return // the keep-or-drop sheet below must be answered first; it navigates afterwards
      toast.success('Welcome back')
      navigate(next, { replace: true })
    } catch (err) {
      setErrors({ form: describeError(err, 'sign you in') })
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  const finishMerge = async (keep: boolean) => {
    setMerging(keep ? 'keep' : 'drop')
    try {
      await resolveMerge(keep)
      toast.success(keep ? 'Added to your account' : 'Welcome back')
      navigate(next, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not finish signing in')
      setMerging(null)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up exactly where you left off, on any device."
      footer={
        <p className="px-1 text-center text-[14px] text-muted">
          New here?{' '}
          <Link to={`/auth/sign-up?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">
            Create a free account
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errors.form && (
          <p className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[14px] font-medium text-coral-700" role="alert">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            {errors.form}
          </p>
        )}
        <TextField label="Email" type="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" autoFocus />
        <PasswordField label="Password" value={password} onChange={setPassword} error={errors.password} show={show} onToggle={() => setShow((s) => !s)} autoComplete="current-password" />
        <Button type="submit" full size="lg" loading={busy}>
          Sign in
        </Button>
        <Link to="/auth/forgot" className="flex min-h-11 items-center justify-center text-center text-[14px] font-semibold text-navy-700">
          Forgot your password?
        </Link>
      </form>

      <Sheet open={pendingMerge !== null} onClose={() => undefined} title="Keep what is on this device?">
        <p className="text-[15px] leading-relaxed text-muted">
          This device has {pendingMerge?.count} {pendingMerge?.count === 1 ? 'subscription' : 'subscriptions'} tracked as a guest, and your account already has its own list. Add them to your account, or leave them out and they are removed from this device.
        </p>
        <Button full size="lg" variant="mint" className="mt-5" loading={merging === 'keep'} disabled={merging !== null} onClick={() => finishMerge(true)}>
          Add them to my account
        </Button>
        <Button full size="lg" variant="ghost" className="mt-2" loading={merging === 'drop'} disabled={merging !== null} onClick={() => finishMerge(false)}>
          Leave them out
        </Button>
      </Sheet>
    </AuthLayout>
  )
}
