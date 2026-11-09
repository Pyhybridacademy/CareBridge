import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, ClipboardList, Home, MessageCircle, User, Users, HeartPulse } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import InstallPrompt from './InstallPrompt'
import NotificationPermissionPrompt from './NotificationPermissionPrompt'
import { playNotificationSound } from '../lib/notification-sound'
import { cx } from './ui'

interface Tab {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
  badge?: number
}

export default function AppShell() {
  const { user, role, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unreadMsgs, setUnreadMsgs] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)

  useEffect(() => {
    if (!user) return
    let live = true
    const refresh = async () => {
      const [m, n] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id).is('read_at', null),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
      ])
      if (!live) return
      setUnreadMsgs(m.count ?? 0)
      setUnreadNotifs(n.count ?? 0)
    }
    refresh()
    const announce = (title: string, body: string) => {
      playNotificationSound()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/pwa-192x192.png', tag: 'carebridge-update' })
      }
    }
    const handleMessage = (payload: { new: { sender_name?: string; body?: string } }) => {
      announce(`New message${payload.new.sender_name ? ` from ${payload.new.sender_name}` : ''}`, payload.new.body || 'You have a new care message.')
      refresh()
    }
    const handleNotification = (payload: { new: { title?: string; message?: string; body?: string } }) => {
      announce(payload.new.title || 'CareBridge update', payload.new.message || payload.new.body || 'You have a new care update.')
      refresh()
    }
    const ch = supabase
      .channel(`shell-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, handleMessage)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, handleNotification)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe()
    return () => {
      live = false
      supabase.removeChannel(ch)
    }
  }, [user, location.pathname])

  const tabs: Tab[] =
    role === 'nurse'
      ? [
          { to: '/app', label: 'Home', icon: Home, end: true },
          { to: '/app/patients', label: 'Patients', icon: Users },
          { to: '/app/messages', label: 'Messages', icon: MessageCircle, badge: unreadMsgs },
          { to: '/app/appointments', label: 'Visits', icon: CalendarDays },
          { to: '/app/profile', label: 'Profile', icon: User },
        ]
      : [
          { to: '/app', label: 'Home', icon: Home, end: true },
          { to: '/app/messages', label: 'Messages', icon: MessageCircle, badge: unreadMsgs },
          { to: '/app/appointments', label: 'Visits', icon: CalendarDays },
          { to: '/app/records', label: 'Records', icon: ClipboardList },
          { to: '/app/profile', label: 'Profile', icon: User },
        ]

  // Chat screens use the full height; other pages scroll normally
  const isChat = /^\/app\/messages\/.+/.test(location.pathname) || (role === 'patient' && location.pathname === '/app/messages')

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col bg-[#f1f7f8] dark:bg-[#0b1a1e]">
      <header className="safe-top flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">CareBridge</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {role === 'admin' ? 'Administrator' : role === 'nurse' ? 'Nurse' : 'Patient'} · {profile?.full_name || 'Welcome'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/app/notifications')}
          className="relative rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={`Notifications${unreadNotifs ? `, ${unreadNotifs} unread` : ''}`}
        >
          <Bell className="h-6 w-6" />
          {unreadNotifs > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unreadNotifs > 9 ? '9+' : unreadNotifs}
            </span>
          )}
        </button>
      </header>

      <InstallPrompt />

      <main className={cx('min-h-0 flex-1 px-4', isChat ? 'flex flex-col overflow-hidden pb-1 pt-2' : 'overflow-y-auto py-4')}>
        <div className={cx('page-in', isChat && 'flex min-h-0 flex-1 flex-col')} key={location.pathname}>
          <Outlet />
        </div>
        {!isChat && (
          <p className="mt-8 pb-2 text-center text-xs text-slate-500 dark:text-slate-400">
            Not for emergencies. Call your local emergency number.
          </p>
        )}
      </main>

      <nav className="safe-bottom border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label="Main navigation">
        <ul className="grid grid-cols-5">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                    isActive ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500 dark:text-slate-400',
                  )
                }
              >
                <t.icon className="h-6 w-6" />
                {t.label}
                {!!t.badge && (
                  <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {t.badge > 9 ? '9+' : t.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
