import { keysIn, MIDDLE_C, positionOf, viewWidth, type KeyboardWindow } from '../lib/keys'
import type { Step } from '../types'

const ROWS = 10
const NOTE_HEIGHT = 0.72

/**
 * Stands in for the notation pane when there is no score to render. Time runs
 * upwards and pitch runs across, on exactly the keyboard's x axis, so a note
 * sits directly above the key it wants. The current step is the bottom row,
 * against the keyboard.
 */
export default function PianoRoll({
  steps,
  from,
  window: view,
}: {
  steps: Step[]
  from: number
  window: KeyboardWindow
}) {
  const rows = steps.slice(from, from + ROWS)
  const { blacks } = keysIn(view)
  const middleC = positionOf(MIDDLE_C, view)

  return (
    <div className="roll">
      <svg
        className="roll-svg"
        viewBox={`0 0 ${viewWidth(view)} ${ROWS}`}
        preserveAspectRatio="none"
      >
        {/* Faint columns behind the black keys, so the eye can find its place. */}
        {blacks.map((key) => (
          <rect
            key={key.note}
            className="roll-column"
            x={key.x}
            y={0}
            width={key.width}
            height={ROWS}
          />
        ))}

        {/* The same landmark the keyboard below marks, so the two read together. */}
        {middleC && (
          <rect
            className="roll-middle-c"
            x={middleC.x}
            y={0}
            width={middleC.width}
            height={ROWS}
          />
        )}

        {rows.map((step, row) =>
          step.notes.map((note) => {
            const position = positionOf(note, view)
            if (!position) return null
            return (
              <rect
                key={`${step.index}-${note}`}
                className={`roll-note ${row === 0 ? 'current' : ''}`}
                x={position.x + 1}
                y={ROWS - 1 - row + (1 - NOTE_HEIGHT) / 2}
                width={position.width - 2}
                height={NOTE_HEIGHT}
                rx={2}
                ry={0.18}
              />
            )
          }),
        )}
      </svg>
    </div>
  )
}
