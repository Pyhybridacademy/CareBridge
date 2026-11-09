let audioContext: AudioContext | null = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  audioContext ??= new AudioContext()
  return audioContext
}

export async function enableNotificationSound() {
  const context = getAudioContext()
  if (context?.state === 'suspended') await context.resume()
}

export function playNotificationSound() {
  const context = getAudioContext()
  if (!context || context.state !== 'running') return

  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(740, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(988, context.currentTime + 0.12)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.35)
}
