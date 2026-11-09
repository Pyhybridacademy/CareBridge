import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from './ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'careconnect-install-dismissed'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

/** Shows an "Install app" banner (Android/Chrome/Edge) or "Add to Home Screen" hint (iPhone Safari). */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(true)
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      // storage unavailable
    }
    if (isStandalone() || dismissed) return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setHidden(false)
    }
    window.addEventListener('beforeinstallprompt', handler)
    if (isIos) setHidden(false)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [isIos])

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    setHidden(true)
  }

  if (hidden || (!deferred && !isIos)) return null

  return (
    <div className="flex items-center gap-3 border-b border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
      {deferred ? <Download className="h-5 w-5 shrink-0" /> : <Share className="h-5 w-5 shrink-0" />}
      <p className="flex-1">
        {deferred ? 'Install CareConnect for quick access, like an app.' : 'To install: tap the Share button, then “Add to Home Screen”.'}
      </p>
      {deferred && (
        <Button size="sm" onClick={install}>
          Install
        </Button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-full p-1 hover:bg-teal-100 dark:hover:bg-teal-900">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
