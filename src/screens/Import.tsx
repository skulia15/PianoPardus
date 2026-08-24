import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { takeInbox } from '../lib/db'
import { importFile } from '../lib/pieces'

/**
 * Where the share sheet lands. The service worker has already stashed the file
 * in the inbox; this parses it, files it in the library and opens the player.
 */
export default function Import() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = params.get('id')

    ;(async () => {
      if (!id) {
        setError('Nothing was shared. Try sharing the file again.')
        return
      }

      const shared = await takeInbox(id)
      if (cancelled) return
      if (!shared) {
        setError('That shared file has already been imported.')
        return
      }

      try {
        const piece = await importFile(shared.fileName, shared.blob)
        if (!cancelled) navigate(`/play/${piece.id}`, { replace: true })
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not import that file.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params, navigate])

  return (
    <div className="screen">
      <div className="header">
        <h1>Importing</h1>
      </div>
      {error ? (
        <div className="empty">
          <strong>Import failed</strong>
          {error}
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => navigate('/', { replace: true })}>Back to library</button>
          </div>
        </div>
      ) : (
        <div className="empty">Reading the file…</div>
      )}
    </div>
  )
}
