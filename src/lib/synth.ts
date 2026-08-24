import { useEffect, useRef } from 'react'

/**
 * A piano-ish voice, so playback can be heard out of the phone.
 *
 * Synthesised rather than sampled: a decent sampled piano is megabytes, and this
 * only has to answer "how does the piece go". Two oscillators — a sine carrier
 * with a sine modulator at three times the frequency whose depth collapses
 * quickly — give the bright attack and mellow tail an instrument has, which is
 * most of what makes a note sound struck rather than beeped.
 */

const MASTER_GAIN = 0.22
const ATTACK_SECONDS = 0.006
const SILENCE = 0.0001

export type Synth = {
  /** `at` defaults to now; pass a context time to schedule ahead. */
  play: (notes: number[], durationMs: number, at?: number) => void
  stopAll: () => void
}

export function frequencyOf(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

export function createSynth(context: BaseAudioContext, destination?: AudioNode): Synth {
  const master = context.createGain()
  master.gain.value = MASTER_GAIN

  // A six-note chord is six voices at once; without this they clip.
  const compressor = context.createDynamicsCompressor()
  master.connect(compressor)
  compressor.connect(destination ?? context.destination)

  let sounding: { amp: GainNode; oscillators: OscillatorNode[] }[] = []

  function play(notes: number[], durationMs: number, at?: number) {
    const when = at ?? context.currentTime
    for (const note of notes) sounding.push(strike(note, Math.max(0.05, durationMs / 1000), when))
    // Voices stop themselves; this just keeps the list from growing forever.
    if (sounding.length > 64) sounding = sounding.slice(-64)
  }

  function strike(note: number, seconds: number, when: number) {
    const frequency = frequencyOf(note)

    const carrier = context.createOscillator()
    carrier.frequency.value = frequency

    const modulator = context.createOscillator()
    modulator.frequency.value = frequency * 3

    // Depth in Hz, falling away fast: bright for an instant, then a plain tone.
    const depth = context.createGain()
    depth.gain.setValueAtTime(frequency * 1.4, when)
    depth.gain.exponentialRampToValueAtTime(frequency * 0.02, when + 0.3)
    modulator.connect(depth)
    depth.connect(carrier.frequency)

    // Low notes ring longer, as they do on a real instrument. One ramp only, cut
    // at the end of the step: overlapping automation curves fight each other.
    const ring = Math.min(6, 1.6 + Math.max(0, 69 - note) * 0.045)
    const decay = Math.min(ring, seconds + 0.4)

    const amp = context.createGain()
    amp.gain.setValueAtTime(SILENCE, when)
    amp.gain.exponentialRampToValueAtTime(1, when + ATTACK_SECONDS)
    amp.gain.exponentialRampToValueAtTime(SILENCE, when + decay)

    carrier.connect(amp)
    amp.connect(master)

    carrier.start(when)
    modulator.start(when)
    carrier.stop(when + decay + 0.02)
    modulator.stop(when + decay + 0.02)

    return { amp, oscillators: [carrier, modulator] }
  }

  function stopAll() {
    const now = context.currentTime
    for (const { amp, oscillators } of sounding) {
      try {
        amp.gain.cancelScheduledValues(now)
        amp.gain.setValueAtTime(Math.max(amp.gain.value, SILENCE), now)
        amp.gain.exponentialRampToValueAtTime(SILENCE, now + 0.05)
        for (const oscillator of oscillators) oscillator.stop(now + 0.06)
      } catch {
        // Already stopped.
      }
    }
    sounding = []
  }

  return { play, stopAll }
}

/** Where the sound comes out. */
export type SoundMode = 'phone' | 'keyboard' | 'off'

const STORAGE_KEY = 'pianopardus.sound'

export function loadSoundMode(): SoundMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'keyboard' || stored === 'off' ? stored : 'phone'
  } catch {
    return 'phone'
  }
}

export function saveSoundMode(mode: SoundMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Will not persist; nothing else to do.
  }
}

/**
 * The audio context is built on first use rather than on mount, because a
 * browser will not start one until something has been tapped.
 */
export function useSynth(): Synth {
  const ref = useRef<{ context: AudioContext; synth: Synth } | null>(null)

  useEffect(
    () => () => {
      void ref.current?.context.close().catch(() => {})
      ref.current = null
    },
    [],
  )

  function ensure(): Synth | null {
    try {
      if (!ref.current) {
        const context = new AudioContext()
        ref.current = { context, synth: createSynth(context) }
      }
      if (ref.current.context.state === 'suspended') void ref.current.context.resume()
      return ref.current.synth
    } catch {
      return null // no Web Audio, or refused
    }
  }

  return {
    play: (notes, durationMs, at) => ensure()?.play(notes, durationMs, at),
    stopAll: () => ref.current?.synth.stopAll(),
  }
}
