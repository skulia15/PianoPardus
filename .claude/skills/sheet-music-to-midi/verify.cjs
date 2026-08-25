// Checks a candidate file against what the printed page says, so "it looks
// right" becomes something that either passes or fails.
//
//   node verify.cjs <file.mid|.musicxml|.mxl> \
//     --key -1 --time 6/8 --bars 16 --melody "A4 A4 A4 A#4 A#4 C5"
//
// Every flag is optional; only what you pass is checked. Exits non-zero on a
// mismatch, because a candidate that disagrees with the page is a different
// setting and must not be shipped as if it were the score.

const { readFileSync } = require('node:fs')
const path = require('node:path')

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const noteName = (midi) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1)

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i]
  }
  return options
}

function fromMidi(file) {
  const { Midi } = require(path.join(__dirname, '../../../node_modules/@tonejs/midi'))
  const midi = new Midi(readFileSync(file))

  const notes = midi.tracks.flatMap((track) => track.notes.map((n) => ({ time: n.time, midi: n.midi })))
  notes.sort((a, b) => a.time - b.time)

  const signature = midi.header.timeSignatures[0]?.timeSignature
  const key = midi.header.keySignatures?.[0]

  return {
    key: key ? keyToFifths(key) : null,
    time: signature ? `${signature[0]}/${signature[1]}` : null,
    bars: signature ? Math.round(midi.durationTicks / (midi.header.ppq * 4 * (signature[0] / signature[1]))) : null,
    notes,
  }
}

function keyToFifths(key) {
  // @tonejs/midi reports a key name; a fifths count is what MusicXML uses.
  const order = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
  const index = order.indexOf(String(key.key))
  return index === -1 ? null : index - 7
}

function fromMusicXml(file) {
  let xml = readFileSync(file, 'utf8')
  if (file.endsWith('.mxl')) {
    const { unzipSync, strFromU8 } = require(path.join(__dirname, '../../../node_modules/fflate'))
    const entries = unzipSync(new Uint8Array(readFileSync(file)))
    const name = Object.keys(entries).find((n) => !n.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(n))
    xml = strFromU8(entries[name])
  }

  // <part id=...> only — \b would also match <part-list> and <part-name>.
  const parts = xml.split(/<part(?=[ >])/).slice(1)
  const divisions = Number((/<divisions>(\d+)<\/divisions>/.exec(xml) || [0, 1])[1]) || 1

  const notes = []
  let bars = 0

  for (const part of parts) {
    const measures = part.match(/<measure\b[\s\S]*?<\/measure>/g) || []
    bars = Math.max(bars, measures.length)

    let time = 0        // in divisions, from the start of the part
    let lastOnset = 0   // so <chord/> notes attach to the note they follow

    for (const measure of measures) {
      // Sequential scan: notes advance time, backup and forward move it.
      const events = measure.match(/<note\b[\s\S]*?<\/note>|<backup>[\s\S]*?<\/backup>|<forward>[\s\S]*?<\/forward>/g) || []
      for (const event of events) {
        const duration = Number((/<duration>(\d+)<\/duration>/.exec(event) || [0, 0])[1])

        if (event.startsWith('<backup')) {
          time -= duration
          continue
        }
        if (event.startsWith('<forward')) {
          time += duration
          continue
        }

        const chord = /<chord\s*\/>/.test(event)
        const onset = chord ? lastOnset : time
        if (!chord) {
          lastOnset = time
          time += duration
        }

        const step = /<step>([A-G])<\/step>/.exec(event)
        const octave = /<octave>(-?\d+)<\/octave>/.exec(event)
        if (!step || !octave) continue // a rest

        const alter = Number((/<alter>(-?[\d.]+)<\/alter>/.exec(event) || [0, 0])[1])
        notes.push({
          time: onset / divisions,
          midi: (Number(octave[1]) + 1) * 12 + STEPS[step[1]] + alter,
        })
      }
    }
  }

  notes.sort((a, b) => a.time - b.time)

  const fifths = /<fifths>(-?\d+)<\/fifths>/.exec(xml)
  const beats = /<beats>(\d+)<\/beats>/.exec(xml)
  const beatType = /<beat-type>(\d+)<\/beat-type>/.exec(xml)

  return {
    key: fifths ? Number(fifths[1]) : null,
    time: beats && beatType ? `${beats[1]}/${beatType[1]}` : null,
    bars,
    notes,
  }
}

/** Top note of each group of notes that start together — the tune. */
function melodyOf(notes) {
  const line = []
  let start = -Infinity
  let group = null
  for (const note of notes) {
    if (!group || note.time - start > 1e-6) {
      group = []
      start = note.time
      line.push(group)
    }
    group.push(note.midi)
  }
  return line.map((group) => Math.max(...group))
}

const options = parseArgs(process.argv.slice(3))
const file = process.argv[2]
if (!file) {
  console.error('usage: node verify.cjs <file> [--key N] [--time B/T] [--bars N] [--melody "A4 A4 ..."]')
  process.exit(1)
}

const found = /\.midi?$/i.test(file) ? fromMidi(file) : fromMusicXml(file)
const melody = melodyOf(found.notes)

let failures = 0
function compare(label, stated, actual) {
  if (stated === undefined) {
    console.log(`  ${label.padEnd(9)} ${String(actual)}`)
    return
  }
  const ok = String(stated) === String(actual)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(9)} page says ${stated}, file has ${actual}`)
}

console.log(`${path.basename(file)} — ${found.notes.length} notes, range ${
  found.notes.length ? `${noteName(Math.min(...found.notes.map((n) => n.midi)))}–${noteName(Math.max(...found.notes.map((n) => n.midi)))}` : 'none'
}`)
compare('key', options.key, found.key)
compare('time', options.time, found.time)
compare('bars', options.bars, found.bars)

const opening = melody.slice(0, 12).map(noteName).join(' ')
if (options.melody) {
  const wanted = options.melody.trim().split(/\s+/)
  const got = melody.slice(0, wanted.length).map(noteName)
  const ok = wanted.join(' ') === got.join(' ')
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} melody    page says ${wanted.join(' ')}`)
  console.log(`     ${' '.repeat(9)} file has ${got.join(' ')}`)
} else {
  console.log(`  melody    ${opening}`)
}

console.log(failures === 0 ? '\nmatches the page' : `\n${failures} mismatch(es) — this is a different setting, do not ship it`)
process.exit(failures === 0 ? 0 : 1)
