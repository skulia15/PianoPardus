import { noteName } from '../lib/notes'

const MIN_OCTAVES = 2
const MAX_OCTAVES = 6
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
/** Index of the white key each black key sits after, within an octave. */
const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5]

const WHITE_WIDTH = 24
const WHITE_HEIGHT = 120
const BLACK_WIDTH = 13
const BLACK_HEIGHT = 74
export type KeyboardWindow = { start: number; octaves: number }

export const INITIAL_WINDOW: KeyboardWindow = { start: 48, octaves: MIN_OCTAVES }

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

export default function Keyboard({
  window: view,
  expected,
  held,
  wrong,
  flash,
  onPress,
  onRelease,
}: {
  window: KeyboardWindow
  expected: number[]
  held: Set<number>
  wrong: Set<number>
  flash: Set<number>
  onPress?: (note: number) => void
  onRelease?: (note: number) => void
}) {
  const { start, octaves } = view
  const span = octaves * 12
  const viewWidth = octaves * 7 * WHITE_WIDTH

  // The SVG scales to the container, so a wider window shrinks everything in it.
  // Grow the octave labels to compensate, and past three octaves label middle C
  // only — five illegible labels orient you worse than one legible one.
  const labelSize = Math.min(8 * (octaves / MIN_OCTAVES), 15)
  const labelEveryC = octaves <= 3

  const expectedSet = new Set(expected)
  const below = expected.filter((note) => note < start).length
  const above = expected.filter((note) => note >= start + span).length

  const whites: number[] = []
  const blacks: { note: number; x: number }[] = []

  for (let octave = 0; octave < octaves; octave++) {
    for (const offset of WHITE_OFFSETS) {
      whites.push(start + octave * 12 + offset)
    }
    for (const after of BLACK_AFTER_WHITE) {
      const whiteIndex = octave * 7 + after
      blacks.push({
        note: start + octave * 12 + WHITE_OFFSETS[after] + 1,
        x: (whiteIndex + 1) * WHITE_WIDTH - BLACK_WIDTH / 2,
      })
    }
  }

  function stateFor(note: number): string {
    if (wrong.has(note)) return 'wrong'
    if (flash.has(note)) return 'correct'
    if (expectedSet.has(note)) return held.has(note) ? 'correct' : 'expected'
    if (held.has(note)) return 'held'
    return ''
  }

  function handlers(note: number) {
    if (!onPress && !onRelease) return {}
    return {
      onPointerDown: (event: React.PointerEvent) => {
        event.preventDefault()
        onPress?.(note)
      },
      onPointerUp: () => onRelease?.(note),
      onPointerLeave: () => onRelease?.(note),
      onPointerCancel: () => onRelease?.(note),
    }
  }

  return (
    <div className="keyboard">
      <svg viewBox={`0 0 ${viewWidth} ${WHITE_HEIGHT}`} className="keyboard-svg">
        {whites.map((note, index) => (
          <g key={note} className={`key white ${stateFor(note)}`} {...handlers(note)}>
            <rect
              x={index * WHITE_WIDTH}
              y={0}
              width={WHITE_WIDTH}
              height={WHITE_HEIGHT}
              rx={3}
            />
            {note % 12 === 0 && (labelEveryC || note === 60) && (
              <text
                x={index * WHITE_WIDTH + WHITE_WIDTH / 2}
                y={WHITE_HEIGHT - 6}
                style={{ fontSize: labelSize }}
              >
                {noteName(note)}
              </text>
            )}
          </g>
        ))}
        {blacks.map(({ note, x }) => (
          <g key={note} className={`key black ${stateFor(note)}`} {...handlers(note)}>
            <rect x={x} y={0} width={BLACK_WIDTH} height={BLACK_HEIGHT} rx={2} />
          </g>
        ))}
      </svg>

      {below > 0 && <div className="offscreen left">◀ {below}</div>}
      {above > 0 && <div className="offscreen right">{above} ▶</div>}
    </div>
  )
}
