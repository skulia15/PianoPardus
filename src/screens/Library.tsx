import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deletePiece, listPieces } from '../lib/db'
import { ACCEPTED_EXTENSIONS, importFile, type ImportStage } from '../lib/pieces'
import { addStarterPiece, STARTER_PIECES, type StarterPiece } from '../lib/starter'
import type { PieceRecord } from '../types'

export default function Library() {
  const [pieces, setPieces] = useState<PieceRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<ImportStage | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
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
        await importFile(file.name, file, { onStage: setBusy })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    setBusy(null)
    await refresh()
  }

  async function onAddStarter(piece: StarterPiece) {
    setError(null)
    setAdding(piece.file)
    try {
      await addStarterPiece(piece, setBusy)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    setBusy(null)
    setAdding(null)
    await refresh()
  }

  async function onDelete(id: string) {
    await deletePiece(id)
    setConfirmDelete(null)
    await refresh()
  }

  const added = new Set((pieces ?? []).map((piece) => piece.fileName))

  return (
    <div className="screen">
      <div className="header">
        <h1>PianoPardus</h1>
        <button disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          {busy === null ? 'Import' : busy === 'reading' ? 'Reading…' : 'Engraving…'}
        </button>
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
      {busy === 'engraving' && (
        <div className="banner">
          <span className="dim">
            Working the notation out of the MIDI file. First time only, and it downloads the
            engraving engine.
          </span>
        </div>
      )}

      <div className="scroll">
        {pieces !== null && pieces.length === 0 && (
          <div className="empty">
            <strong>No pieces yet</strong>
            Find a <code>.musicxml</code> or <code>.mid</code> file in your browser and share it
            to PianoPardus, or use Import above. Or start with one of these.
          </div>
        )}

        {pieces !== null && pieces.length > 0 && (
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

        {pieces !== null && (
          <section className="starter">
            <h2 className="label">Starter pieces</h2>
            <p className="dim starter-intro">
              Public-domain classics, bundled with the app. Roughly easiest first.
            </p>
            <ul>
              {STARTER_PIECES.map((piece) => (
                <li key={piece.file}>
                  {added.has(piece.file) ? (
                    <div className="starter-row added">
                      <span className="starter-title">{piece.title}</span>
                      <span className="starter-meta">
                        {piece.composer} · <span className="dim">in your library</span>
                      </span>
                    </div>
                  ) : (
                    <button
                      className="starter-row"
                      disabled={busy !== null}
                      onClick={() => onAddStarter(piece)}
                    >
                      <span className="starter-title">{piece.title}</span>
                      <span className="starter-meta dim">
                        {adding === piece.file ? 'adding…' : `${piece.composer} · ${piece.note}`}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
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
        <span className="piece-title">
          {piece.title}
          {piece.composer && <span className="piece-composer dim"> · {piece.composer}</span>}
        </span>
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
