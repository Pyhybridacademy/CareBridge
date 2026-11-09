import { useEffect, useState } from 'react'
import { UserRoundCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errMsg } from '../lib/format'
import type { Profile } from '../types'
import { Avatar, Button, Card, Empty, ErrorBanner, ListSkeleton } from './ui'

/** Lets a patient pick the nurse who will look after them. Creates the assignment that unlocks chat and records. */
export default function ChooseNurse({ onDone, currentId }: { onDone: () => void; currentId?: string }) {
  const { user } = useAuth()
  const [nurses, setNurses] = useState<Profile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // profiles_select lets any signed-in user read nurse profiles; filter to nurses via user_roles join on assignments is not possible,
    // so we ask for profiles that have a license number (only nurses fill that in).
    supabase
      .from('profiles')
      .select('*')
      .not('license_number', 'is', null)
      .order('full_name')
      .then(({ data, error: err }) => {
        if (err) setError(errMsg(err))
        setNurses(((data as Profile[]) ?? []).filter((n) => n.id !== currentId))
      })
  }, [currentId])

  async function choose(nurseId: string) {
    if (!user) return
    setBusy(nurseId)
    setError(null)
    try {
      // end any previous assignment
      await supabase.from('nurse_patient_assignments').update({ status: 'ended' }).eq('patient_id', user.id).eq('status', 'active')
      const { data: existing } = await supabase
        .from('nurse_patient_assignments')
        .select('id')
        .eq('patient_id', user.id)
        .eq('nurse_id', nurseId)
        .maybeSingle()
      if (existing) {
        const { error: err } = await supabase.from('nurse_patient_assignments').update({ status: 'active' }).eq('id', existing.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('nurse_patient_assignments').insert({ patient_id: user.id, nurse_id: nurseId, status: 'active' })
        if (err) throw err
      }
      onDone()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <ErrorBanner message={error} />
      {!nurses && <ListSkeleton />}
      {nurses && nurses.length === 0 && (
        <Empty icon={<UserRoundCheck className="h-8 w-8" />} title="No nurses available yet" text="Nurses need to create an account first. Check back soon." />
      )}
      {nurses?.map((n) => (
        <Card key={n.id} className="flex items-center gap-3">
          <Avatar name={n.full_name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{n.full_name}</p>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{n.specialty || 'Nurse'}</p>
          </div>
          <Button size="sm" loading={busy === n.id} onClick={() => choose(n.id)}>
            Choose
          </Button>
        </Card>
      ))}
    </div>
  )
}
