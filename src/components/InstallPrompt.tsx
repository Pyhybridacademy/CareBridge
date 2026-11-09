import { useEffect, useState } from 'react'
import { Download, Share } from 'lucide-react'
import { Button } from './ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function getPlatform() {
  const userAgent = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios' as const
  if (/android/.test(userAgent)) return 'android' as const
  return 'other' as const
}

/** Blocks browser use until CareBridge is installed, with platform-specific instructions. */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [platform] = useState(getPlatform)

  useEffect(() => {
    if (installed || platform === 'other') return
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true), { once: true })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [installed, platform])

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') setInstalled(true)
  }

  if (installed || platform === 'other') return null

  const isIos = platform === 'ios'
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 sm:p-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          {isIos ? <Share className="h-7 w-7" /> : <Download className="h-7 w-7" />}
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">CareBridge app</p>
        <h1 id="install-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Install CareBridge to continue</h1>
        {isIos ? (
          <div className="mt-4 space-y-3 text-slate-600 dark:text-slate-300">
            <p>CareBridge must be added to your Home Screen for the best experience.</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Tap the <strong>Share</strong> button in Safari.</li>
              <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>, then open CareBridge from your Home Screen.</li>
            </ol>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-slate-600 dark:text-slate-300">
            <p>Install the CareBridge app on your Android device to continue.</p>
            <Button className="w-full" size="md" onClick={install} disabled={!deferred}>
              {deferred ? 'Install app' : 'Preparing install…'}
            </Button>
            {!deferred && <p className="text-center text-xs text-slate-500">If the prompt does not appear, open this page in Chrome and try again.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
