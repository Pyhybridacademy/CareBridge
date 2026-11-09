import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Camera, ClipboardList, MessageCircle, Mic, UserRoundPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useMyNurse } from '../../lib/hooks'
import { errMsg, fmtDate, fmtDateTime } from '../../lib/format'
import type { Appointment, PatientRecord, TreatmentPlan } from '../../types'
import Chat from '../../components/Chat'
import ChooseNurse from '../../components/ChooseNurse'
import PlanView from '../../components/PlanView'
import { Avatar, Badge, Card, Empty, ErrorBanner, ListSkeleton, SectionTitle, Skeleton, statusTone } from '../../components/ui'

function NurseGate({ children }: { children: (nurseId: string, nurseName: string) => React.ReactNode }) {
  const { nurse, loading, reload } = useMyNurse()
  if (loading) return <ListSkeleton rows={2} />
  if (!nurse)
    return (
      <div>
        <Empty
          icon={<UserRoundPlus className="h-9 w-9" />}
          title="Choose your nurse"
          text="Pick the nurse who will look after you. You can message, send voice and video notes, and book visits once you have chosen."
        />
        <div className="mt-4">
          <ChooseNurse onDone={reload} />
        </div>
      </div>
    )
  return <>{children(nurse.id, nurse.full_name)}</>
}

/* ----------------------------------- Home ----------------------------------- */

export function PatientHome() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { nurse, loading: nurseLoading, reload } = useMyNurse()
  const [appt, setAppt] = useState<Appointment | null | undefined>(undefined)
  const [plan, setPlan] = useState<TreatmentPlan | null | undefined>(undefined)

  useEffect(() => {
    if (!user) return
    supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', user.id)
      .in('status', ['requested', 'confirmed'])
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAppt((data as Appointment | null) ?? null))
    supabase
      .from('treatment_plans')
      .select('*, treatment_items(*)')
      .eq('patient_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPlan((data as TreatmentPlan | null) ?? null))
  }, [user])

  const first = profile?.full_name?.split(' ')[0]

  if (!nurseLoading && !nurse)
    return (
      <div>
        <h1 className="text-2xl font-bold">Hello{first ? `, ${first}` : ''} 👋</h1>
        <p className="mb-4 mt-1 text-slate-600 dark:text-slate-300">First, choose the nurse who will care for you.</p>
        <ChooseNurse onDone={reload} />
      </div>
    )

  const actions = [
    { icon: MessageCircle, label: 'Message my nurse', to: '/app/messages' },
    { icon: Mic, label: 'Send voice note', to: '/app/messages?record=voice' },
    { icon: Camera, label: 'Send video note', to: '/app/messages?record=video' },
    { icon: CalendarDays, label: 'Book appointment', to: '/app/appointments' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold">Hello{first ? `, ${first}` : ''} 👋</h1>
      {nurse && (
        <Card className="mt-3 flex items-center gap-3">
          <Avatar name={nurse.full_name} size={48} />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your nurse</p>
            <p className="font-semibold">{nurse.full_name}</p>
            <p className="text-sm text-slate-500">{nurse.specialty}</p>
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate(a.to)}
            className="flex min-h-24 flex-col items-start justify-between rounded-2xl bg-teal-600 p-3 text-left text-white shadow-sm active:bg-teal-700"
          >
            <a.icon className="h-6 w-6" />
            <span className="font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      <SectionTitle>Next appointment</SectionTitle>
      {appt === undefined ? (
        <Skeleton className="h-20" />
      ) : appt ? (
        <Card className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{fmtDateTime(appt.scheduled_at)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{appt.reason}</p>
          </div>
          <Badge tone={statusTone(appt.status)}>{appt.status}</Badge>
        </Card>
      ) : (
        <Empty title="No upcoming appointments" action={<Link to="/app/appointments" className="text-sm font-semibold text-teal-700 underline dark:text-teal-300">Book one</Link>} />
      )}

      <SectionTitle>Active treatment plan</SectionTitle>
      {plan === undefined ? (
        <Skeleton className="h-28" />
      ) : plan ? (
        <Link to="/app/records">
          <PlanView plan={plan} />
        </Link>
      ) : (
        <Empty icon={<ClipboardList className="h-8 w-8" />} title="No active plan" text="Your nurse will add one after your visit." />
      )}
    </div>
  )
}

/* --------------------------------- Messages --------------------------------- */

export function PatientMessages() {
  return (
    <NurseGate>
      {(nurseId, nurseName) => (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-3 pb-2">
            <Avatar name={nurseName} />
            <div>
              <p className="font-semibold">{nurseName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Your nurse</p>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Chat peerId={nurseId} />
          </div>
        </div>
      )}
    </NurseGate>
  )
}

/* --------------------------------- Records ---------------------------------- */

export function PatientRecords() {
  const { user } = useAuth()
  const [records, setRecords] = useState<PatientRecord[] | null>(null)
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const [r, p] = await Promise.all([
      supabase.from('patient_records').select('*').eq('patient_id', user.id).order('visit_date', { ascending: false }),
      supabase.from('treatment_plans').select('*, treatment_items(*)').eq('patient_id', user.id).order('created_at', { ascending: false }),
    ])
    if (r.error || p.error) setError(errMsg(r.error ?? p.error))
    setRecords((r.data as PatientRecord[]) ?? [])
    setPlans((p.data as TreatmentPlan[]) ?? [])
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(itemId: string, done: boolean) {
    // optimistic update
    setPlans((prev) =>
      prev?.map((pl) => ({ ...pl, treatment_items: pl.treatment_items?.map((i) => (i.id === itemId ? { ...i, is_completed: done } : i)) })) ?? prev,
    )
    const { error: err } = await supabase.rpc('toggle_treatment_item', { p_item: itemId, p_done: done })
    if (err) {
      setError(errMsg(err))
      load()
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold">My records</h1>
      <ErrorBanner message={error} />

      <SectionTitle>Treatment plans</SectionTitle>
      {!plans && <ListSkeleton rows={2} />}
      {plans?.length === 0 && <Empty icon={<ClipboardList className="h-8 w-8" />} title="No treatment plans yet" />}
      <div className="space-y-3">
        {plans?.map((p) => (
          <PlanView key={p.id} plan={p} onToggle={toggle} />
        ))}
      </div>

      <SectionTitle>Visit notes</SectionTitle>
      {!records && <ListSkeleton rows={2} />}
      {records?.length === 0 && <Empty title="No visit notes yet" text="Notes from your nurse appear here after each visit." />}
      <div className="space-y-3">
        {records?.map((r) => (
          <Card key={r.id}>
            <p className="font-semibold">{fmtDate(r.visit_date)}</p>
            <Vitals r={r} />
            {r.symptoms && (
              <p className="mt-2 text-sm">
                <span className="font-medium">Symptoms: </span>
                {r.symptoms}
              </p>
            )}
            {r.diagnosis_notes && (
              <p className="mt-1 text-sm">
                <span className="font-medium">Notes: </span>
                {r.diagnosis_notes}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

export function Vitals({ r }: { r: PatientRecord }) {
  const v = [
    r.blood_pressure && `BP ${r.blood_pressure}`,
    r.temperature != null && `${r.temperature}°C`,
    r.pulse != null && `Pulse ${r.pulse}`,
    r.weight != null && `${r.weight} kg`,
    r.spo2 != null && `SpO₂ ${r.spo2}%`,
  ].filter(Boolean) as string[]
  if (v.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {v.map((t) => (
        <Badge key={t} tone="teal">
          {t}
        </Badge>
      ))}
    </div>
  )
}
