import type { Step } from '../types'

/**
 * Jump-to-measure. Falls back to jumping by step for MIDI pieces, which have no
 * measures to jump to.
 */
export default function JumpControl({
  steps,
  stepIndex,
  onJump,
}: {
  steps: Step[]
  stepIndex: number
  onJump: (index: number) => void
}) {
  const byMeasure = steps.every((step) => step.measure !== undefined)

  if (byMeasure) {
    const measures = steps.map((step) => step.measure as number)
    const first = measures[0]
    const last = measures[measures.length - 1]
    const current = steps[stepIndex]?.measure ?? last

    return (
      <label className="jump">
        <span className="label">bar {current}</span>
        <input
          type="range"
          min={first}
          max={last}
          value={current}
          onChange={(event) => {
            const target = Number(event.target.value)
            const index = steps.findIndex((step) => (step.measure as number) >= target)
            onJump(index === -1 ? steps.length - 1 : index)
          }}
        />
      </label>
    )
  }

  return (
    <label className="jump">
      <span className="label">
        step {Math.min(stepIndex + 1, steps.length)}/{steps.length}
      </span>
      <input
        type="range"
        min={1}
        max={steps.length}
        value={Math.min(stepIndex + 1, steps.length)}
        onChange={(event) => onJump(Number(event.target.value) - 1)}
      />
    </label>
  )
}
