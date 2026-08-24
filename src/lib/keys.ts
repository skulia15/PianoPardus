/**
 * Where the keys sit. Shared by the keyboard and the piano roll so that a note
 * is at the same x in both — the roll's whole point is that a note falls onto
 * the key you have to press.
 */

export const MIN_OCTAVES = 2
export const MAX_OCTAVES = 6

export const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
/** Index of the white key each black key sits after, within an octave. */
export const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5]

export const WHITE_WIDTH = 24
export const WHITE_HEIGHT = 120
export const BLACK_WIDTH = 13
export const BLACK_HEIGHT = 74

export type KeyboardWindow = { start: number; octaves: number }

export const INITIAL_WINDOW: KeyboardWindow = { start: 48, octaves: MIN_OCTAVES }

export function viewWidth(view: KeyboardWindow): number {
  return view.octaves * 7 * WHITE_WIDTH
}

export function isBlack(note: number): boolean {
  return !WHITE_OFFSETS.includes(note % 12)
}

/**
 * Picks the window to show. Two octaves by default, but the spec's real
 * requirement is that the current step is always visible, and both hands far
 * apart is normal in real arrangements — so a wider step widens the window
 * rather than hiding notes off the edge.
 *
 * It never narrows again within a piece. Measured on a real two-hand
 * arrangement, letting it shrink back resized the keyboard on a fifth of all
 * steps, which is worse to read than slightly thinner keys: growing only means
 * at most four resizes for a whole piece, and a keyboard that stays where you
 * learned it.
 */
export function windowFor(notes: number[], previous: KeyboardWindow): KeyboardWindow {
  if (notes.length === 0) return previous

  const low = Math.min(...notes)
  const high = Math.max(...notes)
  if (low >= previous.start && high < previous.start + previous.octaves * 12) return previous

  return fittedWindow(low, high, previous.octaves)
}

function fittedWindow(low: number, high: number, atLeast: number): KeyboardWindow {
  const lowC = Math.floor(low / 12) * 12
  const needed = Math.ceil((high - lowC + 1) / 12)
  const octaves = Math.min(MAX_OCTAVES, Math.max(MIN_OCTAVES, atLeast, needed))
  const span = octaves * 12

  // The window starts on a C, no higher than the C below the lowest note and no
  // lower than one that still leaves room for the highest. Both bounds matter:
  // centring without the upper bound pushes the top note off the edge.
  const highest = lowC
  const lowest = Math.ceil((high - span + 1) / 12) * 12

  let start = highest
  if (lowest < highest) {
    const centre = Math.floor((low + high) / 2)
    const centred = Math.floor((centre - span / 2) / 12) * 12
    start = Math.min(highest, Math.max(lowest, centred))
  }

  return { start: Math.min(Math.max(start, 0), 128 - span), octaves }
}

export type KeyPosition = { note: number; x: number; width: number; black: boolean }

/** Every key in the window, whites first so the blacks paint over them. */
export function keysIn(view: KeyboardWindow): { whites: KeyPosition[]; blacks: KeyPosition[] } {
  const whites: KeyPosition[] = []
  const blacks: KeyPosition[] = []

  for (let octave = 0; octave < view.octaves; octave++) {
    WHITE_OFFSETS.forEach((offset, index) => {
      whites.push({
        note: view.start + octave * 12 + offset,
        x: (octave * 7 + index) * WHITE_WIDTH,
        width: WHITE_WIDTH,
        black: false,
      })
    })

    for (const after of BLACK_AFTER_WHITE) {
      const whiteIndex = octave * 7 + after
      blacks.push({
        note: view.start + octave * 12 + WHITE_OFFSETS[after] + 1,
        x: (whiteIndex + 1) * WHITE_WIDTH - BLACK_WIDTH / 2,
        width: BLACK_WIDTH,
        black: true,
      })
    }
  }

  return { whites, blacks }
}

/** Where a single note sits, or null if it is outside the window. */
export function positionOf(note: number, view: KeyboardWindow): KeyPosition | null {
  if (note < view.start || note >= view.start + view.octaves * 12) return null

  const { whites, blacks } = keysIn(view)
  return [...whites, ...blacks].find((key) => key.note === note) ?? null
}
