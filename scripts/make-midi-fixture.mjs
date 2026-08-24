// Writes samples/scale-test.mid. Run `node scripts/make-midi-fixture.mjs` to
// regenerate it.
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
