import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { HeartPulse, MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errMsg } from '../lib/format'
import { Button, ErrorBanner, Field, Input, Select } from '../components/ui'
import type { Role } from '../types'

const APP_URL = 'https://carebridge-git-main-samuelsmar08-gmailcoms-projects.vercel.app'

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 py-8 safe-top">
      <Link to="/" className="mb-6 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
          <HeartPulse className="h-5 w-5" />
        </span>
        <span className="text-lg font-bold">CareBridge</span>
      </Link>
      <h1 className="mb-5 text-2xl font-bold">{title}</h1>
      {children}
      <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">Not for emergencies. Call your local emergency number.</p>
    </div>
  )
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/app" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) {
      setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : errMsg(err))
      return
    }
    navigate('/app', { replace: true })
  }

  async function reset() {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError('Enter your email above first, then tap “Forgot password”.')
      return
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${APP_URL}/reset-password` })
    if (err) setError(errMsg(err))
    else setInfo('If that email has an account, a reset link is on its way.')
  }

  return (
    <AuthFrame title="Welcome back">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBanner message={error} />
        {info && <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-100">{info}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Log in
        </Button>
        <button type="button" onClick={reset} className="block w-full text-center text-sm font-medium text-teal-700 underline dark:text-teal-300">
          Forgot password?
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-teal-700 underline dark:text-teal-300">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) setError(errMsg(err))
    else navigate('/app', { replace: true })
  }

  return (
    <AuthFrame title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBanner message={error} />
        <Button type="submit" loading={busy} className="w-full">
          Save password
        </Button>
      </form>
    </AuthFrame>
  )
}

export function SignupPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [role, setRole] = useState<Role>(params.get('role') === 'nurse' ? 'nurse' : 'patient')
  const [f, setF] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    dob: '',
    gender: '',
    emergency_contact: '',
    license_number: '',
    specialty: '',
  })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)

  useEffect(() => {
    supabase.from('site_settings').select('registration_enabled').eq('id', true).maybeSingle().then(({ data }) => {
      if (data) setRegistrationEnabled(data.registration_enabled)
    })
  }, [])

  if (!loading && session) return <Navigate to="/app" replace />
  if (!registrationEnabled) return <AuthFrame title="Registration is closed"><div className="rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-800/70"><p className="text-slate-600 dark:text-slate-300">New accounts are created by a CareBridge administrator.</p><Link to="/login" className="mt-4 inline-block font-semibold text-teal-700">Go to log in</Link></div></AuthFrame>

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (f.full_name.trim().length < 2) return setError('Please enter your full name.')
    if (f.password.length < 8) return setError('Password must be at least 8 characters.')
    if (role === 'nurse' && (!f.license_number.trim() || !f.specialty.trim())) return setError('Nurses must enter a license number and specialty.')
    if (role === 'patient' && (!f.dob || !f.phone.trim() || !f.gender || !f.emergency_contact.trim()))
      return setError('Please fill in date of birth, phone, gender and emergency contact.')
    if (!consent) return setError('Please agree to the data processing consent to continue.')

    setBusy(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: {
        emailRedirectTo: `${APP_URL}/app`,
        data: {
          role,
          full_name: f.full_name.trim(),
          phone: f.phone.trim(),
          dob: role === 'patient' ? f.dob : '',
          gender: role === 'patient' ? f.gender : '',
          emergency_contact: role === 'patient' ? f.emergency_contact.trim() : '',
          license_number: role === 'nurse' ? f.license_number.trim() : '',
          specialty: role === 'nurse' ? f.specialty.trim() : '',
        },
      },
    })
    setBusy(false)
    if (err) return setError(errMsg(err))
    if (data.session) navigate('/app', { replace: true })
    else setConfirmEmail(true)
  }

  if (confirmEmail) {
    return (
      <AuthFrame title="Check your email">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-800/70">
          <MailCheck className="h-10 w-10 text-teal-600" />
          <p>
            We sent a confirmation link to <strong>{f.email}</strong>. Open it, then come back and log in.
          </p>
          <Link to="/login">
            <Button>Go to log in</Button>
          </Link>
        </div>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title="Create your account">
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-200 p-1 dark:bg-slate-800" role="tablist" aria-label="Account type">
        {(['patient', 'nurse'] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            onClick={() => setRole(r)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${role === r ? 'bg-white text-teal-700 shadow dark:bg-slate-600 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
          >
            I’m a {r}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <Input autoComplete="name" required value={f.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} />
        </Field>
        <Field label="Phone">
          <Input type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
        </Field>

        {role === 'patient' ? (
          <>
            <Field label="Date of birth">
              <Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={set('dob')} />
            </Field>
            <Field label="Gender">
              <Select value={f.gender} onChange={set('gender')}>
                <option value="">Select…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
                <option>Prefer not to say</option>
              </Select>
            </Field>
            <Field label="Emergency contact" hint="Name and phone number">
              <Input value={f.emergency_contact} onChange={set('emergency_contact')} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Nursing license number">
              <Input value={f.license_number} onChange={set('license_number')} />
            </Field>
            <Field label="Specialty" hint="For example: General nursing, Midwifery, Pediatrics">
              <Input value={f.specialty} onChange={set('specialty')} />
            </Field>
          </>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-teal-600" />
          <span>I agree that CareBridge may process my personal and health information to provide care communication services.</span>
        </label>

        <ErrorBanner message={error} />
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        Already registered?{' '}
        <Link to="/login" className="font-semibold text-teal-700 underline dark:text-teal-300">
          Log in
        </Link>
      </p>
    </AuthFrame>
  )
}
