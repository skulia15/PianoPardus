// Engraves a MIDI file into MusicXML with webmscore (MuseScore's engine), so a
// piece opens in the app with notation straight away instead of making it
// download the 17 MB engraving engine on first import.
//
//   node to-musicxml.cjs in.mid out.musicxml

// Node >= 21 defines `navigator` as a getter-only global; webmscore's Node shim
// assigns to it. Node >= 18's global fetch also hijacks the wasm loader, which
// cannot take a filesystem path. Both are browser-irrelevant.
Object.defineProperty(globalThis, 'navigator', {
  value: globalThis.navigator,
  writable: true,
  configurable: true,
})
delete globalThis.fetch

const { readFileSync, writeFileSync } = require('node:fs')
const WebMscore = require('webmscore')

async function main() {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) {
    console.error('usage: node to-musicxml.cjs <in.mid> <out.musicxml>')
    process.exit(1)
  }

  await WebMscore.ready
  const score = await WebMscore.load('midi', new Uint8Array(readFileSync(input)))
  try {
    const xml = await score.saveXml()
    writeFileSync(output, xml)
    console.log(`wrote ${output} (${(xml.length / 1024).toFixed(0)} kB)`)
  } finally {
    score.destroy()
  }
}

main().catch((error) => {
  console.error('failed:', error?.message ?? error)
  process.exit(1)
})
