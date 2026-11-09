import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import type { Profile } from '../types'

/** The patient's active nurse (or null if they have not picked one yet). */
export function useMyNurse() {
  const { user } = useAuth()
  const [nurse, setNurse] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!user) return
    const { data: a } = await supabase
      .from('nurse_patient_assignments')
      .select('nurse_id')
      .eq('patient_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!a) {
      setNurse(null)
      setLoading(false)
      return
    }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', a.nurse_id).maybeSingle()
    setNurse((p as Profile | null) ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    reload()
  }, [reload])

  return { nurse, loading, reload }
}

/** The nurse's active patients. */
export function useMyPatients() {
  const { user } = useAuth()
  const [patients, setPatients] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!user) return
    const { data: a } = await supabase
      .from('nurse_patient_assignments')
      .select('patient_id')
      .eq('nurse_id', user.id)
      .eq('status', 'active')
    const ids = (a ?? []).map((r) => r.patient_id as string)
    if (ids.length === 0) {
      setPatients([])
      setLoading(false)
      return
    }
    const { data: p } = await supabase.from('profiles').select('*').in('id', ids).order('full_name')
    setPatients((p as Profile[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    reload()
  }, [reload])

  return { patients, loading, reload }
}
