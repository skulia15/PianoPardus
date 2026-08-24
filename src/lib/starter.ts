import { importFile, type ImportStage } from './pieces'
import type { PieceRecord } from '../types'

export type StarterPiece = {
  file: string
  title: string
  composer: string
  note: string
}

/**
 * A handful of pieces bundled with the app so it is not empty on first run.
 *
 * All public-domain compositions, engraved from Mutopia Project typesettings —
 * see public/starter/CREDITS.md for sources and licences. Deliberately no
 * in-copyright music: importing your own copy of a film arrangement is your
 * business, shipping one inside the app is a licence you do not have.
 *
 * Ordered roughly easiest first, which is the order someone learning would want.
 */
export const STARTER_PIECES: StarterPiece[] = [
  {
    file: 'canon-in-d.mxl',
    title: 'Canon in D',
    composer: 'Pachelbel',
    note: 'melody line, one note at a time',
  },
  {
    file: 'gymnopedie-1.mxl',
    title: 'Gymnopédie No. 1',
    composer: 'Satie',
    note: 'slow and sparse',
  },
  {
    file: 'prelude-in-c.mxl',
    title: 'Prelude in C, BWV 846',
    composer: 'J. S. Bach',
    note: 'steady broken chords',
  },
  {
    file: 'nocturne-op9-no2.mxl',
    title: 'Nocturne Op. 9 No. 2',
    composer: 'Chopin',
    note: 'wide left hand',
  },
  {
    file: 'hall-of-the-mountain-king.mxl',
    title: 'In the Hall of the Mountain King',
    composer: 'Grieg',
    note: 'builds up fast',
  },
  {
    file: 'rondo-alla-turca.mxl',
    title: 'Rondo alla Turca',
    composer: 'Mozart',
    note: 'busy right hand',
  },
  {
    file: 'the-entertainer.mxl',
    title: 'The Entertainer',
    composer: 'Joplin',
    note: 'ragtime, two hands throughout',
  },
  {
    file: 'maple-leaf-rag.mxl',
    title: 'Maple Leaf Rag',
    composer: 'Joplin',
    note: 'the hardest of these',
  },
]

export async function addStarterPiece(
  piece: StarterPiece,
  onStage?: (stage: ImportStage) => void,
): Promise<PieceRecord> {
  const response = await fetch(`/starter/${piece.file}`)
  if (!response.ok) {
    throw new Error(`Could not load ${piece.title}. Are you offline?`)
  }

  return importFile(piece.file, await response.blob(), {
    onStage,
    title: piece.title,
    composer: piece.composer,
  })
}
