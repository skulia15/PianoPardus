import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import JumpControl from '../components/JumpControl'
import Keyboard from '../components/Keyboard'
import Notation from '../components/Notation'
import PianoRoll from '../components/PianoRoll'
import Results from '../components/Results'
import { getPiece, putPiece } from '../lib/db'
import { chordName } from '../lib/chords'
import { INITIAL_WINDOW, windowFor } from '../lib/keys'
import { useMatcher } from '../lib/matcher'
import { midiStatusMessage, useMidi } from '../lib/midi'
import { parseMidiSteps } from '../lib/midifile'
import { checkPitchMapping, readMusicXmlText } from '../lib/musicxml'
import { noteName } from '../lib/notes'
import { gapMs, SPEEDS, usePlayback } from '../lib/playback'
import { skipBackIndex } from '../lib/steps'
import { useWakeLock } from '../lib/wakelock'
import type { PieceRecord, Step } from '../types'

export default function Player() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [record, setRecord] = useState<PieceRecord | null>(null)
  const [xml, setXml] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null means "whatever the piece was left set to".
  const [hideOverride, setHideOverride] = useState<boolean | null>(null)
  const [speed, setSpeed] = useState(1)
  const [echo, setEcho] = useState(true)

  const matcher = useMatcher(steps)

  // Input is ignored while the piece is playing itself: you are listening, and a
  // fumbled note then should not count against you.
  const playingRef = useRef(false)
  const midi = useMidi(
    useCallback((note: number) => {
      if (!playingRef.current) matcher.press(note)
    }, [matcher]),
    useCallback((note: number) => {
      if (!playingRef.current) matcher.release(note)
    }, [matcher]),
  )

  const playback = usePlayback({
    steps,
    stepIndex: matcher.stepIndex,
    speed,
    onAdvance: useCallback(
      (index: number, holdMs: number) => {
        matcher.jumpTo(index)
        if (echo && steps) midi.playNotes(steps[index].notes, holdMs)
      },
      [matcher, echo, steps, midi],
    ),
  })
  playingRef.current = playback.playing

  useEffect(() => () => midi.silence(), [midi.silence])

  // Held for as long as the player is open, not just while it is playing itself:
  // waiting for you to find the next chord is exactly when the screen goes dark.
  useWakeLock(true)

  useEffect(() => {
    let cancelled = false
    setXml(null)
    setSteps(null)
    setWarning(null)
    setError(null)

    ;(async () => {
      if (!id) return
      const found = await getPiece(id)
      if (cancelled) return
      if (!found) {
        setError('That piece is no longer in the library.')
        return
      }
      setRecord(found)

      const hidden = hideOverride ?? found.notationHidden ?? false
      try {
        if (found.source === 'musicxml') {
          const text = await readMusicXmlText(found.blob)
          if (!cancelled) setXml(text)
        } else if (found.notationXml && !hidden) {
          // Engraved from the MIDI at import time; from here it is an ordinary
          // score, cursor and bar numbers included.
          if (!cancelled) setXml(found.notationXml)
        } else {
          const parsed = await parseMidiSteps(found.blob)
          if (cancelled) return
          setSteps(parsed)
          if (found.stepCount !== parsed.length) {
            void putPiece({ ...found, stepCount: parsed.length })
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not read that file.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, hideOverride])

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

  // Worked out during render, not in an effect: an effect would leave the
  // keyboard a frame behind the step, briefly drawing the new notes against the
  // old window. windowFor is idempotent, so applying it while rendering is safe.
  const windowRef = useRef(INITIAL_WINDOW)
  windowRef.current = windowFor(step?.notes ?? [], windowRef.current)

  const chord = step ? chordName(step.notes) : null
  const midiMessage = midiStatusMessage(midi.status)
  const engraved = record?.source === 'midi' && Boolean(record.notationXml)
  const notationHidden = hideOverride ?? record?.notationHidden ?? false

  function togglePlayback() {
    if (playback.playing) {
      playback.stop()
      midi.silence()
      return
    }
    playback.play()
    if (echo && step && steps) midi.playNotes(step.notes, gapMs(steps, matcher.stepIndex, speed))
  }

  function cycleSpeed() {
    setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length])
  }

  function skipBack() {
    if (steps) matcher.jumpTo(skipBackIndex(steps, matcher.stepIndex))
  }

  function toggleNotation() {
    const next = !notationHidden
    setHideOverride(next)
    if (record) void putPiece({ ...record, notationHidden: next })
  }

  if (steps && matcher.done) {
    return (
      <div className="screen">
        <div className="header">
          <button className="icon" onClick={() => navigate('/')} aria-label="Back to library">
            ←
          </button>
          <h1>Finished</h1>
        </div>
        <Results
          title={record?.title ?? ''}
          stepCount={steps.length}
          errors={matcher.errors}
          elapsedMs={matcher.elapsedMs}
          onPlayAgain={matcher.restart}
          onBackToLibrary={() => navigate('/')}
        />
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="header">
        <button className="icon" onClick={() => navigate('/')} aria-label="Back to library">
          ←
        </button>
        <h1>{record?.title ?? 'Loading'}</h1>
        <span className="meta">
          {steps
            ? `${step?.measure ? `bar ${step.measure} · ` : ''}${Math.min(matcher.stepIndex + 1, steps.length)}/${steps.length}`
            : null}
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
      {steps?.length === 0 && (
        <div className="banner wrong">There are no playable notes in this file.</div>
      )}

      {xml && !error && (
        <Notation
          xml={xml}
          cursorIndex={step?.osmdCursorIndex}
          onSteps={onSteps}
          onError={setError}
        />
      )}

      {!xml && !error && record?.source === 'midi' && steps && (
        <>
          {!record.notationXml && (
            <p className="dim roll-caveat">
              No notation for this file — MIDI carries no engraving, and it could not be worked
              out.
            </p>
          )}
          <PianoRoll steps={steps} from={matcher.stepIndex} window={windowRef.current} />
        </>
      )}

      <div className="readout">
        <span className="label">next</span>
        <span className="readout-notes">
          {step ? step.notes.map(noteName).join(' · ') : steps ? 'done' : '…'}
        </span>
        {chord && <span className="readout-chord">{chord}</span>}
        <span className="readout-errors dim">
          {matcher.errors > 0 ? `${matcher.errors} wrong` : ''}
        </span>
      </div>

      <Keyboard
        window={windowRef.current}
        expected={step?.notes ?? []}
        held={matcher.held}
        wrong={matcher.wrong}
        flash={matcher.flash}
        onPress={matcher.press}
        onRelease={matcher.release}
      />

      <div className="controls">
        <button
          className="icon"
          onClick={skipBack}
          disabled={!steps}
          aria-label="Back to the start of the bar"
        >
          ⏮
        </button>
        <button
          className="icon"
          onClick={togglePlayback}
          disabled={!steps || steps.length === 0}
          aria-label={playback.playing ? 'Stop playing' : 'Play the piece'}
        >
          {playback.playing ? '⏸' : '▶'}
        </button>
        <button className="speed" onClick={cycleSpeed} aria-label="Playback speed">
          {speed}×
        </button>
        {steps && steps.length > 0 && (
          <JumpControl steps={steps} stepIndex={matcher.stepIndex} onJump={matcher.jumpTo} />
        )}
      </div>

      <div className="controls">
        <button className="secondary" onClick={matcher.restart}>
          Restart
        </button>
        {engraved && (
          <button className="secondary" onClick={toggleNotation}>
            {notationHidden ? 'Notation' : 'Roll'}
          </button>
        )}
        {midi.hasOutput && (
          <button className="secondary" onClick={() => setEcho((current) => !current)}>
            {echo ? 'Sound on' : 'Sound off'}
          </button>
        )}
      </div>

      {midi.status === 'connected' && (
        <div className="footnote dim">{midi.inputNames.join(', ')}</div>
      )}
    </div>
  )
}
