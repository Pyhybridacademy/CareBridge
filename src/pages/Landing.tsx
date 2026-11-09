import { Link, Navigate } from 'react-router-dom'
import { HeartPulse, Mic, ShieldCheck, Stethoscope, Video, ClipboardList } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui'

export default function Landing() {
  const { session, loading } = useAuth()
  if (!loading && session) return <Navigate to="/app" replace />

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 pb-8 pt-10 safe-top">
      <div className="flex items-center gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-600 text-white">
          <HeartPulse className="h-6 w-6" />
        </span>
        <span className="text-xl font-bold">CareConnect</span>
      </div>

      <h1 className="mt-10 text-4xl font-bold leading-tight">
        Your nurse, <span className="text-teal-600">always within reach.</span>
      </h1>
      <p className="mt-3 text-lg text-slate-600 dark:text-slate-300">
        Send a message, a voice note or a short video to your care nurse. Get clear treatment plans and keep your health records in one place.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link to="/signup?role=patient">
          <Button className="w-full" size="md">
            <Stethoscope className="h-5 w-5" /> I’m a Patient
          </Button>
        </Link>
        <Link to="/signup?role=nurse">
          <Button className="w-full" variant="secondary">
            <ShieldCheck className="h-5 w-5" /> I’m a Nurse
          </Button>
        </Link>
      </div>
      <p className="mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-teal-700 underline dark:text-teal-300">
          Log in
        </Link>
      </p>

      <ul className="mt-10 space-y-4">
        {[
          { icon: Mic, title: 'Voice notes', text: 'Explain how you feel in your own words, any time of day.' },
          { icon: Video, title: 'Video notes', text: 'Show a wound, a rash or how you take your medicine.' },
          { icon: ClipboardList, title: 'Treatment plans & records', text: 'Medication, dosage and visit notes, always up to date.' },
        ].map((f) => (
          <li key={f.title} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800/70">
            <f.icon className="mt-0.5 h-6 w-6 shrink-0 text-teal-600" />
            <div>
              <p className="font-semibold">{f.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-10 text-center text-xs text-slate-500 dark:text-slate-400">Not for emergencies. Call your local emergency number.</p>
    </div>
  )
}
