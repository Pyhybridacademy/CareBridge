import { useEffect, useState } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase'

export const BUCKET = 'care-media'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Pick the first recording format this browser supports (Chrome/Android = webm, Safari/iOS = mp4). */
export function pickMime(kind: 'audio' | 'video'): string {
  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  if (typeof MediaRecorder === 'undefined') return ''
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export function extFor(mime: string, fallback: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  return fallback
}

/**
 * Upload a blob to the private bucket with real progress reporting.
 * Falls back to the standard SDK upload (no progress) if the XHR route fails.
 * Returns the storage path, which is stored in the database instead of a public URL.
 */
export async function uploadMedia(
  blob: Blob,
  userId: string,
  ext: string,
  onProgress?: (pct: number) => void,
  prefix = 'file',
): Promise<string> {
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('This file is too large (limit 50 MB). Try a shorter recording.')
  const path = `${userId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const apiKey = SUPABASE_KEY
  if (token && SUPABASE_URL && apiKey) {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.setRequestHeader('apikey', apiKey)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('network'))
        const form = new FormData()
        form.append('cacheControl', '3600')
        form.append('', blob)
        xhr.send(form)
      })
      onProgress?.(100)
      return path
    } catch {
      // fall through to SDK upload
    }
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || undefined,
    cacheControl: '3600',
  })
  if (error) throw new Error(error.message)
  onProgress?.(100)
  return path
}

const urlCache = new Map<string, { url: string; expires: number }>()

export async function getSignedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && hit.expires > Date.now() + 60_000) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return null
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3600_000 })
  return data.signedUrl
}

/** Short-lived signed URL for a private file. */
export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setUrl(null)
    setFailed(false)
    if (!path) return
    getSignedUrl(path).then((u) => {
      if (!live) return
      if (u) setUrl(u)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [path])
  return { url, failed }
}
