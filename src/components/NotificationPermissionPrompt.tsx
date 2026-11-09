import { Bell, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { enableNotificationSound } from '../lib/notification-sound'

export default function NotificationPermissionPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!('Notification' in window)) return
    setPermission(Notification.permission)
    setOpen(Notification.permission === 'default')
  }, [])

  if (!open || permission !== 'default') return null

  const requestPermission = async () => {
    await enableNotificationSound()
    const result = await Notification.requestPermission()
    setPermission(result)
    setOpen(result !== 'granted')
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md rounded-2xl border border-teal-200 bg-white p-4 shadow-2xl dark:border-teal-900 dark:bg-slate-900" role="dialog" aria-labelledby="notification-permission-title">
      <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Remind me later">
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3 pr-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h2 id="notification-permission-title" className="font-semibold">Turn on notifications</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Get instant alerts for new messages, appointments, and care updates.</p>
        </div>
      </div>
      <button onClick={requestPermission} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
        <Volume2 className="h-4 w-4" />
        Allow notifications and sound
      </button>
    </div>
  )
}
