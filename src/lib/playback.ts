import { useEffect, useRef, useState } from 'react'
import type { Step } from '../types'

/** Speeds worth having on a practice tool. 1 is the score's own tempo. */
export const SPEEDS = [0.25, 0.5, 0.75, 1]

const DEFAULT_GAP_SECONDS = 0.4
const MIN_GAP_MS = 25
const MAX_GAP_MS = 4000

/** When a step sounds. Falls back to an even spacing for steps with no timing. */
function timeOf(steps: Step[], index: number): number {
  const clamped = Math.max(0, Math.min(index, steps.length - 1))
  return steps[clamped]?.timeSeconds ?? clamped * DEFAULT_GAP_SECONDS
}

/** How long a step sounds for, at the score's tempo divided by speed. */
export function gapMs(steps: Step[], index: number, speed: number): number {
  const seconds = timeOf(steps, index + 1) - timeOf(steps, index)
  const usable = seconds > 0 ? seconds : DEFAULT_GAP_SECONDS
  return Math.min(Math.max((usable * 1000) / speed, MIN_GAP_MS), MAX_GAP_MS)
}

/**
 * Walks the steps on a timer instead of waiting for input, following the piece's
 * own rhythm rather than ticking metronomically.
 *
 * Each step is scheduled against an absolute anchor rather than chained off the
 * previous timeout. Chaining looks equivalent and is not: a few milliseconds of
 * timer granularity and rendering per step compounds, and at 200 bpm that measured
 * as playback running about a tenth behind the score within ten seconds.
 */
export function usePlayback({
  steps,
  stepIndex,
  speed,
  onAdvance,
}: {
  steps: Step[] | null
  stepIndex: number
  speed: number
  onAdvance: (index: number, holdMs: number) => void
}) {
  const [playing, setPlaying] = useState(false)

  const onAdvanceRef = useRef(onAdvance)
  onAdvanceRef.current = onAdvance

  // "Step at `seconds` into the piece was due at wall-clock `at`."
  const anchorRef = useRef<{ seconds: number; at: number } | null>(null)
  const advancedToRef = useRef<number | null>(null)
  const speedRef = useRef(speed)

  useEffect(() => {
    if (!playing || !steps || steps.length === 0) {
      anchorRef.current = null
      return
    }

    if (stepIndex >= steps.length - 1) {
      setPlaying(false) // ran off the end
      return
    }

    // Anything that moved the cursor other than our own last advance — a skip
    // back, the bar slider, a speed change — invalidates the schedule.
    const movedByHand = advancedToRef.current !== stepIndex
    const speedChanged = speedRef.current !== speed
    speedRef.current = speed

    if (!anchorRef.current || movedByHand || speedChanged) {
      anchorRef.current = { seconds: timeOf(steps, stepIndex), at: performance.now() }
    }

    const anchor = anchorRef.current
    const due = anchor.at + ((timeOf(steps, stepIndex + 1) - anchor.seconds) * 1000) / speed

    let delay = Math.max(0, due - performance.now())
    const capped = delay > MAX_GAP_MS
    if (capped) delay = MAX_GAP_MS

    const timer = window.setTimeout(() => {
      advancedToRef.current = stepIndex + 1
      // A capped wait has left the schedule behind; start a fresh one.
      if (capped) anchorRef.current = null
      onAdvanceRef.current(stepIndex + 1, gapMs(steps, stepIndex + 1, speed))
    }, delay)

    return () => window.clearTimeout(timer)
  }, [playing, steps, stepIndex, speed])

  // A piece that reloads underneath us (notation toggled, say) should not keep playing.
  useEffect(() => {
    if (!steps) setPlaying(false)
  }, [steps])

  return {
    playing,
    play: () => setPlaying(true),
    stop: () => setPlaying(false),
    toggle: () => setPlaying((current) => !current),
  }
}
