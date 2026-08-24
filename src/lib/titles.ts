/**
 * Working out what a piece is called.
 *
 * The title embedded in a file is usually better than its filename — but not
 * always, because the fields it lives in are routinely filled with the name of
 * the instrument instead. A MIDI file's title comes from track 0's name event,
 * and plenty of exporters name that track "Piano" or "Nylon Guitar"; MusicXML
 * credits get the same treatment. Importing The Rains of Castamere and getting a
 * piece called "Nylon Guitar" is the result.
 */

/** Words that, on their own, describe a part rather than a piece. */
const PART_WORDS = new Set([
  // instruments
  'piano', 'pianoforte', 'keyboard', 'keys', 'harpsichord', 'clavier', 'organ',
  'guitar', 'guitars', 'bass', 'violin', 'viola', 'cello', 'violoncello',
  'contrabass', 'doublebass', 'string', 'strings', 'harp', 'flute', 'piccolo',
  'recorder', 'clarinet', 'oboe', 'bassoon', 'sax', 'saxophone', 'trumpet',
  'cornet', 'trombone', 'tuba', 'horn', 'brass', 'woodwind', 'drum', 'drums',
  'kit', 'percussion', 'timpani', 'vibraphone', 'marimba', 'xylophone',
  'glockenspiel', 'celesta', 'accordion', 'banjo', 'mandolin', 'ukulele',
  'sitar', 'fiddle', 'choir', 'chorus', 'voice', 'vocal', 'vocals', 'synth',
  'synthesizer', 'pad', 'ensemble', 'orchestra', 'band',
  // the adjectives that come with them
  'acoustic', 'electric', 'grand', 'upright', 'nylon', 'steel', 'distortion',
  'distorted', 'overdriven', 'muted', 'clean', 'fretless', 'slap', 'picked',
  'finger', 'fingered', 'bright', 'warm', 'soft', 'honky', 'tonk', 'jazz',
  'lead', 'solo',
  // parts and staves
  'right', 'left', 'hand', 'hands', 'rh', 'lh', 'treble', 'clef', 'staff',
  'stave', 'part', 'parts', 'track', 'upper', 'lower', 'top', 'bottom',
  'melody', 'accompaniment', 'channel',
  // placeholders
  'untitled', 'unnamed', 'new', 'midi', 'file', 'song', 'music', 'score',
  'sequence', 'conductor', 'tempo', 'master', 'main', 'default', 'instrument',
  'no', 'number', 'nr',
])

/**
 * True when every word is a part word, a number, or noise. "Nylon Guitar" and
 * "Right Hand" are rejected; "Piano Man" and "Piano Sonata No. 14" are not,
 * because one word in each is a real one.
 */
export function looksLikePartName(name: string): boolean {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  if (words.length === 0) return true

  return words.every((word) => PART_WORDS.has(word) || /^\d+$/.test(word))
}

/** The candidate, if it is worth using as a title at all. */
export function usableTitle(candidate: string | null | undefined): string | null {
  const title = candidate?.trim()
  if (!title) return null
  return looksLikePartName(title) ? null : title
}

/** Last resort, and often the best one: what the user called the file. */
export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  return withoutExtension.replace(/[_-]+/g, ' ').trim() || fileName
}
