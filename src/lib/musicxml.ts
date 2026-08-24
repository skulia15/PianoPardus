import { unzipSync } from 'fflate'
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { Step } from '../types'

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * Returns the MusicXML text for a piece. `.mxl` files are zip archives — the
 * real score is named by META-INF/container.xml. MuseScore exports default to
 * `.mxl`, so most real-world files come through this path.
 */
export async function readMusicXmlText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK"
  if (!isZip) return decode(bytes)

  const entries = unzipSync(bytes)
  const containerEntry = entries['META-INF/container.xml']
  let path: string | undefined

  if (containerEntry) {
    const container = new DOMParser().parseFromString(decode(containerEntry), 'application/xml')
    path = container.querySelector('rootfile')?.getAttribute('full-path') ?? undefined
  }
  if (!path || !entries[path]) {
    // No usable container.xml: take the first score-looking entry instead.
    path = Object.keys(entries).find(
      (name) => !name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(name),
    )
  }
  if (!path || !entries[path]) {
    throw new Error('That .mxl archive does not contain a MusicXML file.')
  }
  return decode(entries[path])
}

function decode(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function titleFromMusicXml(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const candidates = [
    doc.querySelector('work > work-title')?.textContent,
    doc.querySelector('movement-title')?.textContent,
    doc.querySelector('credit > credit-words')?.textContent,
  ]
  for (const candidate of candidates) {
    const title = candidate?.trim()
    if (title) return title
  }
  return null
}

/**
 * Walks the OSMD cursor from the start and records one step per cursor position
 * that sounds at least one note. The cursor walks the played order, so repeats
 * and voltas come out expanded, which is what we want.
 */
export function buildSteps(osmd: OpenSheetMusicDisplay): Step[] {
  const cursor = osmd.cursor
  cursor.reset()

  const steps: Step[] = []
  let cursorIndex = 0

  // Repeats can in principle loop; this is a runaway guard, not a real limit.
  const maxPositions = 50_000

  while (!cursor.Iterator.EndReached && cursorIndex < maxPositions) {
    const pitches = new Set<number>()

    for (const note of cursor.NotesUnderCursor()) {
      if (note.isRest() || !note.Pitch) continue
      // A tie continuation is the same sounding note held on — it is not played again.
      if (note.NoteTie && note.NoteTie.StartNote !== note) continue
      pitches.add(note.halfTone + 12)
    }

    if (pitches.size > 0) {
      steps.push({
        index: steps.length,
        notes: [...pitches].sort((a, b) => a - b),
        measure: cursor.Iterator.CurrentMeasure?.MeasureNumber,
        osmdCursorIndex: cursorIndex,
      })
    }

    cursor.next()
    cursorIndex++
  }

  return steps
}

/** Moves the visible cursor to a step recorded by buildSteps. */
export function moveCursorTo(osmd: OpenSheetMusicDisplay, osmdCursorIndex: number): void {
  osmd.cursor.reset()
  for (let i = 0; i < osmdCursorIndex; i++) osmd.cursor.next()
}

/**
 * The classic OSMD bug is an off-by-twelve in halfTone -> MIDI. Middle C must
 * come out as 60. Rather than trusting it, work the first pitched note out of
 * the XML directly and compare. Returns a warning to show the user, or null.
 */
export function checkPitchMapping(xml: string, steps: Step[]): string | null {
  const expected = firstPitchedNoteFromXml(xml)
  if (expected === null || steps.length === 0) return null

  const first = steps[0].notes
  if (first.includes(expected)) return null

  const offset = first.includes(expected + 12) ? 12 : first.includes(expected - 12) ? -12 : null
  if (offset !== null) {
    return `Pitch mapping is off by an octave: the file's first note is MIDI ${expected}, the parser produced ${first.join(', ')}.`
  }

  // Anything else (pickup bars, multi-voice ordering) is not conclusive.
  return null
}

function firstPitchedNoteFromXml(xml: string): number | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  for (const note of Array.from(doc.querySelectorAll('note'))) {
    if (note.querySelector('rest') || note.querySelector('grace')) continue
    const pitch = note.querySelector('pitch')
    if (!pitch) continue

    const step = pitch.querySelector('step')?.textContent?.trim().toUpperCase()
    const octave = Number(pitch.querySelector('octave')?.textContent)
    if (!step || !(step in STEP_SEMITONES) || !Number.isFinite(octave)) continue

    const alter = Number(pitch.querySelector('alter')?.textContent ?? 0)
    return (octave + 1) * 12 + STEP_SEMITONES[step] + (Number.isFinite(alter) ? alter : 0)
  }
  return null
}
