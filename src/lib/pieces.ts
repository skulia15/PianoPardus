import { putPiece } from './db'
import { titleFromMidi } from './midifile'
import { readMusicXmlText, titleFromMusicXml } from './musicxml'
import type { PieceRecord, PieceSource } from '../types'

const MUSICXML = ['.musicxml', '.xml', '.mxl']
const MIDI = ['.mid', '.midi']

export function sourceForFileName(fileName: string): PieceSource | null {
  const lower = fileName.toLowerCase()
  if (MUSICXML.some((ext) => lower.endsWith(ext))) return 'musicxml'
  if (MIDI.some((ext) => lower.endsWith(ext))) return 'midi'
  return null
}

export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  return withoutExtension.replace(/[_-]+/g, ' ').trim() || fileName
}

export const ACCEPTED_EXTENSIONS = [...MUSICXML, ...MIDI].join(',')

/**
 * Stores the raw file and returns the new record. The score's own title is read
 * here if it has one; the step count is filled in when the player first parses
 * the piece, since that needs a rendered score.
 */
export async function importFile(fileName: string, blob: Blob): Promise<PieceRecord> {
  const source = sourceForFileName(fileName)
  if (!source) {
    throw new Error(`${fileName} is not a MusicXML or MIDI file.`)
  }

  // Reading the title early also checks the file is readable at all.
  let title = titleFromFileName(fileName)
  if (source === 'musicxml') {
    title = titleFromMusicXml(await readMusicXmlText(blob)) ?? title
  } else {
    title = (await titleFromMidi(blob)) ?? title
  }

  const record: PieceRecord = {
    id: crypto.randomUUID(),
    title,
    fileName,
    source,
    addedAt: Date.now(),
    stepCount: 0,
    blob,
  }
  await putPiece(record)
  return record
}
