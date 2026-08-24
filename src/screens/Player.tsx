import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Keyboard, { windowStartFor } from '../components/Keyboard'
import Notation from '../components/Notation'
import { getPiece, putPiece } from '../lib/db'
import { useMatcher } from '../lib/matcher'
import { midiStatusMessage, useMidiInput } from '../lib/midi'
import { checkPitchMapping, readMusicXmlText } from '../lib/musicxml'
import { noteName } from '../lib/notes'
import type { PieceRecord, Step } from '../types'

export default function Player() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [record, setRecord] = useState<PieceRecord | null>(null)
  const [xml, setXml] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [windowStart, setWindowStart] = useState(48) // C3, so C4 sits mid-keyboard

  const matcher = useMatcher(steps)
  const midi = useMidiInput(
    useCallback((note: number) => matcher.press(note), [matcher]),
    useCallback((note: number) => matcher.release(note), [matcher]),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      const found = await getPiece(id)
      if (cancelled) return
      if (!found) {
        setError('That piece is no longer in the library.')
        return
      }
      setRecord(found)
      try {
        setXml(await readMusicXmlText(found.blob))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not read that file.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const onSteps = useCallback(
    (parsed: Step[]) => {
      setSteps(parsed)
      if (xml) setWarning(checkPitchMapping(xml, parsed))
      // Keep the library's step count honest now that we know it.
      if (record && record.stepCount !== parsed.length) {
        const updated = { ...record, stepCount: parsed.length }
        setRecord(updated)
        void putPiece(updated)
      }
    },
    [record, xml],
  )

  const step = steps?.[matcher.stepIndex]

  useEffect(() => {
    setWindowStart((previous) => windowStartFor(step?.notes ?? [], previous))
  }, [step])

  const midiMessage = midiStatusMessage(midi.status)

  return (
    <div className="screen">
      <div className="header">
        <button className="icon" onClick={() => navigate('/')} aria-label="Back to library">
          ←
        </button>
        <h1>{record?.title ?? 'Loading'}</h1>
        <span className="meta">
          {steps ? `bar ${step?.measure ?? '–'} · ${Math.min(matcher.stepIndex + 1, steps.length)}/${steps.length}` : null}
        </span>
      </div>

      {error && <div className="banner wrong">{error}</div>}
      {warning && <div className="banner wrong">{warning}</div>}
      {midiMessage && (
        <div className="banner">
          <span className="dim">{midiMessage}</span>
          <button className="secondary" onClick={() => void midi.connect()}>
            Connect keyboard
          </button>
        </div>
      )}

      {xml && !error && (
        <Notation
          xml={xml}
          cursorIndex={step?.osmdCursorIndex}
          onSteps={onSteps}
          onError={setError}
        />
      )}

      <div className="readout">
        <span className="label">next</span>
        <span className="readout-notes">
          {step ? step.notes.map(noteName).join(' · ') : steps ? 'done' : '…'}
        </span>
        <span className="readout-errors dim">{matcher.errors > 0 ? `${matcher.errors} wrong` : ''}</span>
      </div>

      <Keyboard
        windowStart={windowStart}
        expected={step?.notes ?? []}
        held={matcher.held}
        wrong={matcher.wrong}
        flash={matcher.flash}
        onPress={matcher.press}
        onRelease={matcher.release}
      />

      <div className="controls">
        <button className="secondary" onClick={matcher.restart}>
          Restart
        </button>
      </div>
    </div>
  )
}
