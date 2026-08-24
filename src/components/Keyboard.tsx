import {
  keysIn,
  viewWidth,
  MIDDLE_C,
  MIN_OCTAVES,
  WHITE_WIDTH,
  WHITE_HEIGHT,
  BLACK_HEIGHT,
  type KeyboardWindow,
  type KeyPosition,
} from '../lib/keys'
import { noteName } from '../lib/notes'
import type { KeyboardRange } from '../lib/range'

export default function Keyboard({
  window: view,
  range,
  expected,
  held,
  wrong,
  flash,
  onPress,
  onRelease,
}: {
  window: KeyboardWindow
  range?: KeyboardRange
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
  // Past three octaves the labels are too small to read, and the dot on middle C
  // carries the orientation on its own by then.
  const labelSize = Math.min(8 * (octaves / MIN_OCTAVES), 15)
  const labelEveryC = octaves <= 3

  // Grown against the window for the same reason the labels are, so the marker
  // stays about the same size on screen however wide the keyboard gets. Capped
  // so it still sits inside the key.
  const markerRadius = WHITE_WIDTH * Math.min(0.22 * (octaves / MIN_OCTAVES), 0.36)

  function stateFor(note: number): string {
    // Drawn, but greyed: a key your instrument does not have.
    if (range && (note < range.lowest || note > range.highest)) return 'outside'
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
      {!position.black && position.note % 12 === 0 && labelEveryC && (
        <text
          x={position.x + position.width / 2}
          y={WHITE_HEIGHT - 5}
          style={{ fontSize: labelSize }}
        >
          {noteName(position.note)}
        </text>
      )}
      {position.note === MIDDLE_C && (
        <circle
          className="middle-c"
          cx={position.x + position.width / 2}
          cy={WHITE_HEIGHT - (labelEveryC ? 22 : 16)}
          r={markerRadius}
        />
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
