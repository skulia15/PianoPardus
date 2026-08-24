// MIDI carries no engraving information, so notation for a MIDI file has to be
// invented: quantise the timing, choose note values, split the staves, guess the
// key. webmscore is MuseScore's own engine compiled to WebAssembly, which does
// all of that far better than anything hand-rolled would.
//
// It is 17 MB, so it is fetched from a <script> tag on first use rather than
// bundled — most sessions never import a MIDI file. Its loader resolves the
// .wasm files relative to its own script URL, which is why a plain script tag is
// the right way to load it and a bundler import is not.

const SCRIPT_URL = '/webmscore/webmscore.js'

type Score = {
  saveXml: () => Promise<string>
  destroy: () => void
}

type WebMscoreApi = {
  ready: Promise<void>
  load: (format: string, data: Uint8Array) => Promise<Score>
}

declare global {
  interface Window {
    WebMscore?: WebMscoreApi
  }
}

let loading: Promise<WebMscoreApi> | null = null

function loadEngine(): Promise<WebMscoreApi> {
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const tag = document.createElement('script')
      tag.src = SCRIPT_URL
      tag.onload = () => resolve()
      tag.onerror = () => reject(new Error('Could not load the notation engine.'))
      document.head.appendChild(tag)
    })
      .then(async () => {
        const api = window.WebMscore
        if (!api) throw new Error('The notation engine loaded but did not register itself.')
        await api.ready
        return api
      })
      .catch((cause) => {
        loading = null // so a later import can try again, e.g. once back online
        throw cause
      })
  }
  return loading
}

/**
 * Engraves a MIDI file as MusicXML, or returns null if that cannot be done —
 * offline on the first attempt, a file the engine chokes on, or output with no
 * actual notes in it. Callers fall back to the piano roll.
 */
export async function midiToMusicXml(blob: Blob): Promise<string | null> {
  try {
    const engine = await loadEngine()
    const score = await engine.load('midi', new Uint8Array(await blob.arrayBuffer()))
    try {
      const xml = await score.saveXml()
      return isUsableNotation(xml) ? xml : null
    } finally {
      score.destroy()
    }
  } catch {
    return null
  }
}

function isUsableNotation(xml: string): boolean {
  return xml.includes('<measure ') && xml.includes('<pitch>')
}
