import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '@/lib/errors'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { AuthLayout, EMAIL_RE, PasswordField, useNextPath } from './AuthLayout'

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const next = useNextPath()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const inFlight = useRef(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    const errs: typeof errors = {}
    if (name.trim().length < 1) errs.name = 'Tell us what to call you.'
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    inFlight.current = true
    setBusy(true)
    try {
      await signUp({ name: name.trim(), email: email.trim(), password })
      toast.success('Account created. Your data is backed up.')
      navigate(next === '/' ? '/' : next, { replace: true })
    } catch (err) {
      setErrors({ form: describeError(err, 'create your account') })
      setBusy(false)
      inFlight.current = false
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free, and only takes a moment. Everything you have tracked on this device moves into the account."
      footer={
        <p className="px-1 text-center text-[14px] text-muted">
          Already have an account?{' '}
          <Link to={`/auth/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">
            Sign in
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
        <TextField label="Name" placeholder="Alex" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" autoFocus />
        <TextField label="Email" type="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" />
        <PasswordField label="Password" value={password} onChange={setPassword} error={errors.password} show={show} onToggle={() => setShow((s) => !s)} autoComplete="new-password" hint="At least 8 characters. A short phrase works well." />
        <Button type="submit" full size="lg" variant="mint" loading={busy}>
          Create account
        </Button>
        <p className="text-center text-[12px] leading-relaxed text-faint">Your password is stored only as a salted hash. We never ask for card details.</p>
      </form>
    </AuthLayout>
  )
}
