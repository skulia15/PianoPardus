import { useEffect, useMemo, useReducer } from 'react'
import type { Step } from '../types'

const WRONG_FLASH_MS = 300
const CORRECT_FLASH_MS = 180

type State = {
  stepIndex: number
  held: number[]
  wrong: number[]
  flash: number[] // notes that just completed a step, shown green briefly
  errors: number
  startedAt: number | null
  finishedAt: number | null
}

type Action =
  | { type: 'press'; note: number; at: number }
  | { type: 'release'; note: number }
  | { type: 'jump'; index: number }
  | { type: 'clearWrong' }
  | { type: 'clearFlash' }
  | { type: 'restart' }

const initial: State = {
  stepIndex: 0,
  held: [],
  wrong: [],
  flash: [],
  errors: 0,
  startedAt: null,
  finishedAt: null,
}

function add(list: number[], note: number): number[] {
  return list.includes(note) ? list : [...list, note]
}

/**
 * The whole engine. Octave-exact matching, no timing window, no enharmonic
 * cleverness. Chords work because a superset check does not care about order,
 * so they can be rolled.
 */
function reduce(steps: Step[], state: State, action: Action): State {
  switch (action.type) {
    case 'press': {
      if (state.finishedAt !== null) return state

      const expected = steps[state.stepIndex]?.notes
      if (!expected) return state

      const held = add(state.held, action.note)
      const startedAt = state.startedAt ?? action.at

      if (!expected.includes(action.note)) {
        return {
          ...state,
          held,
          startedAt,
          errors: state.errors + 1,
          wrong: add(state.wrong, action.note),
        }
      }

      const complete = expected.every((note) => held.includes(note))
      if (!complete) return { ...state, held, startedAt }

      const stepIndex = state.stepIndex + 1
      return {
        ...state,
        stepIndex,
        held: [],
        flash: expected,
        startedAt,
        finishedAt: stepIndex >= steps.length ? action.at : null,
      }
    }

    case 'release':
      return { ...state, held: state.held.filter((note) => note !== action.note) }

    case 'jump':
      // Errors are kept: jumping around is practising, not starting over.
      return { ...state, stepIndex: action.index, held: [], wrong: [], flash: [], finishedAt: null }

    case 'clearWrong':
      return { ...state, wrong: [] }

    case 'clearFlash':
      return { ...state, flash: [] }

    case 'restart':
      return initial
  }
}

export type Matcher = {
  stepIndex: number
  held: Set<number>
  wrong: Set<number>
  flash: Set<number>
  errors: number
  done: boolean
  elapsedMs: number
  press: (note: number) => void
  release: (note: number) => void
  jumpTo: (index: number) => void
  restart: () => void
}

export function useMatcher(steps: Step[] | null): Matcher {
  const list = steps ?? []
  const [state, dispatch] = useReducer(
    (current: State, action: Action) => reduce(list, current, action),
    initial,
  )

  // Both flashes are purely visual, so they expire on a timer rather than on input.
  useEffect(() => {
    if (state.wrong.length === 0) return
    const timer = window.setTimeout(() => dispatch({ type: 'clearWrong' }), WRONG_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [state.wrong])

  useEffect(() => {
    if (state.flash.length === 0) return
    const timer = window.setTimeout(() => dispatch({ type: 'clearFlash' }), CORRECT_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [state.flash])

  return useMemo(
    () => ({
      stepIndex: state.stepIndex,
      held: new Set(state.held),
      wrong: new Set(state.wrong),
      flash: new Set(state.flash),
      errors: state.errors,
      done: list.length > 0 && state.finishedAt !== null,
      elapsedMs:
        state.startedAt === null ? 0 : (state.finishedAt ?? Date.now()) - state.startedAt,
      press: (note: number) => dispatch({ type: 'press', note, at: Date.now() }),
      release: (note: number) => dispatch({ type: 'release', note }),
      jumpTo: (index: number) => dispatch({ type: 'jump', index }),
      restart: () => dispatch({ type: 'restart' }),
    }),
    [state, list.length],
  )
}
