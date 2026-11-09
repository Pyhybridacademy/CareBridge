import { useState, type FormEvent } from 'react'
import { Camera, Mic, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { errMsg } from '../../lib/format'
import { extFor, uploadMedia } from '../../lib/media'
import type { PatientRecord, TreatmentItem, TreatmentPlan } from '../../types'
import Recorder from '../../components/Recorder'
import { AudioPlayer, VideoPlayer } from '../../components/MediaPlayers'
import { Button, Card, ErrorBanner, Field, Input, Select, Textarea } from '../../components/ui'

/* ------------------------------ Visit documentation ------------------------------ */

export function RecordForm({ patientId, record, onDone, onCancel }: { patientId: string; record?: PatientRecord; onDone: () => void; onCancel: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState({
    visit_date: record?.visit_date ?? new Date().toISOString().slice(0, 10),
    symptoms: record?.symptoms ?? '',
    blood_pressure: record?.blood_pressure ?? '',
    temperature: record?.temperature?.toString() ?? '',
    pulse: record?.pulse?.toString() ?? '',
    weight: record?.weight?.toString() ?? '',
    spo2: record?.spo2?.toString() ?? '',
    diagnosis_notes: record?.diagnosis_notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    const num = (s: string) => (s.trim() === '' ? null : Number(s))
    const temperature = num(f.temperature)
    const pulse = num(f.pulse)
    const weight = num(f.weight)
    const spo2 = num(f.spo2)
    if (f.blood_pressure && !/^\d{2,3}\/\d{2,3}$/.test(f.blood_pressure.trim())) return setError('Blood pressure should look like 120/80.')
    if (temperature != null && (isNaN(temperature) || temperature < 30 || temperature > 45)) return setError('Temperature should be between 30 and 45 °C.')
    if (pulse != null && (isNaN(pulse) || pulse < 20 || pulse > 250)) return setError('Pulse should be between 20 and 250.')
    if (weight != null && (isNaN(weight) || weight <= 0 || weight > 500)) return setError('Enter a valid weight in kg.')
    if (spo2 != null && (isNaN(spo2) || spo2 < 50 || spo2 > 100)) return setError('SpO₂ should be between 50 and 100.')
    if (!f.symptoms.trim() && !f.diagnosis_notes.trim() && !f.blood_pressure && temperature == null && pulse == null && weight == null && spo2 == null)
      return setError('Add at least some symptoms, vitals or notes.')

    const row = {
      visit_date: f.visit_date,
      symptoms: f.symptoms.trim() || null,
      blood_pressure: f.blood_pressure.trim() || null,
      temperature,
      pulse,
      weight,
      spo2,
      diagnosis_notes: f.diagnosis_notes.trim() || null,
    }
    setBusy(true)
    const { error: err } = record
      ? await supabase.from('patient_records').update(row).eq('id', record.id)
      : await supabase.from('patient_records').insert({ ...row, patient_id: patientId, nurse_id: user.id })
    setBusy(false)
    if (err) return setError(errMsg(err))
    onDone()
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <p className="font-semibold">{record ? 'Edit visit note' : 'New visit note'}</p>
        <Field label="Visit date">
          <Input type="date" value={f.visit_date} onChange={set('visit_date')} required />
        </Field>
        <Field label="Symptoms">
          <Textarea value={f.symptoms} onChange={set('symptoms')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blood pressure" hint="e.g. 120/80">
            <Input inputMode="numeric" value={f.blood_pressure} onChange={set('blood_pressure')} />
          </Field>
          <Field label="Temperature °C">
            <Input inputMode="decimal" value={f.temperature} onChange={set('temperature')} />
          </Field>
          <Field label="Pulse (bpm)">
            <Input inputMode="numeric" value={f.pulse} onChange={set('pulse')} />
          </Field>
          <Field label="Weight (kg)">
            <Input inputMode="decimal" value={f.weight} onChange={set('weight')} />
          </Field>
          <Field label="SpO₂ %">
            <Input inputMode="numeric" value={f.spo2} onChange={set('spo2')} />
          </Field>
        </div>
        <Field label="Diagnosis / clinical notes">
          <Textarea rows={4} value={f.diagnosis_notes} onChange={set('diagnosis_notes')} />
        </Field>
        <ErrorBanner message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            Save note
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

/* -------------------------------- Treatment plans -------------------------------- */

type ItemDraft = Pick<TreatmentItem, 'medication_or_task' | 'dosage' | 'frequency' | 'duration' | 'instructions' | 'media_path'> & { id?: string }

const blankItem = (): ItemDraft => ({ medication_or_task: '', dosage: '', frequency: '', duration: '', instructions: '', media_path: null })

export function PlanEditor({ patientId, plan, onDone, onCancel }: { patientId: string; plan?: TreatmentPlan; onDone: () => void; onCancel: () => void }) {
  const { user } = useAuth()
  const [title, setTitle] = useState(plan?.title ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [endDate, setEndDate] = useState(plan?.end_date ?? '')
  const [status, setStatus] = useState<'active' | 'completed'>(plan?.status ?? 'active')
  const [items, setItems] = useState<ItemDraft[]>(
    plan?.treatment_items?.length
      ? plan.treatment_items.map((i) => ({
          id: i.id,
          medication_or_task: i.medication_or_task,
          dosage: i.dosage,
          frequency: i.frequency,
          duration: i.duration,
          instructions: i.instructions,
          media_path: i.media_path,
        }))
      : [blankItem()],
  )
  const [recordFor, setRecordFor] = useState<{ index: number; kind: 'voice' | 'video' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patchItem = (i: number, patch: Partial<ItemDraft>) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    if (!title.trim()) return setError('Give the plan a title.')
    const filled = items.filter((i) => i.medication_or_task.trim())
    if (filled.length === 0) return setError('Add at least one medication or task.')
    setBusy(true)
    try {
      let planId = plan?.id
      const planRow = { title: title.trim(), description: description.trim() || null, end_date: endDate || null, status }
      if (plan) {
        const { error: err } = await supabase.from('treatment_plans').update(planRow).eq('id', plan.id)
        if (err) throw err
        // remove items the nurse deleted
        const keep = new Set(filled.filter((i) => i.id).map((i) => i.id))
        const removed = (plan.treatment_items ?? []).filter((i) => !keep.has(i.id)).map((i) => i.id)
        if (removed.length) {
          const { error: dErr } = await supabase.from('treatment_items').delete().in('id', removed)
          if (dErr) throw dErr
        }
      } else {
        const { data, error: err } = await supabase
          .from('treatment_plans')
          .insert({ ...planRow, patient_id: patientId, nurse_id: user.id })
          .select('id')
          .single()
        if (err) throw err
        planId = data.id as string
      }
      for (const it of filled) {
        const row = {
          medication_or_task: it.medication_or_task.trim(),
          dosage: it.dosage?.trim() || null,
          frequency: it.frequency?.trim() || null,
          duration: it.duration?.trim() || null,
          instructions: it.instructions?.trim() || null,
          media_path: it.media_path || null,
        }
        const { error: err } = it.id
          ? await supabase.from('treatment_items').update(row).eq('id', it.id)
          : await supabase.from('treatment_items').insert({ ...row, plan_id: planId })
        if (err) throw err
      }
      onDone()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <p className="font-semibold">{plan ? 'Edit treatment plan' : 'New treatment plan'}</p>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hypertension care plan" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="End date (optional)">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          {plan && (
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'completed')}>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>
          )}
        </div>

        <p className="pt-1 text-sm font-semibold">Medication and tasks</p>
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Item {i + 1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} aria-label={`Remove item ${i + 1}`} className="rounded-full p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <Input placeholder="Medication or task" value={it.medication_or_task} onChange={(e) => patchItem(i, { medication_or_task: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Dosage" value={it.dosage ?? ''} onChange={(e) => patchItem(i, { dosage: e.target.value })} />
              <Input placeholder="Frequency" value={it.frequency ?? ''} onChange={(e) => patchItem(i, { frequency: e.target.value })} />
              <Input placeholder="Duration" value={it.duration ?? ''} onChange={(e) => patchItem(i, { duration: e.target.value })} />
            </div>
            <Textarea rows={2} placeholder="Instructions for the patient" value={it.instructions ?? ''} onChange={(e) => patchItem(i, { instructions: e.target.value })} />
            {it.media_path ? (
              <div className="flex items-center gap-2">
                {it.media_path.includes('/video-') ? <VideoPlayer path={it.media_path} /> : <AudioPlayer path={it.media_path} />}
                <button type="button" onClick={() => patchItem(i, { media_path: null })} aria-label="Remove recording" className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setRecordFor({ index: i, kind: 'voice' })}>
                  <Mic className="h-4 w-4" /> Voice note
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setRecordFor({ index: i, kind: 'video' })}>
                  <Camera className="h-4 w-4" /> Video note
                </Button>
              </div>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setItems((p) => [...p, blankItem()])}>
          <Plus className="h-4 w-4" /> Add another item
        </Button>

        <ErrorBanner message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            Save plan
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>

      {recordFor && user && (
        <Recorder
          kind={recordFor.kind}
          onCancel={() => setRecordFor(null)}
          onSend={async (r, onProgress) => {
            const path = await uploadMedia(r.blob, user.id, extFor(r.mime, 'webm'), onProgress, recordFor.kind)
            patchItem(recordFor.index, { media_path: path })
            setRecordFor(null)
          }}
        />
      )}
    </Card>
  )
}
