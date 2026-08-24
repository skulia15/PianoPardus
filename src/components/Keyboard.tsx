import { noteName } from '../lib/notes'

const OCTAVES = 2
const SPAN = OCTAVES * 12
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
/** Index of the white key each black key sits after, within an octave. */
const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5]

const WHITE_WIDTH = 24
const WHITE_HEIGHT = 120
const BLACK_WIDTH = 15
const BLACK_HEIGHT = 74
const WHITE_COUNT = OCTAVES * 7
const VIEW_WIDTH = WHITE_COUNT * WHITE_WIDTH

/**
 * Picks the two-octave window to show. It only moves when the notes no longer
 * fit, so the keyboard is not sliding around on every step.
 */
export function windowStartFor(notes: number[], previous: number): number {
  if (notes.length === 0) return previous

  const low = Math.min(...notes)
  const high = Math.max(...notes)
  if (low >= previous && high < previous + SPAN) return previous

  const centre = Math.floor((low + high) / 2)
  let start = Math.floor((centre - SPAN / 2) / 12) * 12
  if (low < start) start = Math.floor(low / 12) * 12

  return Math.min(Math.max(start, 12), 108 - SPAN)
}

export default function Keyboard({
  windowStart,
  expected,
  held,
  wrong,
  onPress,
  onRelease,
}: {
  windowStart: number
  expected: number[]
  held: Set<number>
  wrong: Set<number>
  onPress?: (note: number) => void
  onRelease?: (note: number) => void
}) {
  const expectedSet = new Set(expected)
  const below = expected.filter((note) => note < windowStart).length
  const above = expected.filter((note) => note >= windowStart + SPAN).length

  const whites: number[] = []
  const blacks: { note: number; x: number }[] = []

  for (let octave = 0; octave < OCTAVES; octave++) {
    for (const offset of WHITE_OFFSETS) {
      whites.push(windowStart + octave * 12 + offset)
    }
    for (const after of BLACK_AFTER_WHITE) {
      const whiteIndex = octave * 7 + after
      blacks.push({
        note: windowStart + octave * 12 + WHITE_OFFSETS[after] + 1,
        x: (whiteIndex + 1) * WHITE_WIDTH - BLACK_WIDTH / 2,
      })
    }
  }

  function stateFor(note: number): string {
    if (wrong.has(note)) return 'wrong'
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
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${WHITE_HEIGHT}`} className="keyboard-svg">
        {whites.map((note, index) => (
          <g key={note} className={`key white ${stateFor(note)}`} {...handlers(note)}>
            <rect
              x={index * WHITE_WIDTH}
              y={0}
              width={WHITE_WIDTH}
              height={WHITE_HEIGHT}
              rx={3}
            />
            {note % 12 === 0 && (
              <text x={index * WHITE_WIDTH + WHITE_WIDTH / 2} y={WHITE_HEIGHT - 7}>
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
