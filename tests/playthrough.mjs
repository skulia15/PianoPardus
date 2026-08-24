// Imports a real file and plays every step of it through the fake keyboard,
// reporting how the app coped. Real files are where the interesting problems
// are: this is what caught the keyboard hiding notes on wide two-hand steps.
//
//   node tests/playthrough.mjs path/to/piece.mid
//   STOP_AT=112 SHOT=look.png node tests/playthrough.mjs path/to/piece.mid
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 5196
const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const file = process.argv[2] && resolve(process.argv[2])
const stopAt = Number(process.env.STOP_AT || 0)

if (!file || !existsSync(file)) {
  console.error('Usage: node tests/playthrough.mjs <file.musicxml|.mxl|.mid>')
  process.exit(1)
}

function startServer() {
  const server = spawn(
    process.execPath,
    [here('../node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
    { cwd: here('..'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return new Promise((resolve_, reject) => {
    const timer = setTimeout(() => reject(new Error('dev server did not start')), 60_000)
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ready in')) {
        clearTimeout(timer)
        resolve_(server)
      }
    })
    server.stderr.on('data', (chunk) => process.stderr.write(chunk))
  })
}

const server = await startServer()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
await page.addInitScript(readFileSync(here('./fake-midi.js'), 'utf8'))
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(file)
await page.locator('.piece-open').first().waitFor()

await page.locator('.piece-open').first().click()
await page.waitForFunction(() => document.querySelector('.readout-notes')?.textContent !== '…')
console.log('title:      ', await page.locator('.header h1').textContent())
console.log('steps:      ', await page.locator('.header .meta').textContent())
console.log('first step: ', await page.locator('.readout-notes').textContent())

const report = await page.evaluate(async (limit) => {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const toMidi = (name) => {
    const match = /^([A-G]#?)(-?\d+)$/.exec(name.trim())
    return NAMES.indexOf(match[1]) + (Number(match[2]) + 1) * 12
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))

  let played = 0
  let namedChords = 0
  const chordSamples = new Set()
  let hiddenSteps = 0
  let worstHidden = 0
  let worstStep = null
  let resizes = 0
  let lastWidth = null
  const widths = {}

  for (let guard = 0; guard < 20_000; guard++) {
    if (limit && played >= limit) break

    const readout = document.querySelector('.readout-notes')
    if (!readout) break // the results screen replaced the player
    const text = readout.textContent
    if (!text || text === 'done' || text === '…') break

    const hidden = Array.from(document.querySelectorAll('.offscreen')).reduce(
      (total, element) => total + Number(element.textContent.replace(/\D/g, '')),
      0,
    )
    if (hidden > 0) {
      hiddenSteps++
      if (hidden > worstHidden) {
        worstHidden = hidden
        worstStep = { step: played + 1, notes: text, hidden }
      }
    }

    const chord = document.querySelector('.readout-chord')?.textContent
    if (chord) {
      namedChords++
      if (chordSamples.size < 10) chordSamples.add(chord)
    }

    const width = document.querySelectorAll('.key.white').length
    widths[width] = (widths[width] || 0) + 1
    if (lastWidth !== null && width !== lastWidth) resizes++
    lastWidth = width

    const notes = text.split('·').map(toMidi)
    for (const note of notes) window.__midi.noteOn(note)
    for (const note of notes) window.__midi.noteOff(note)
    played++
    await frame()
  }

  return { played, hiddenSteps, worstHidden, worstStep, resizes, widths, namedChords, chordSamples: [...chordSamples] }
}, stopAt)

console.log('played:     ', report.played, 'steps')
console.log('notes hidden off the keyboard edge:', report.hiddenSteps, 'step(s)', report.worstStep ? `worst: ${JSON.stringify(report.worstStep)}` : '')
console.log('keyboard resizes:', report.resizes, '| white keys shown:', JSON.stringify(report.widths))
console.log(
  'chords named:',
  `${report.namedChords}/${report.played}`,
  `(${Math.round((report.namedChords / Math.max(1, report.played)) * 100)}%)`,
  report.chordSamples.join(' '),
)

if (stopAt) {
  console.log('stopped at step', report.played, '| next:', await page.locator('.readout-notes').textContent())
} else {
  await page.locator('.accuracy').waitFor({ timeout: 10_000 }).catch(() => console.log('NO RESULTS SCREEN'))
  console.log('accuracy:   ', await page.locator('.accuracy').textContent())
}
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT })

await browser.close()
server.kill('SIGTERM')
