export default function Results({
  title,
  stepCount,
  errors,
  skipped,
  elapsedMs,
  onPlayAgain,
  onBackToLibrary,
}: {
  title: string
  stepCount: number
  errors: number
  skipped: number
  elapsedMs: number
  onPlayAgain: () => void
  onBackToLibrary: () => void
}) {
  // Accuracy is steps / (steps + errors), as specified. Skipped steps are
  // reported next to it rather than folded into it: a step you chose to pass
  // over is not a wrong note, but it is not a played one either.
  const accuracy = Math.round((stepCount / (stepCount + errors)) * 100)

  return (
    <div className="results">
      <div className="results-body">
        <div className="label">{title}</div>
        <div className="accuracy">{accuracy}%</div>
        <div className="dim">accuracy</div>

        <dl className="results-stats">
          <div>
            <dt className="label">steps</dt>
            <dd>{stepCount}</dd>
          </div>
          <div>
            <dt className="label">wrong notes</dt>
            <dd>{errors}</dd>
          </div>
          {skipped > 0 && (
            <div>
              <dt className="label">skipped</dt>
              <dd>{skipped}</dd>
            </div>
          )}
          <div>
            <dt className="label">time</dt>
            <dd>{formatDuration(elapsedMs)}</dd>
          </div>
        </dl>
      </div>

      <div className="controls">
        <button onClick={onPlayAgain}>Play again</button>
        <button className="secondary" onClick={onBackToLibrary}>
          Back to library
        </button>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
