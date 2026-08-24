import { Midi } from '@tonejs/midi'
import { usableTitle } from './titles'
import type { Step } from '../types'

/** Notes starting within this window of each other count as one chord. */
const CHORD_WINDOW_SECONDS = 0.05

/**
 * Flattens every track into one note list ordered by time, then groups notes
 * that start together. There is no notation for this path — see the player.
 */
export async function parseMidiSteps(blob: Blob): Promise<Step[]> {
  const midi = new Midi(await blob.arrayBuffer())

  const notes = midi.tracks
    .flatMap((track) => track.notes.map((note) => ({ time: note.time, midi: note.midi })))
    .sort((a, b) => a.time - b.time)

  const steps: Step[] = []
  let groupStart = -Infinity
  let group: Set<number> | null = null

  for (const note of notes) {
    if (!group || note.time - groupStart > CHORD_WINDOW_SECONDS) {
      group = new Set()
      groupStart = note.time
      steps.push({ index: steps.length, notes: [], timeSeconds: note.time })
    }
    group.add(note.midi)
    steps[steps.length - 1].notes = [...group].sort((a, b) => a - b)
  }

  return steps
}

/**
 * Only the file's own name event, and only if it names a piece rather than a
 * part. Track names are never considered: they are the instrument or the hand
 * essentially without exception, and @tonejs/midi already reads header.name
 * from track 0's name event, so even that needs checking.
 */
export async function titleFromMidi(blob: Blob): Promise<string | null> {
  const midi = new Midi(await blob.arrayBuffer())
  return usableTitle(midi.header.name)
}
