import { putPiece } from './db'
import { titleFromMidi } from './midifile'
import { midiToMusicXml } from './notation'
import { composerFromMusicXml, readMusicXmlText, titleFromMusicXml } from './musicxml'
import { titleFromFileName } from './titles'
import type { PieceRecord, PieceSource } from '../types'

const MUSICXML = ['.musicxml', '.xml', '.mxl']
const MIDI = ['.mid', '.midi']

export function sourceForFileName(fileName: string): PieceSource | null {
  const lower = fileName.toLowerCase()
  if (MUSICXML.some((ext) => lower.endsWith(ext))) return 'musicxml'
  if (MIDI.some((ext) => lower.endsWith(ext))) return 'midi'
  return null
}

export const ACCEPTED_EXTENSIONS = [...MUSICXML, ...MIDI].join(',')

export type ImportStage = 'reading' | 'engraving'

/**
 * Stores the raw file and returns the new record. The score's own title is read
 * here if it has one; the step count is filled in when the player first parses
 * the piece, since that needs a rendered score.
 *
 * MIDI files are also engraved into MusicXML here, once, so that every later
 * open is fast and they get real notation. Engraving is allowed to fail — the
 * player falls back to the piano roll.
 */
export type ImportOptions = {
  onStage?: (stage: ImportStage) => void
  /** Overrides whatever the file says its title is — used for bundled pieces. */
  title?: string
  composer?: string
}

export async function importFile(
  fileName: string,
  blob: Blob,
  options: ImportOptions = {},
): Promise<PieceRecord> {
  const source = sourceForFileName(fileName)
  if (!source) {
    throw new Error(`${fileName} is not a MusicXML or MIDI file.`)
  }

  options.onStage?.('reading')

  // Reading the file early also checks it is readable at all.
  let title = options.title ?? titleFromFileName(fileName)
  let composer = options.composer
  let notationXml: string | undefined

  if (source === 'musicxml') {
    const xml = await readMusicXmlText(blob)
    if (!options.title) title = titleFromMusicXml(xml) ?? title
    composer = composer ?? composerFromMusicXml(xml) ?? undefined
  } else {
    if (!options.title) title = (await titleFromMidi(blob)) ?? title
    options.onStage?.('engraving')
    notationXml = (await midiToMusicXml(blob)) ?? undefined
  }

  const record: PieceRecord = {
    id: crypto.randomUUID(),
    title,
    fileName,
    source,
    addedAt: Date.now(),
    stepCount: 0,
    blob,
    ...(composer ? { composer } : {}),
    ...(notationXml ? { notationXml } : {}),
  }
  await putPiece(record)
  return record
}
