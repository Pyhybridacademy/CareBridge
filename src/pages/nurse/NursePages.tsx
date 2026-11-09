import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, ChevronRight, ClipboardList, MessageCircle, Pencil, Plus, Search, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useMyPatients } from '../../lib/hooks'
import { errMsg, fmtDate, fmtDateTime, fmtTime, isToday } from '../../lib/format'
import type { Appointment, Message, PatientRecord, Profile, TreatmentPlan } from '../../types'
import Chat from '../../components/Chat'
import PlanView from '../../components/PlanView'
import { Avatar, Badge, Button, Card, Empty, ErrorBanner, Input, ListSkeleton, SectionTitle, Skeleton, cx, statusTone } from '../../components/ui'
import { Vitals } from '../patient/PatientPages'
import { PlanEditor, RecordForm } from './Forms'

/* ----------------------------------- Home ----------------------------------- */

export function NurseHome() {
  const { user, profile } = useAuth()
  const { patients, loading } = useMyPatients()
  const [appts, setAppts] = useState<(Appointment & { name: string })[] | null>(null)
  const [unread, setUnread] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('appointments')
        .select('*')
        .eq('nurse_id', user.id)
        .in('status', ['requested', 'confirmed'])
        .order('scheduled_at')
      const rows = (data as Appointment[]) ?? []
      const ids = [...new Set(rows.map((r) => r.patient_id))]
      const names = new Map<string, string>()
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        ;(ps ?? []).forEach((p) => names.set(p.id as string, p.full_name as string))
      }
      setAppts(rows.map((r) => ({ ...r, name: names.get(r.patient_id) ?? 'Patient' })))
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id).is('read_at', null)
      setUnread(count ?? 0)
    })()
  }, [user])

  const today = (appts ?? []).filter((a) => a.status === 'confirmed' && isToday(a.scheduled_at))
  const pending = (appts ?? []).filter((a) => a.status === 'requested')
  const first = profile?.full_name?.split(' ')[0]

  const stats = [
    { label: 'Patients', value: loading ? null : patients.length, icon: Users, to: '/app/patients' },
    { label: 'Pending requests', value: appts ? pending.length : null, icon: CalendarCheck, to: '/app/appointments' },
    { label: 'Unread messages', value: unread, icon: MessageCircle, to: '/app/messages' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold">Hello{first ? `, ${first}` : ''} 👋</h1>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="h-full text-center">
              <s.icon className="mx-auto h-5 w-5 text-teal-600" />
              <p className="mt-1 text-2xl font-bold">{s.value ?? '–'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle>Today’s appointments</SectionTitle>
      {!appts ? (
        <Skeleton className="h-20" />
      ) : today.length === 0 ? (
        <Empty title="Nothing scheduled for today" />
      ) : (
        <div className="space-y-2">
          {today.map((a) => (
            <Card key={a.id} className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{fmtTime(a.scheduled_at)} · {a.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{a.reason}</p>
              </div>
              <Link to={`/app/patients/${a.patient_id}`} className="text-sm font-semibold text-teal-700 dark:text-teal-300">
                Open
              </Link>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle action={<Link to="/app/appointments" className="text-sm font-semibold text-teal-700 dark:text-teal-300">Manage</Link>}>Pending requests</SectionTitle>
      {!appts ? (
        <Skeleton className="h-20" />
      ) : pending.length === 0 ? (
        <Empty title="No pending requests" />
      ) : (
        <div className="space-y-2">
          {pending.slice(0, 5).map((a) => (
            <Card key={a.id} className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{fmtDateTime(a.scheduled_at)}</p>
              </div>
              <Badge tone="amber">requested</Badge>
            </Card>
          ))}
        </div>
      )}

      {!loading && patients.length === 0 && (
        <Card className="mt-5">
          <p className="font-semibold">No patients yet</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Patients appear here after they choose you as their nurse. Ask them to sign up and select your name.</p>
        </Card>
      )}
    </div>
  )
}

/* --------------------------------- Patients --------------------------------- */

export function PatientsList() {
  const { patients, loading } = useMyPatients()
  const [q, setQ] = useState('')
  const filtered = useMemo(() => patients.filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase())), [patients, q])

  return (
    <div>
      <h1 className="text-xl font-bold">Patients</h1>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
        <Input className="pl-10" placeholder="Search patients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
      </div>
      <div className="mt-3 space-y-2">
        {loading && <ListSkeleton />}
        {!loading && patients.length === 0 && <Empty icon={<Users className="h-8 w-8" />} title="No patients yet" text="Patients appear here once they choose you as their nurse." />}
        {!loading && patients.length > 0 && filtered.length === 0 && <Empty title="No match" text="Try a different name." />}
        {filtered.map((p) => (
          <Link key={p.id} to={`/app/patients/${p.id}`}>
            <Card className="flex items-center gap-3">
              <Avatar name={p.full_name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.full_name}</p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{p.phone || 'No phone'}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- Patient detail ------------------------------- */

type Tab = 'overview' | 'records' | 'plans' | 'chat'

export function PatientDetail() {
  const { id } = useParams()
  const patientId = id!
  const { user } = useAuth()
  const [patient, setPatient] = useState<Profile | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('overview')
  const [records, setRecords] = useState<PatientRecord[] | null>(null)
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null)
  const [editingRecord, setEditingRecord] = useState<PatientRecord | 'new' | null>(null)
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, r, pl] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', patientId).maybeSingle(),
      supabase.from('patient_records').select('*').eq('patient_id', patientId).order('visit_date', { ascending: false }),
      supabase.from('treatment_plans').select('*, treatment_items(*)').eq('patient_id', patientId).order('created_at', { ascending: false }),
    ])
    setPatient((p.data as Profile | null) ?? null)
    if (r.error || pl.error) setError(errMsg(r.error ?? pl.error))
    setRecords((r.data as PatientRecord[]) ?? [])
    setPlans((pl.data as TreatmentPlan[]) ?? [])
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  async function deletePlan(p: TreatmentPlan) {
    if (!window.confirm(`Delete “${p.title}”? This cannot be undone.`)) return
    const { error: err } = await supabase.from('treatment_plans').delete().eq('id', p.id)
    if (err) setError(errMsg(err))
    load()
  }

  if (patient === undefined) return <ListSkeleton rows={3} />
  if (patient === null || !user)
    return (
      <Empty
        title="Patient not found"
        text="This patient is not assigned to you, or the link is wrong."
        action={
          <Link to="/app/patients">
            <Button variant="secondary">Back to patients</Button>
          </Link>
        }
      />
    )

  const age = patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31_557_600_000) : null
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'records', label: 'Records' },
    { id: 'plans', label: 'Plans' },
    { id: 'chat', label: 'Chat' },
  ]

  return (
    <div>
      <Link to="/app/patients" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-300">
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>
      <div className="flex items-center gap-3">
        <Avatar name={patient.full_name} size={56} />
        <div>
          <h1 className="text-xl font-bold">{patient.full_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{[age != null && `${age} yrs`, patient.gender].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('min-h-10 rounded-lg text-sm font-semibold', tab === t.id ? 'bg-white text-teal-700 shadow dark:bg-slate-600 dark:text-white' : 'text-slate-600 dark:text-slate-300')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />

      <div className="mt-4">
        {tab === 'overview' && (
          <div className="space-y-3">
            <Card>
              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <Detail label="Phone" value={patient.phone} />
                <Detail label="Date of birth" value={patient.dob ? fmtDate(patient.dob) : null} />
                <Detail label="Gender" value={patient.gender} />
                <Detail label="Emergency contact" value={patient.emergency_contact} />
              </dl>
            </Card>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => { setTab('records'); setEditingRecord('new') }}>
                <ClipboardList className="h-4 w-4" /> Note
              </Button>
              <Button variant="secondary" onClick={() => { setTab('plans'); setEditingPlan('new') }}>
                <Plus className="h-4 w-4" /> Plan
              </Button>
              <Button onClick={() => setTab('chat')}>
                <MessageCircle className="h-4 w-4" /> Chat
              </Button>
            </div>
            <SectionTitle>Latest visit</SectionTitle>
            {!records ? <Skeleton className="h-20" /> : records[0] ? <RecordCard r={records[0]} /> : <Empty title="No visits documented yet" />}
          </div>
        )}

        {tab === 'records' && (
          <div className="space-y-3">
            {editingRecord ? (
              <RecordForm
                patientId={patientId}
                record={editingRecord === 'new' ? undefined : editingRecord}
                onCancel={() => setEditingRecord(null)}
                onDone={() => {
                  setEditingRecord(null)
                  load()
                }}
              />
            ) : (
              <Button className="w-full" onClick={() => setEditingRecord('new')}>
                <Plus className="h-4 w-4" /> New visit note
              </Button>
            )}
            {!records && <ListSkeleton rows={2} />}
            {records?.length === 0 && !editingRecord && <Empty title="No visit notes yet" />}
            {records?.map((r) => (
              <RecordCard key={r.id} r={r} onEdit={() => setEditingRecord(r)} />
            ))}
          </div>
        )}

        {tab === 'plans' && (
          <div className="space-y-3">
            {editingPlan ? (
              <PlanEditor
                patientId={patientId}
                plan={editingPlan === 'new' ? undefined : editingPlan}
                onCancel={() => setEditingPlan(null)}
                onDone={() => {
                  setEditingPlan(null)
                  load()
                }}
              />
            ) : (
              <Button className="w-full" onClick={() => setEditingPlan('new')}>
                <Plus className="h-4 w-4" /> New treatment plan
              </Button>
            )}
            {!plans && <ListSkeleton rows={2} />}
            {plans?.length === 0 && !editingPlan && <Empty title="No treatment plans yet" />}
            {plans?.map((p) => (
              <PlanView
                key={p.id}
                plan={p}
                footer={
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditingPlan(p)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deletePlan(p)}>
                      Delete
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        )}

        {tab === 'chat' && (
          <div className="h-[60vh] min-h-80">
            <Chat peerId={patientId} />
          </div>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}

function RecordCard({ r, onEdit }: { r: PatientRecord; onEdit?: () => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="font-semibold">{fmtDate(r.visit_date)}</p>
        {onEdit && (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>
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
  )
}

/* --------------------------------- Messages ---------------------------------- */

interface Thread {
  patient: Profile
  last: Message | null
  unread: number
}

export function NurseMessagesList() {
  const { user } = useAuth()
  const { patients, loading } = useMyPatients()
  const [threads, setThreads] = useState<Thread[] | null>(null)

  useEffect(() => {
    if (!user || loading) return
    let live = true
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(300)
      if (!live) return
      const msgs = (data as Message[]) ?? []
      const t = patients.map((p) => {
        const mine = msgs.filter((m) => m.sender_id === p.id || m.receiver_id === p.id)
        return { patient: p, last: mine[0] ?? null, unread: mine.filter((m) => m.receiver_id === user.id && !m.read_at).length }
      })
      t.sort((a, b) => (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''))
      setThreads(t)
    }
    load()
    const ch = supabase
      .channel(`threads-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, load)
      .subscribe()
    return () => {
      live = false
      supabase.removeChannel(ch)
    }
  }, [user, patients, loading])

  const preview = (m: Message | null) => {
    if (!m) return 'No messages yet'
    const prefix = m.sender_id === user?.id ? 'You: ' : ''
    if (m.type === 'voice') return `${prefix}🎤 Voice note`
    if (m.type === 'video') return `${prefix}🎥 Video note`
    if (m.type === 'image') return `${prefix}📷 Photo`
    return `${prefix}${m.content ?? ''}`
  }

  return (
    <div>
      <h1 className="text-xl font-bold">Messages</h1>
      <div className="mt-3 space-y-2">
        {(loading || !threads) && <ListSkeleton />}
        {threads?.length === 0 && <Empty icon={<MessageCircle className="h-8 w-8" />} title="No conversations yet" text="You can message patients once they choose you as their nurse." />}
        {threads?.map((t) => (
          <Link key={t.patient.id} to={`/app/messages/${t.patient.id}`}>
            <Card className="flex items-center gap-3">
              <Avatar name={t.patient.full_name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{t.patient.full_name}</p>
                  {t.last && <span className="shrink-0 text-xs text-slate-500">{isToday(t.last.created_at) ? fmtTime(t.last.created_at) : fmtDate(t.last.created_at)}</span>}
                </div>
                <p className={cx('truncate text-sm', t.unread ? 'font-semibold' : 'text-slate-500 dark:text-slate-400')}>{preview(t.last)}</p>
              </div>
              {t.unread > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-teal-600 px-1.5 text-xs font-bold text-white">{t.unread}</span>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function NurseThread() {
  const { peerId } = useParams()
  const navigate = useNavigate()
  const [peer, setPeer] = useState<Profile | null | undefined>(undefined)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('id', peerId!)
      .maybeSingle()
      .then(({ data }) => setPeer((data as Profile | null) ?? null))
  }, [peerId])

  if (peer === undefined) return <ListSkeleton rows={2} />
  if (!peer) return <Empty title="Conversation not available" text="This patient is not assigned to you." />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 pb-2">
        <button onClick={() => navigate('/app/messages')} aria-label="Back to messages" className="rounded-full p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={peer.full_name} />
        <Link to={`/app/patients/${peer.id}`} className="font-semibold">
          {peer.full_name}
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <Chat peerId={peer.id} />
      </div>
    </div>
  )
}
