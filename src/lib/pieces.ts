import { putPiece } from './db'
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
 * Stores the raw file and returns the new record. Nothing is parsed here beyond
 * working out the format — parsing happens when the player opens the piece.
 */
export async function importFile(fileName: string, blob: Blob): Promise<PieceRecord> {
  const source = sourceForFileName(fileName)
  if (!source) {
    throw new Error(`${fileName} is not a MusicXML or MIDI file.`)
  }
  const record: PieceRecord = {
    id: crypto.randomUUID(),
    title: titleFromFileName(fileName),
    fileName,
    source,
    addedAt: Date.now(),
    stepCount: 0,
    blob,
  }
  await putPiece(record)
  return record
}
