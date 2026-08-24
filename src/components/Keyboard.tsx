import {
  keysIn,
  viewWidth,
  MIN_OCTAVES,
  WHITE_HEIGHT,
  BLACK_HEIGHT,
  type KeyboardWindow,
  type KeyPosition,
} from '../lib/keys'
import { noteName } from '../lib/notes'

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
  const { octaves } = view
  const { whites, blacks } = keysIn(view)

  const expectedSet = new Set(expected)
  const below = expected.filter((note) => note < view.start).length
  const above = expected.filter((note) => note >= view.start + octaves * 12).length

  // The SVG scales to the container, so a wider window shrinks everything in it.
  // Grow the octave labels to compensate, and past three octaves label middle C
  // only — five illegible labels orient you worse than one legible one.
  const labelSize = Math.min(8 * (octaves / MIN_OCTAVES), 15)
  const labelEveryC = octaves <= 3

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

  const key = (position: KeyPosition) => (
    <g
      key={position.note}
      className={`key ${position.black ? 'black' : 'white'} ${stateFor(position.note)}`}
      {...handlers(position.note)}
    >
      <rect
        x={position.x}
        y={0}
        width={position.width}
        height={position.black ? BLACK_HEIGHT : WHITE_HEIGHT}
        rx={position.black ? 2 : 3}
      />
      {!position.black && position.note % 12 === 0 && (labelEveryC || position.note === 60) && (
        <text
          x={position.x + position.width / 2}
          y={WHITE_HEIGHT - 6}
          style={{ fontSize: labelSize }}
        >
          {noteName(position.note)}
        </text>
      )}
    </g>
  )

  return (
    <div className="keyboard">
      <svg viewBox={`0 0 ${viewWidth(view)} ${WHITE_HEIGHT}`} className="keyboard-svg">
        {whites.map(key)}
        {blacks.map(key)}
      </svg>

      {below > 0 && <div className="offscreen left">◀ {below}</div>}
      {above > 0 && <div className="offscreen right">{above} ▶</div>}
    </div>
  )
}
