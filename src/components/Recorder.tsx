import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Mic, RefreshCw, Send, Square, SwitchCamera, Trash2, X } from 'lucide-react'
import { Button, ErrorBanner } from './ui'
import { fmtDuration } from '../lib/format'
import { pickMime } from '../lib/media'

export interface RecordingResult {
  blob: Blob
  mime: string
  duration: number
}

interface Props {
  kind: 'voice' | 'video'
  onCancel: () => void
  /** Should upload and send. Throw to show an error and let the user retry. */
  onSend: (r: RecordingResult, onProgress: (pct: number) => void) => Promise<void>
}

const MAX_SECONDS = { voice: 180, video: 120 }

function permissionMessage(e: unknown, kind: 'voice' | 'video') {
  const name = e instanceof DOMException ? e.name : ''
  const device = kind === 'voice' ? 'microphone' : 'camera and microphone'
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return `Access to your ${device} was blocked. Allow it in your browser or phone settings, then try again.`
  if (name === 'NotFoundError') return `No ${device} was found on this device.`
  if (name === 'NotReadableError') return `Your ${device} is being used by another app. Close it and try again.`
  return `Could not start recording. ${e instanceof Error ? e.message : ''}`
}

/** Full-screen sheet for recording voice notes and video notes with the browser MediaRecorder API. */
export default function Recorder({ kind, onCancel, onSend }: Props) {
  const [phase, setPhase] = useState<'ready' | 'recording' | 'preview'>('ready')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const barsRef = useRef<HTMLDivElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)

  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const startStream = useCallback(async () => {
    setError(null)
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'voice'
          ? { audio: { echoCancellation: true, noiseSuppression: true } }
          : {
              audio: { echoCancellation: true, noiseSuppression: true },
              video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
            },
      )
      streamRef.current = stream
      if (kind === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => undefined)
      }
      if (kind === 'voice') startWaveform(stream)
    } catch (e) {
      setError(permissionMessage(e, kind))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, facing, stopStream])

  function startWaveform(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const draw = () => {
        analyser.getByteFrequencyData(data)
        const bars = barsRef.current?.children
        if (bars) {
          for (let i = 0; i < bars.length; i++) {
            const v = data[Math.min(i + 2, data.length - 1)] / 255
            ;(bars[i] as HTMLElement).style.height = `${8 + v * 56}px`
          }
        }
        rafRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch {
      // waveform is cosmetic; recording still works
    }
  }

  useEffect(() => {
    if (!supported) {
      setError('Recording is not supported in this browser. Try Chrome, Edge, Firefox or Safari 14.5+.')
      return
    }
    cancelledRef.current = false
    startStream()
    return () => {
      cancelledRef.current = true
      stopStream()
    }
  }, [supported, startStream, stopStream])

  // revoke preview URL when replaced
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    const mime = pickMime(kind === 'voice' ? 'audio' : 'video')
    try {
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        ...(kind === 'voice' ? { audioBitsPerSecond: 64_000 } : { videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 64_000 }),
      })
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        if (cancelledRef.current) return
        const type = rec.mimeType || mime || (kind === 'voice' ? 'audio/webm' : 'video/webm')
        const blob = new Blob(chunksRef.current, { type })
        const duration = Math.max(1, Math.round((Date.now() - startRef.current) / 1000))
        setResult({ blob, mime: type, duration })
        setPreviewUrl(URL.createObjectURL(blob))
        setPhase('preview')
        stopStream()
      }
      rec.start(1000)
      recRef.current = rec
      startRef.current = Date.now()
      setSeconds(0)
      setPhase('recording')
      timerRef.current = window.setInterval(() => {
        const s = Math.round((Date.now() - startRef.current) / 1000)
        setSeconds(s)
        if (s >= MAX_SECONDS[kind]) stopRecording()
      }, 250)
    } catch (e) {
      setError(`Could not start recording: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  function stopRecording() {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setResult(null)
    setSeconds(0)
    setProgress(0)
    setPhase('ready')
    startStream()
  }

  async function send() {
    if (!result) return
    setSending(true)
    setError(null)
    setProgress(0)
    try {
      await onSend(result, setProgress)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Check your connection and retry.')
      setSending(false)
    }
  }

  const max = MAX_SECONDS[kind]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 text-white" role="dialog" aria-modal="true" aria-label={kind === 'voice' ? 'Record voice note' : 'Record video note'}>
      <div className="safe-top flex items-center justify-between px-4 py-3">
        <p className="font-semibold">{kind === 'voice' ? 'Voice note' : 'Video note'}</p>
        <button onClick={onCancel} className="rounded-full p-2 hover:bg-white/10" aria-label="Close" disabled={sending}>
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
        {error && (
          <div className="w-full max-w-md">
            <ErrorBanner message={error} />
            {!sending && phase !== 'preview' && supported && (
              <Button variant="secondary" className="mt-3 w-full" onClick={startStream}>
                <RefreshCw className="h-4 w-4" /> Try again
              </Button>
            )}
          </div>
        )}

        {kind === 'video' && phase !== 'preview' && (
          <video ref={videoRef} muted playsInline className="max-h-[55vh] w-full max-w-md rounded-2xl bg-black object-cover" />
        )}
        {kind === 'video' && phase === 'preview' && previewUrl && (
          <video src={previewUrl} controls playsInline className="max-h-[55vh] w-full max-w-md rounded-2xl bg-black" />
        )}

        {kind === 'voice' && phase !== 'preview' && (
          <div ref={barsRef} className="flex h-20 items-center gap-1" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="w-1.5 rounded-full bg-teal-300 transition-[height] duration-75" style={{ height: 8 }} />
            ))}
          </div>
        )}
        {kind === 'voice' && phase === 'preview' && previewUrl && <audio src={previewUrl} controls className="w-full max-w-md" />}

        <p className="font-mono text-3xl tabular-nums">
          {phase === 'preview' && result ? fmtDuration(result.duration) : fmtDuration(seconds)}
          <span className="ml-2 text-sm text-white/50">/ {fmtDuration(max)}</span>
        </p>

        {sending && (
          <div className="w-full max-w-md" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-teal-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-center text-sm text-white/70">Uploading… {progress}%</p>
          </div>
        )}
      </div>

      <div className="safe-bottom flex items-center justify-center gap-6 px-4 pb-8 pt-4">
        {phase === 'ready' && (
          <>
            {kind === 'video' && (
              <button
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                className="rounded-full bg-white/10 p-4 hover:bg-white/20"
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-6 w-6" />
              </button>
            )}
            <button
              onClick={startRecording}
              disabled={!!error && !streamRef.current}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-40"
              aria-label="Start recording"
            >
              {kind === 'voice' ? <Mic className="h-9 w-9" /> : <Camera className="h-9 w-9" />}
            </button>
            <div className="w-14" />
          </>
        )}
        {phase === 'recording' && (
          <>
            <button onClick={onCancel} className="rounded-full bg-white/10 p-4 hover:bg-white/20" aria-label="Cancel recording">
              <Trash2 className="h-6 w-6" />
            </button>
            <button
              onClick={stopRecording}
              className="rec-pulse flex h-20 w-20 items-center justify-center rounded-full bg-red-600"
              aria-label="Stop recording"
            >
              <Square className="h-8 w-8 fill-white" />
            </button>
            <div className="w-14" />
          </>
        )}
        {phase === 'preview' && (
          <>
            <Button variant="secondary" onClick={discard} disabled={sending} className="min-w-28">
              <Trash2 className="h-4 w-4" /> Re-record
            </Button>
            <Button onClick={send} loading={sending} className="min-w-28">
              {error ? <RefreshCw className="h-4 w-4" /> : <Send className="h-4 w-4" />} {error ? 'Retry' : 'Send'}
            </Button>
          </>
        )}
      </div>
      {phase === 'ready' && !error && (
        <p className="pb-3 text-center text-xs text-white/50">
          <Check className="mr-1 inline h-3 w-3" />
          Tap the red button to start. Max {kind === 'voice' ? '3' : '2'} minutes.
        </p>
      )}
    </div>
  )
}
