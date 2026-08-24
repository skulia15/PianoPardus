/**
 * Naming the chord under the cursor.
 *
 * Pitch classes only, so octaves and doubled notes make no difference and
 * inversions are found by trying every note in the chord as the root. A step
 * that is not a recognisable chord — a melody note over an accompaniment
 * figure, say, which is most of real piano music — gets no name rather than a
 * wrong one.
 */

/**
 * How chord roots are conventionally spelled, which is not how MIDI note
 * numbers are: a lead sheet says B♭m, never A♯m.
 */
const ROOT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

/** Interval sets measured from the root, in the order they should be preferred. */
const SHAPES: { intervals: number[]; suffix: string }[] = [
  { intervals: [0, 4, 7], suffix: '' },
  { intervals: [0, 3, 7], suffix: 'm' },
  { intervals: [0, 3, 6], suffix: 'dim' },
  { intervals: [0, 4, 8], suffix: 'aug' },
  { intervals: [0, 5, 7], suffix: 'sus4' },
  { intervals: [0, 2, 7], suffix: 'sus2' },
  { intervals: [0, 4, 7, 10], suffix: '7' },
  { intervals: [0, 4, 7, 11], suffix: 'maj7' },
  { intervals: [0, 3, 7, 10], suffix: 'm7' },
  { intervals: [0, 3, 7, 11], suffix: 'mMaj7' },
  { intervals: [0, 4, 7, 9], suffix: '6' },
  { intervals: [0, 3, 7, 9], suffix: 'm6' },
  { intervals: [0, 3, 6, 9], suffix: 'dim7' },
  { intervals: [0, 3, 6, 10], suffix: 'm7♭5' },
  { intervals: [0, 4, 8, 10], suffix: '7♯5' },
  { intervals: [0, 4, 6, 10], suffix: '7♭5' },
  { intervals: [0, 5, 7, 10], suffix: '7sus4' },
  { intervals: [0, 2, 4, 7], suffix: 'add9' },
  { intervals: [0, 2, 4, 7, 10], suffix: '9' },
  { intervals: [0, 2, 4, 7, 11], suffix: 'maj9' },
  { intervals: [0, 2, 3, 7, 10], suffix: 'm9' },
]

const key = (intervals: number[]) => intervals.join(',')

const BY_SHAPE = new Map(
  SHAPES.map((shape, rank) => [key(shape.intervals), { suffix: shape.suffix, rank }]),
)

/**
 * The chord these notes spell, or null if they do not spell one. Inversions come
 * back as slash chords: C major with E in the bass is "C/E".
 */
export function chordName(notes: number[]): string | null {
  if (notes.length < 3) return null

  const pitchClasses = [...new Set(notes.map((note) => ((note % 12) + 12) % 12))].sort(
    (a, b) => a - b,
  )
  if (pitchClasses.length < 3) return null

  const bass = ((Math.min(...notes) % 12) + 12) % 12

  let best: { root: number; suffix: string; rank: number } | null = null

  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b)
    const match = BY_SHAPE.get(key(intervals))
    if (!match) continue

    const candidate = { root, suffix: match.suffix, rank: match.rank }
    if (!best) {
      best = candidate
      continue
    }

    // A reading that puts the root in the bass beats one that does not; failing
    // that, the simpler shape wins. Both matter for symmetrical chords like
    // dim7, which match equally at all four of their notes.
    const betterBass = candidate.root === bass && best.root !== bass
    const sameBass = (candidate.root === bass) === (best.root === bass)
    if (betterBass || (sameBass && candidate.rank < best.rank)) best = candidate
  }

  if (!best) return null

  const name = ROOT_NAMES[best.root] + best.suffix
  return best.root === bass ? name : `${name}/${ROOT_NAMES[bass]}`
}
