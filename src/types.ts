export type PieceSource = 'musicxml' | 'midi'

/** One vertical slice of the score: a single note, a chord, or both hands together. */
export type Step = {
  index: number
  notes: number[] // MIDI note numbers, sorted, sounded together
  measure?: number
  osmdCursorIndex?: number // MusicXML only
  /**
   * When this step sounds, in seconds from the start, at the score's own tempo.
   * Used only for playback — the matching engine has no notion of time.
   */
  timeSeconds?: number
}

export type Piece = {
  id: string
  title: string
  source: PieceSource
  steps: Step[]
  rawFile: Blob
}

/** What actually lives in IndexedDB. Steps are rebuilt from the raw file on open. */
export type PieceRecord = {
  id: string
  title: string
  composer?: string
  fileName: string
  source: PieceSource
  addedAt: number
  stepCount: number
  blob: Blob
  /** MusicXML engraved from a MIDI file at import, when that worked. */
  notationXml?: string
  /** Set when the engraving came out badly enough that the roll is preferable. */
  notationHidden?: boolean
}

/** A file handed over by the Android share sheet, waiting to be imported. */
export type InboxRecord = {
  id: string
  fileName: string
  blob: Blob
  receivedAt: number
}
