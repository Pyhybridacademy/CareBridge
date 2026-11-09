import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, configured } from './supabase'
import type { Profile, Role } from '../types'

interface AuthState {
  session: Session | null
  user: User | null
  role: Role | null
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(configured)

  const loadUserData = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setRole(null)
      setProfile(null)
      return
    }
    const [r, p] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    ])
    setRole((r.data?.role as Role | undefined) ?? null)
    setProfile((p.data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    if (!configured) return
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadUserData(data.session?.user.id)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Defer to avoid deadlocks inside the auth callback
      setTimeout(() => {
        loadUserData(s?.user.id)
      }, 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadUserData])

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    role,
    profile,
    loading,
    refresh: () => loadUserData(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut()
      setRole(null)
      setProfile(null)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
