import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellOff, CalendarX, LogOut, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useMyNurse } from '../lib/hooks'
import { errMsg, fmtDateTime, nowLocalInput } from '../lib/format'
import type { Appointment, Notification } from '../types'
import ChooseNurse from '../components/ChooseNurse'
import { Avatar, Badge, Button, Card, Empty, ErrorBanner, Field, Input, ListSkeleton, SectionTitle, Textarea, statusTone } from '../components/ui'

/* ------------------------------ Notifications ------------------------------ */

export function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[] | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    setItems((data as Notification[]) ?? [])
  }, [user])

  useEffect(() => {
    load()
    if (!user) return
    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load, user])

  async function open(n: Notification) {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    if (n.link) navigate(n.link)
    else load()
  }

  async function markAll() {
    if (!user) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notifications</h1>
        {items?.some((n) => !n.read_at) && (
          <Button variant="ghost" size="sm" onClick={markAll}>
            Mark all read
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {!items && <ListSkeleton />}
        {items?.length === 0 && <Empty icon={<BellOff className="h-8 w-8" />} title="You’re all caught up" text="New messages and updates will show up here." />}
        {items?.map((n) => (
          <button
            key={n.id}
            onClick={() => open(n)}
            className={`w-full rounded-2xl border p-3 text-left ${n.read_at ? 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-800/40' : 'border-teal-300 bg-white shadow-sm dark:border-teal-700 dark:bg-slate-800'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{n.title}</p>
              {!n.read_at && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600" aria-label="Unread" />}
            </div>
            {n.body && <p className="text-sm text-slate-600 dark:text-slate-300">{n.body}</p>}
            <p className="mt-1 text-xs text-slate-500">{fmtDateTime(n.created_at)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------- Appointments ------------------------------- */

interface ApptRow extends Appointment {
  other_name: string
}

export function AppointmentsPage() {
  const { user, role } = useAuth()
  const isNurse = role === 'nurse'
  const { nurse, loading: nurseLoading, reload: reloadNurse } = useMyNurse()
  const [items, setItems] = useState<ApptRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [when, setWhen] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const [newWhen, setNewWhen] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    const { data, error: err } = await supabase
      .from('appointments')
      .select('*')
      .or(`patient_id.eq.${user.id},nurse_id.eq.${user.id}`)
      .order('scheduled_at', { ascending: true })
    if (err) {
      setError(errMsg(err))
      setItems([])
      return
    }
    const rows = (data as Appointment[]) ?? []
    const otherIds = [...new Set(rows.map((r) => (isNurse ? r.patient_id : r.nurse_id)))]
    const names = new Map<string, string>()
    if (otherIds.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', otherIds)
      ;(ps ?? []).forEach((p) => names.set(p.id as string, p.full_name as string))
    }
    setItems(rows.map((r) => ({ ...r, other_name: names.get(isNurse ? r.patient_id : r.nurse_id) ?? 'Unknown' })))
  }, [user, isNurse])

  useEffect(() => {
    load()
  }, [load])

  async function book(e: FormEvent) {
    e.preventDefault()
    if (!user || !nurse) return
    setError(null)
    if (!when) return setError('Choose a date and time.')
    if (new Date(when) < new Date()) return setError('Pick a time in the future.')
    if (!reason.trim()) return setError('Tell your nurse briefly why you need the visit.')
    setBusy(true)
    const { error: err } = await supabase.from('appointments').insert({
      patient_id: user.id,
      nurse_id: nurse.id,
      scheduled_at: new Date(when).toISOString(),
      reason: reason.trim(),
      status: 'requested',
    })
    setBusy(false)
    if (err) return setError(errMsg(err))
    setWhen('')
    setReason('')
    load()
  }

  async function setStatus(id: string, status: Appointment['status'], scheduled_at?: string) {
    setError(null)
    const patch: Partial<Appointment> = { status }
    if (scheduled_at) patch.scheduled_at = scheduled_at
    const { error: err } = await supabase.from('appointments').update(patch).eq('id', id)
    if (err) setError(errMsg(err))
    setRescheduling(null)
    load()
  }

  if (!isNurse && !nurse && !nurseLoading) {
    return (
      <div>
        <h1 className="text-xl font-bold">Visits</h1>
        <p className="mb-3 mt-1 text-sm text-slate-600 dark:text-slate-300">Choose your nurse first so you can book visits.</p>
        <ChooseNurse onDone={reloadNurse} />
      </div>
    )
  }

  const upcoming = (items ?? []).filter((a) => a.status === 'requested' || a.status === 'confirmed')
  const past = (items ?? []).filter((a) => a.status === 'completed' || a.status === 'cancelled')

  return (
    <div>
      <h1 className="text-xl font-bold">{isNurse ? 'Appointments' : 'Visits'}</h1>
      <ErrorBanner message={error} />

      {!isNurse && nurse && (
        <Card className="mt-3">
          <form onSubmit={book} className="space-y-3">
            <p className="font-semibold">Book a check-in with {nurse.full_name}</p>
            <Field label="Date and time">
              <Input type="datetime-local" min={nowLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="Reason">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: blood pressure follow-up" />
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Request appointment
            </Button>
          </form>
        </Card>
      )}

      <SectionTitle>Upcoming</SectionTitle>
      {!items && <ListSkeleton />}
      {items && upcoming.length === 0 && <Empty icon={<CalendarX className="h-8 w-8" />} title="No upcoming appointments" />}
      <div className="space-y-2">
        {upcoming.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{fmtDateTime(a.scheduled_at)}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {isNurse ? 'Patient' : 'Nurse'}: {a.other_name}
                </p>
                {a.reason && <p className="mt-1 text-sm">{a.reason}</p>}
              </div>
              <Badge tone={statusTone(a.status)}>{a.status}</Badge>
            </div>

            {rescheduling === a.id && (
              <div className="mt-3 flex gap-2">
                <Input type="datetime-local" min={nowLocalInput()} value={newWhen} onChange={(e) => setNewWhen(e.target.value)} />
                <Button size="sm" disabled={!newWhen} onClick={() => setStatus(a.id, 'confirmed', new Date(newWhen).toISOString())}>
                  Save
                </Button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {isNurse && a.status === 'requested' && (
                <>
                  <Button size="sm" onClick={() => setStatus(a.id, 'confirmed')}>
                    Accept
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRescheduling(a.id)}>
                    Reschedule
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setStatus(a.id, 'cancelled')}>
                    Decline
                  </Button>
                </>
              )}
              {isNurse && a.status === 'confirmed' && (
                <>
                  <Button size="sm" onClick={() => setStatus(a.id, 'completed')}>
                    Mark completed
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRescheduling(a.id)}>
                    Reschedule
                  </Button>
                </>
              )}
              {!isNurse && (
                <Button size="sm" variant="secondary" onClick={() => setStatus(a.id, 'cancelled')}>
                  Cancel request
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <SectionTitle>Past</SectionTitle>
          <div className="space-y-2">
            {past.map((a) => (
              <Card key={a.id} className="opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{fmtDateTime(a.scheduled_at)}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{a.other_name}</p>
                  </div>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------------------------- Profile ---------------------------------- */

export function ProfilePage() {
  const { user, role, profile, refresh, signOut } = useAuth()
  const { nurse, reload: reloadNurse } = useMyNurse()
  const [f, setF] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    dob: profile?.dob ?? '',
    gender: profile?.gender ?? '',
    emergency_contact: profile?.emergency_contact ?? '',
    license_number: profile?.license_number ?? '',
    specialty: profile?.specialty ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const isNurse = role === 'nurse'

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setSaved(false)
    setF((p) => ({ ...p, [k]: e.target.value }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    if (f.full_name.trim().length < 2) return setError('Please enter your full name.')
    setBusy(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: f.full_name.trim(),
        phone: f.phone.trim() || null,
        ...(isNurse
          ? { license_number: f.license_number.trim() || null, specialty: f.specialty.trim() || null }
          : { dob: f.dob || null, gender: f.gender || null, emergency_contact: f.emergency_contact.trim() || null }),
      })
      .eq('id', user.id)
    setBusy(false)
    if (err) return setError(errMsg(err))
    await refresh()
    setSaved(true)
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={profile?.full_name} size={56} />
        <div>
          <h1 className="text-xl font-bold">{profile?.full_name || 'Your profile'}</h1>
          <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
            {role} · {user?.email}
          </p>
        </div>
      </div>

      {!isNurse && (
        <Card className="mt-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Your nurse</p>
          {nurse ? (
            <div className="mt-1 flex items-center gap-3">
              <Avatar name={nurse.full_name} />
              <div className="flex-1">
                <p className="font-semibold">{nurse.full_name}</p>
                <p className="text-sm text-slate-500">{nurse.specialty}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setChanging((c) => !c)}>
                {changing ? 'Close' : 'Change'}
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-sm">No nurse chosen yet.</p>
          )}
          {(changing || !nurse) && (
            <div className="mt-3">
              <ChooseNurse
                currentId={nurse?.id}
                onDone={() => {
                  setChanging(false)
                  reloadNurse()
                }}
              />
            </div>
          )}
        </Card>
      )}

      <form onSubmit={save} className="mt-4 space-y-4">
        <Field label="Full name">
          <Input value={f.full_name} onChange={set('full_name')} required />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={f.phone} onChange={set('phone')} />
        </Field>
        {isNurse ? (
          <>
            <Field label="License number">
              <Input value={f.license_number} onChange={set('license_number')} />
            </Field>
            <Field label="Specialty">
              <Input value={f.specialty} onChange={set('specialty')} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Date of birth">
              <Input type="date" value={f.dob} onChange={set('dob')} />
            </Field>
            <Field label="Gender">
              <Input value={f.gender} onChange={set('gender')} />
            </Field>
            <Field label="Emergency contact">
              <Input value={f.emergency_contact} onChange={set('emergency_contact')} />
            </Field>
          </>
        )}
        <ErrorBanner message={error} />
        {saved && <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Profile saved.</p>}
        <Button type="submit" loading={busy} className="w-full">
          <Save className="h-4 w-4" /> Save changes
        </Button>
      </form>

      <Button variant="secondary" className="mt-6 w-full" onClick={() => signOut()}>
        <LogOut className="h-4 w-4" /> Log out
      </Button>
    </div>
  )
}
