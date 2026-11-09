import { useEffect, useState } from 'react'
import { Save, ShieldCheck, Trash2, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Button, Card, Input, Spinner } from '../../components/ui'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [settings, setSettings] = useState({ site_name: 'CareBridge', seo_title: 'CareBridge', seo_description: '', registration_enabled: true })
  const [people, setPeople] = useState<Array<{ user_id: string; role: string; full_name: string; email?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: setting }, { data: roles }] = await Promise.all([
        supabase.from('site_settings').select('site_name,seo_title,seo_description,registration_enabled').eq('id', true).maybeSingle(),
        supabase.from('user_roles').select('user_id,role,profiles(full_name)'),
      ])
      if (setting) setSettings(setting)
      setPeople((roles ?? []).map((row: any) => ({ user_id: row.user_id, role: row.role, full_name: row.profiles?.full_name || 'Unnamed account' })))
      setLoading(false)
    }
    load()
  }, [])

  async function saveSettings() {
    if (!user) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('site_settings').update({ ...settings, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', true)
    setMessage(error ? 'Could not save settings.' : 'Settings saved.')
    setSaving(false)
  }

  async function removeAccess(userId: string) {
    if (userId === user?.id || !window.confirm('Remove this person’s CareBridge role? Their auth account will not be deleted.')) return
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId)
    if (error) {
      setMessage('Could not remove access.')
      return
    }
    setPeople((current) => current.filter((person) => person.user_id !== userId))
    setMessage('Access removed.')
  }

  if (loading) return <Spinner label="Loading management tools…" />
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
    <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-600">Administration</p><h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">CareBridge management</h1><p className="mt-2 text-slate-600 dark:text-slate-300">Control access, staff, patients, and the public site.</p></div>
    <section className="grid gap-4 md:grid-cols-3"><Card><Users className="h-5 w-5 text-teal-600" /><p className="mt-3 text-2xl font-bold">{people.length}</p><p className="text-sm text-slate-500">Managed accounts</p></Card><Card><ShieldCheck className="h-5 w-5 text-teal-600" /><p className="mt-3 text-2xl font-bold">{people.filter((p) => p.role === 'nurse').length}</p><p className="text-sm text-slate-500">Nurses</p></Card><Card><p className="text-sm font-semibold text-slate-500">Registration</p><p className="mt-3 text-lg font-bold">{settings.registration_enabled ? 'Open' : 'Admin only'}</p><p className="text-sm text-slate-500">Public sign-up status</p></Card></section>
    <Card><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Site settings</h2><p className="text-sm text-slate-500">Update branding, SEO, and public access.</p></div><Button onClick={saveSettings} disabled={saving}><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save changes'}</Button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className="mb-1 block text-sm font-semibold">Site name</span><Input value={settings.site_name} onChange={(e) => setSettings({ ...settings, site_name: e.target.value })} /></label><label><span className="mb-1 block text-sm font-semibold">SEO title</span><Input value={settings.seo_title} onChange={(e) => setSettings({ ...settings, seo_title: e.target.value })} /></label><label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">SEO description</span><textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={settings.seo_description} onChange={(e) => setSettings({ ...settings, seo_description: e.target.value })} /></label><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.registration_enabled} onChange={(e) => setSettings({ ...settings, registration_enabled: e.target.checked })} /> Allow public registration</label></div>{message && <p className="mt-3 text-sm text-teal-700">{message}</p>}</Card>
    <Card><h2 className="text-lg font-bold">People</h2><p className="mb-4 text-sm text-slate-500">Existing accounts and assigned roles.</p><div className="divide-y divide-slate-100 dark:divide-slate-800">{people.map((person) => <div key={person.user_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="font-medium">{person.full_name}</span><span className="ml-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold capitalize text-teal-700 dark:bg-teal-950 dark:text-teal-300">{person.role}</span></div><Button variant="secondary" size="sm" onClick={() => removeAccess(person.user_id)} disabled={person.user_id === user?.id}><Trash2 className="h-4 w-4" />Remove access</Button></div>)}</div></Card>
  </main>
}
