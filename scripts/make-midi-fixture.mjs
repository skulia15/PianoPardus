// Writes the MIDI fixtures in samples/. Run `node scripts/make-midi-fixture.mjs`
// to regenerate them.
// @tonejs/midi is CommonJS, so Node needs the default import here. Vite's
// interop handles the named import used in the app itself.
import midiPkg from '@tonejs/midi'
import { writeFileSync } from 'node:fs'

const { Midi } = midiPkg
const midi = new Midi()
midi.header.name = 'Scale Test'
const track = midi.addTrack()
track.name = 'Piano'

// C4 D4 E4 one after another, then a C major chord sounded together.
const single = [60, 62, 64]
single.forEach((note, index) => {
  track.addNote({ midi: note, time: index * 0.5, duration: 0.4 })
})
for (const note of [60, 64, 67]) {
  track.addNote({ midi: note, time: 1.5, duration: 0.9 })
}

writeFileSync(new URL('../samples/scale-test.mid', import.meta.url), Buffer.from(midi.toArray()))
console.log('wrote samples/scale-test.mid')

// A step wider than two octaves, which is what both hands far apart looks like.
// The keyboard has to widen for this rather than hide the outer notes.
const wide = new Midi()
wide.header.name = 'Wide Test'
const wideTrack = wide.addTrack()
for (const note of [36, 60, 84]) {
  wideTrack.addNote({ midi: note, time: 0, duration: 1 })
}
wideTrack.addNote({ midi: 60, time: 1.5, duration: 0.5 })

writeFileSync(new URL('../samples/wide-test.mid', import.meta.url), Buffer.from(wide.toArray()))
console.log('wrote samples/wide-test.mid')

// A file that names itself after its instrument, which is what most MIDI files
// downloaded from the web actually do. The title has to come from the filename
// here, not from the file.
const instrument = new Midi()
instrument.header.name = 'Acoustic Grand Piano'
const instrumentTrack = instrument.addTrack()
instrumentTrack.name = 'Acoustic Grand Piano'
;[60, 62].forEach((note, index) => {
  instrumentTrack.addNote({ midi: note, time: index * 0.5, duration: 0.4 })
})

writeFileSync(
  new URL('../samples/a-fine-test-piece.mid', import.meta.url),
  Buffer.from(instrument.toArray()),
)
console.log('wrote samples/a-fine-test-piece.mid')
