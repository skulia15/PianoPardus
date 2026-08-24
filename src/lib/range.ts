import type { Step } from '../types'

/**
 * Fitting a piece to the keyboard you actually own.
 *
 * The player waits for the exact note, so a piece reaching below the lowest key
 * does not merely sound wrong — it stops dead, with no way past. A 61-key
 * instrument starts at C2, and plenty of piano writing goes under it.
 */

export type KeyboardRange = {
  keys: number
  lowest: number
  highest: number
  label: string
}

export const KEYBOARD_RANGES: KeyboardRange[] = [
  { keys: 88, lowest: 21, highest: 108, label: '88 keys · A0–C8' },
  { keys: 76, lowest: 28, highest: 103, label: '76 keys · E1–G7' },
  { keys: 61, lowest: 36, highest: 96, label: '61 keys · C2–C7' },
  { keys: 49, lowest: 36, highest: 84, label: '49 keys · C2–C6' },
  { keys: 37, lowest: 48, highest: 84, label: '37 keys · C3–C6' },
]

export const DEFAULT_RANGE = KEYBOARD_RANGES[0]

const STORAGE_KEY = 'pianopardus.keyboard'

export function loadRange(): KeyboardRange {
  try {
    const keys = Number(localStorage.getItem(STORAGE_KEY))
    return KEYBOARD_RANGES.find((range) => range.keys === keys) ?? DEFAULT_RANGE
  } catch {
    return DEFAULT_RANGE // private mode, or storage refused
  }
}

export function saveRange(keys: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(keys))
  } catch {
    // Nothing to do; the setting just will not persist.
  }
}

/** Whole-octave shifts worth trying, nearest first so ties prefer standing still. */
const SHIFTS = [0, 12, -12, 24, -24]

export type FittedSteps = {
  steps: Step[]
  /** Semitones the whole piece was moved by, always a multiple of twelve. */
  shift: number
  /** Notes that still had to be folded individually after that shift. */
  folded: number
}

/**
 * Moves a piece onto the keyboard. First the whole thing is shifted by whole
 * octaves, because that keeps every interval intact and is what the transpose
 * button on the instrument does — for a piece that merely sits too low, this
 * fixes everything and nothing else is needed. Only what still does not fit is
 * then folded octave by octave, note by note, which does distort the writing but
 * is better than a step that can never be completed.
 */
export function fitStepsToRange(steps: Step[], range: KeyboardRange): FittedSteps {
  const outside = (note: number, shift: number) =>
    note + shift < range.lowest || note + shift > range.highest

  const shift =
    SHIFTS.find((candidate) => steps.every((step) => step.notes.every((n) => !outside(n, candidate)))) ??
    bestShift(steps, outside)

  if (shift === 0 && steps.every((step) => step.notes.every((n) => !outside(n, 0)))) {
    return { steps, shift: 0, folded: 0 }
  }

  let folded = 0
  const fitted = steps.map((step) => {
    const moved: number[] = []
    const notes = new Set<number>()

    for (const note of step.notes) {
      const shifted = note + shift
      const inRange = foldIntoRange(shifted, range)
      if (inRange !== shifted) {
        folded++
        moved.push(inRange)
      }
      notes.add(inRange)
    }

    return {
      ...step,
      notes: [...notes].sort((a, b) => a - b),
      ...(moved.length > 0 ? { folded: moved } : {}),
    }
  })

  return { steps: fitted, shift, folded }
}

function bestShift(steps: Step[], outside: (note: number, shift: number) => boolean): number {
  let best = 0
  let fewest = Infinity

  for (const candidate of SHIFTS) {
    let count = 0
    for (const step of steps) {
      for (const note of step.notes) if (outside(note, candidate)) count++
    }
    if (count < fewest) {
      fewest = count
      best = candidate
    }
  }

  return best
}

function foldIntoRange(note: number, range: KeyboardRange): number {
  let folded = note
  while (folded < range.lowest) folded += 12
  while (folded > range.highest) folded -= 12
  return folded
}

export function describeFit(fit: FittedSteps, range: KeyboardRange): string | null {
  if (fit.shift === 0 && fit.folded === 0) return null

  const parts: string[] = []
  if (fit.shift !== 0) {
    const octaves = Math.abs(fit.shift) / 12
    parts.push(`shifted ${fit.shift > 0 ? 'up' : 'down'} ${octaves} octave${octaves > 1 ? 's' : ''}`)
  }
  if (fit.folded > 0) parts.push(`${fit.folded} note${fit.folded === 1 ? '' : 's'} folded`)

  return `${range.keys} keys · ${parts.join(' · ')}`
}
