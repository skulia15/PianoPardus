const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** MIDI 60 -> "C4". Scientific pitch notation, so octave = floor(note / 12) - 1. */
export function noteName(note: number): string {
  return NAMES[note % 12] + (Math.floor(note / 12) - 1)
}
