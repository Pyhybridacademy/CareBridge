import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Pause, Play } from 'lucide-react'
import { useSignedUrl } from '../lib/media'
import { fmtDuration } from '../lib/format'

const SPEEDS = [1, 1.5, 2]

export function AudioPlayer({ path, duration, mine }: { path: string; duration?: number | null; mine?: boolean }) {
  const { url, failed } = useSignedUrl(path)
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [total, setTotal] = useState(duration ?? 0)
  const [speedIdx, setSpeedIdx] = useState(0)

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = SPEEDS[speedIdx]
  }, [speedIdx, url])

  if (failed) return <MediaError />

  function toggle() {
    const a = ref.current
    if (!a) return
    if (a.paused) a.play().catch(() => undefined)
    else a.pause()
  }

  const pct = total > 0 ? Math.min(100, (time / total) * 100) : 0

  return (
    <div className="flex w-56 max-w-full items-center gap-2" aria-label="Voice note">
      <button
        onClick={toggle}
        disabled={!url}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-white/25' : 'bg-teal-600 text-white'} disabled:opacity-50`}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={time}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (ref.current) ref.current.currentTime = v
            setTime(v)
          }}
          className="h-1.5 w-full cursor-pointer accent-teal-400"
          style={{ background: `linear-gradient(to right, currentColor ${pct}%, rgba(148,163,184,.4) ${pct}%)` }}
          aria-label="Seek"
        />
        <div className="mt-0.5 flex justify-between text-xs opacity-75">
          <span>{fmtDuration(time)}</span>
          <span>{fmtDuration(total)}</span>
        </div>
      </div>
      <button
        onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
        className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${mine ? 'bg-white/25' : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-100'}`}
        aria-label="Playback speed"
      >
        {SPEEDS[speedIdx]}x
      </button>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            if (Number.isFinite(d) && d > 0) setTotal(d)
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setTime(0)
          }}
        />
      )}
    </div>
  )
}

export function VideoPlayer({ path }: { path: string }) {
  const { url, failed } = useSignedUrl(path)
  const ref = useRef<HTMLVideoElement | null>(null)
  const [speedIdx, setSpeedIdx] = useState(0)

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = SPEEDS[speedIdx]
  }, [speedIdx, url])

  if (failed) return <MediaError />
  if (!url) return <div className="h-40 w-64 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-600/60" />

  return (
    <div className="relative">
      <video ref={ref} src={url} controls playsInline preload="metadata" className="max-h-72 w-64 max-w-full rounded-xl bg-black" aria-label="Video note" />
      <button
        onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
        className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white"
        aria-label="Playback speed"
      >
        {SPEEDS[speedIdx]}x
      </button>
    </div>
  )
}

export function ImageView({ path }: { path: string }) {
  const { url, failed } = useSignedUrl(path)
  if (failed) return <MediaError />
  if (!url) return <div className="h-40 w-56 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-600/60" />
  return <img src={url} alt="Shared by chat" className="max-h-72 max-w-full rounded-xl object-cover" loading="lazy" />
}

function MediaError() {
  return (
    <span className="flex items-center gap-1 text-sm opacity-80">
      <AlertCircle className="h-4 w-4" /> Could not load this file.
    </span>
  )
}
