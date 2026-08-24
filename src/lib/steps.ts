import type { Step } from '../types'

const STEPS_BACK_WITHOUT_BARS = 4

/**
 * Where a skip back should land: the start of the current bar, or the start of
 * the previous one if already there. That is what a person means by "again" —
 * the same phrase from its beginning, not four notes ago.
 *
 * Pieces without bars (a MIDI file shown as a roll) step back a fixed amount.
 */
export function skipBackIndex(steps: Step[], index: number): number {
  const bar = steps[index]?.measure
  if (bar === undefined) {
    return Math.max(0, index - STEPS_BACK_WITHOUT_BARS)
  }

  const startOfBar = steps.findIndex((step) => step.measure === bar)
  if (index > startOfBar) return startOfBar

  const previousBar = steps
    .slice(0, startOfBar)
    .reverse()
    .find((step) => step.measure !== undefined && step.measure < bar)?.measure

  if (previousBar === undefined) return 0
  return steps.findIndex((step) => step.measure === previousBar)
}
