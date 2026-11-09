import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, Check, CheckCheck, ImagePlus, Mic, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errMsg, fmtTime } from '../lib/format'
import { extFor, uploadMedia } from '../lib/media'
import type { Message, MessageType } from '../types'
import Recorder, { type RecordingResult } from './Recorder'
import { AudioPlayer, ImageView, VideoPlayer } from './MediaPlayers'
import { ErrorBanner, Spinner } from './ui'

export default function Chat({ peerId }: { peerId: string }) {
  const { user } = useAuth()
  const me = user!.id
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [recorder, setRecorder] = useState<'voice' | 'video' | null>(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const [params, setParams] = useSearchParams()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const typingChan = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastTypingSent = useRef(0)
  const typingTimeout = useRef<number | null>(null)

  const markRead = useCallback(async () => {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('receiver_id', me)
      .eq('sender_id', peerId)
      .is('read_at', null)
  }, [me, peerId])

  // Load history
  useEffect(() => {
    let live = true
    setLoading(true)
    setMessages([])
    supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${me},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${me})`)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (!live) return
        if (err) setError(errMsg(err))
        setMessages(((data as Message[]) ?? []).reverse())
        setLoading(false)
        markRead()
      })
    return () => {
      live = false
    }
  }, [me, peerId, markRead])

  // Realtime: new incoming messages, read receipts on my sent messages, typing indicator
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${me}-${peerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${me}` }, (payload) => {
        const m = payload.new as Message
        if (m.sender_id !== peerId) return
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        setPeerTyping(false)
        markRead()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, (payload) => {
        const m = payload.new as Message
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)))
      })
      .subscribe()

    const pair = [me, peerId].sort().join('-')
    const typing = supabase
      .channel(`typing-${pair}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user !== peerId) return
        setPeerTyping(true)
        if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
        typingTimeout.current = window.setTimeout(() => setPeerTyping(false), 3000)
      })
      .subscribe()
    typingChan.current = typing

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(typing)
      typingChan.current = null
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current)
    }
  }, [me, peerId, markRead])

  // Open recorder from quick actions (?record=voice|video)
  useEffect(() => {
    const r = params.get('record')
    if (r === 'voice' || r === 'video') {
      setRecorder(r)
      const next = new URLSearchParams(params)
      next.delete('record')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, peerTyping])

  async function insertMessage(row: { type: MessageType; content?: string | null; media_path?: string | null; duration_seconds?: number | null }) {
    const { data, error: err } = await supabase
      .from('messages')
      .insert({ sender_id: me, receiver_id: peerId, ...row })
      .select()
      .single()
    if (err) throw err
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]))
  }

  async function sendText(e: FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    try {
      await insertMessage({ type: 'text', content })
      setText('')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSending(false)
    }
  }

  async function sendRecording(kind: 'voice' | 'video', r: RecordingResult, onProgress: (n: number) => void) {
    const path = await uploadMedia(r.blob, me, extFor(r.mime, 'webm'), onProgress, kind)
    await insertMessage({ type: kind, media_path: path, duration_seconds: r.duration })
    setRecorder(null)
  }

  async function sendImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Images must be under 10 MB.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const path = await uploadMedia(file, me, extFor(file.type, 'jpg'))
      await insertMessage({ type: 'image', media_path: path })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSending(false)
    }
  }

  function onType(v: string) {
    setText(v)
    const now = Date.now()
    if (typingChan.current && now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now
      typingChan.current.send({ type: 'broadcast', event: 'typing', payload: { user: me } })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-3">
        {loading && <Spinner label="Loading conversation…" />}
        {!loading && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No messages yet. Say hello, or send a voice note or a short video.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} mine={m.sender_id === me} />
        ))}
        {peerTyping && (
          <div className="flex gap-1 px-2 py-1" aria-label="Typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="pb-2">
          <ErrorBanner message={error} />
        </div>
      )}

      <form onSubmit={sendText} className="flex items-end gap-2 border-t border-slate-200 bg-white/80 px-1 pt-2 dark:border-slate-700 dark:bg-transparent">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) sendImage(f)
            e.target.value = ''
          }}
        />
        <IconBtn label="Attach image" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-5 w-5" />
        </IconBtn>
        <IconBtn label="Record voice note" onClick={() => setRecorder('voice')}>
          <Mic className="h-5 w-5" />
        </IconBtn>
        <IconBtn label="Record video note" onClick={() => setRecorder('video')}>
          <Camera className="h-5 w-5" />
        </IconBtn>
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder="Type a message"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-800"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>

      {recorder && <Recorder kind={recorder} onCancel={() => setRecorder(null)} onSend={(r, p) => sendRecording(recorder, r, p)} />}
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  )
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          mine ? 'rounded-br-md bg-teal-600 text-white' : 'rounded-bl-md bg-white shadow-sm dark:bg-slate-700'
        }`}
      >
        {m.type === 'text' && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
        {m.type === 'voice' && m.media_path && <AudioPlayer path={m.media_path} duration={m.duration_seconds} mine={mine} />}
        {m.type === 'video' && m.media_path && <VideoPlayer path={m.media_path} />}
        {m.type === 'image' && m.media_path && <ImageView path={m.media_path} />}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? 'text-white/80' : 'text-slate-500 dark:text-slate-300'}`}>
          {fmtTime(m.created_at)}
          {mine && (m.read_at ? <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label="Read" /> : <Check className="h-3.5 w-3.5" aria-label="Sent" />)}
        </div>
      </div>
    </div>
  )
}
