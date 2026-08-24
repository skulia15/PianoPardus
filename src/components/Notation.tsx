import { useEffect, useRef, useState } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { buildSteps, moveCursorTo } from '../lib/musicxml'
import type { Step } from '../types'

/**
 * Owns the OSMD instance: renders the score, builds the step list by walking the
 * cursor, and keeps the visible cursor on the current step.
 */
export default function Notation({
  xml,
  cursorIndex,
  onSteps,
  onError,
}: {
  xml: string
  cursorIndex: number | undefined
  onSteps: (steps: Step[]) => void
  onError: (message: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const [ready, setReady] = useState(false)

  // Held in refs so a new callback identity cannot trigger a re-render of the score.
  const onStepsRef = useRef(onSteps)
  const onErrorRef = useRef(onError)
  onStepsRef.current = onSteps
  onErrorRef.current = onError

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    setReady(false)

    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: true,
      backend: 'svg',
      darkMode: true,
      drawTitle: false,
      drawPartNames: false,
      drawMeasureNumbers: true,
      drawMeasureNumbersOnlyAtSystemStart: true,
      cursorsOptions: [{ type: 0, color: '#7c8cff', alpha: 0.4, follow: false }],
    })
    osmdRef.current = osmd

    osmd
      .load(xml)
      .then(() => {
        if (cancelled) return
        osmd.render()
        osmd.cursor.show()
        onStepsRef.current(buildSteps(osmd))
        osmd.cursor.reset()
        setReady(true)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        onErrorRef.current(
          cause instanceof Error ? cause.message : 'OpenSheetMusicDisplay could not read this file.',
        )
      })

    return () => {
      cancelled = true
      osmdRef.current = null
      try {
        osmd.clear()
      } catch {
        // Nothing useful to do if teardown fails; the container goes away anyway.
      }
    }
  }, [xml])

  useEffect(() => {
    const osmd = osmdRef.current
    if (!ready || !osmd || cursorIndex === undefined) return

    moveCursorTo(osmd, cursorIndex)
    scrollCursorIntoView(scrollRef.current, osmd.cursor.cursorElement)
  }, [ready, cursorIndex])

  return (
    <div className="notation" ref={scrollRef}>
      <div ref={hostRef} />
    </div>
  )
}

/** Keeps the cursor in view without jittering on every step. */
function scrollCursorIntoView(scroll: HTMLDivElement | null, cursor: HTMLElement | undefined) {
  if (!scroll || !cursor) return

  const box = scroll.getBoundingClientRect()
  const rect = cursor.getBoundingClientRect()
  const margin = 48

  if (rect.top >= box.top + margin && rect.bottom <= box.bottom - margin) return

  const delta = rect.top - box.top - box.height / 2 + rect.height / 2
  scroll.scrollTo({ top: scroll.scrollTop + delta, behavior: 'smooth' })
}
