import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY)

// Placeholder values keep the app from crashing so we can show a friendly setup screen instead.
export const supabase = createClient(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_KEY || 'missing-key',
)
