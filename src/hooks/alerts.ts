// Phase-end alerts: a short chime and an optional browser notification.
// Browsers only allow audio and permission prompts after a user gesture,
// so `primeAlerts` is called from the Start button.

import type { Phase } from '../lib/timer'

let audio: AudioContext | null = null

export function primeAlerts(): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {})
  }
}

function chime(): void {
  if (!audio) return
  const t = audio.currentTime
  // Two soft sine notes, a fifth apart.
  ;[660, 990].forEach((freq, i) => {
    const osc = audio!.createOscillator()
    const gain = audio!.createGain()
    const at = t + i * 0.18
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9)
    osc.connect(gain).connect(audio!.destination)
    osc.start(at)
    osc.stop(at + 1)
  })
}

const MESSAGES: Record<Phase, string> = {
  focus: 'Focus done. Time for a break.',
  break: 'Break over. Ready to focus?',
  longBreak: 'Long break over. Ready to focus?',
}

export function alertPhaseEnded(phase: Phase): void {
  chime()
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification('Slowburn', { body: MESSAGES[phase], silent: true })
    }
  } catch {
    // Notifications can throw on some mobile browsers; the chime is enough.
  }
}
