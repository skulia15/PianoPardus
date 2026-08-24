import { noteName } from '../lib/notes'
import type { Step } from '../types'

/** Stands in for the notation pane on MIDI pieces, which have no score to render. */
export default function Upcoming({ steps, from }: { steps: Step[]; from: number }) {
  const next = steps.slice(from + 1, from + 5)

  return (
    <div className="upcoming">
      <p className="dim upcoming-caveat">No notation available for MIDI files.</p>
      <ol className="upcoming-list">
        {next.map((step) => (
          <li key={step.index}>
            <span className="dim">{step.index + 1}</span>
            <span>{step.notes.map(noteName).join(' · ')}</span>
          </li>
        ))}
        {next.length === 0 && <li className="dim">last step</li>}
      </ol>
    </div>
  )
}
