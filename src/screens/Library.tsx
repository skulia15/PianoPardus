import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deletePiece, listPieces } from '../lib/db'
import { ACCEPTED_EXTENSIONS, importFile } from '../lib/pieces'
import type { PieceRecord } from '../types'

export default function Library() {
  const [pieces, setPieces] = useState<PieceRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // The service worker redirects here when a share could not be read.
  const shareProblem =
    params.get('share') === 'empty'
      ? 'That share had no file attached.'
      : params.get('share') === 'failed'
        ? 'Could not read the shared file.'
        : null

  async function refresh() {
    setPieces(await listPieces())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // so picking the same file twice still fires
    setError(null)
    for (const file of files) {
      try {
        await importFile(file.name, file)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    await refresh()
  }

  async function onDelete(id: string) {
    await deletePiece(id)
    setConfirmDelete(null)
    await refresh()
  }

  return (
    <div className="screen">
      <div className="header">
        <h1>Keyway</h1>
        <button onClick={() => fileInput.current?.click()}>Import</button>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={onPick}
        />
      </div>

      {(error ?? shareProblem) && <div className="banner wrong">{error ?? shareProblem}</div>}

      <div className="scroll">
        {pieces === null ? null : pieces.length === 0 ? (
          <div className="empty">
            <strong>No pieces yet</strong>
            Find a <code>.musicxml</code> or <code>.mid</code> file in your browser and share it
            to Keyway, or use Import above.
          </div>
        ) : (
          <ul className="piece-list">
            {pieces.map((piece) => (
              <PieceRow
                key={piece.id}
                piece={piece}
                confirming={confirmDelete === piece.id}
                onOpen={() => navigate(`/play/${piece.id}`)}
                onLongPress={() => setConfirmDelete(piece.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onDelete={() => onDelete(piece.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function PieceRow({
  piece,
  confirming,
  onOpen,
  onLongPress,
  onCancelDelete,
  onDelete,
}: {
  piece: PieceRecord
  confirming: boolean
  onOpen: () => void
  onLongPress: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)

  function start() {
    longPressed.current = false
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      onLongPress()
    }, 500)
  }

  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <li className="piece">
      <button
        className="piece-open"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onClick={() => {
          if (!longPressed.current) onOpen()
        }}
      >
        <span className="piece-title">{piece.title}</span>
        <span className="piece-meta">
          <span className={`badge ${piece.source}`}>{piece.source === 'midi' ? 'MIDI' : 'XML'}</span>
          {piece.stepCount > 0 && <span className="dim">{piece.stepCount} steps</span>}
          <span className="dim">{new Date(piece.addedAt).toLocaleDateString()}</span>
        </span>
      </button>

      {confirming && (
        <div className="piece-confirm">
          <span className="dim">Delete this piece?</span>
          <div className="row">
            <button className="secondary" onClick={onCancelDelete}>
              Cancel
            </button>
            <button className="danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
