// End-to-end checks in a headless browser with a fake MIDI keyboard, so the
// logic can be verified without the phone. Run: node tests/check.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = 5199
const BASE = `http://localhost:${PORT}`
const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const FAKE_MIDI = readFileSync(here('./fake-midi.js'), 'utf8')

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`)
}

function startServer() {
  // Run vite's bin directly rather than through npx, so killing it actually
  // kills the server and not just a wrapper.
  const server = spawn(process.execPath, [here('../node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], {
    cwd: here('..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dev server did not start')), 60_000)
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ready in') || chunk.toString().includes('Local:')) {
        clearTimeout(timer)
        resolve(server)
      }
    })
    server.stderr.on('data', (chunk) => process.stderr.write(chunk))
  })
}

async function importFixture(page, file) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('input[type=file]').setInputFiles(here(`../samples/${file}`))
  await page.locator('.piece-title').first().waitFor()
}


const readout = (page) => page.locator('.readout-notes').textContent()

async function play(page, notes) {
  await page.evaluate((list) => window.__midi.play(list), notes)
}

async function checkReadout(page, label, expected) {
  try {
    await page.waitForFunction(
      (text) => document.querySelector('.readout-notes')?.textContent === text,
      expected,
      { timeout: 3000 },
    )
  } catch {
    // Fall through to check() so the mismatch is reported rather than thrown.
  }
  check(label, await readout(page), expected)
}

async function main() {
  const server = await startServer()
  // CHROMIUM_PATH lets this run against a Chromium that is already on the
  // machine, instead of one downloaded by Playwright.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  // Roughly a Galaxy S24 viewport.
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
  await page.addInitScript(FAKE_MIDI)
  page.on('pageerror', (error) => {
    failures++
    console.log(`FAIL  uncaught page error: ${error.message}`)
  })

  try {
    // --- Import and parse -------------------------------------------------
    await importFixture(page, 'middle-c-test.musicxml')
    check('library shows the score title from the file', await page.locator('.piece-title').first().textContent(), 'Middle C Test')

    await page.locator('.piece-open').first().click()
    await page.locator('.readout-notes').waitFor()
    await page.waitForFunction(() => document.querySelector('.readout-notes').textContent !== '…')

    // --- The halfTone + 12 conversion ------------------------------------
    check('step 1 is middle C (MIDI 60 renders as C4)', await page.locator('.readout-notes').textContent(), 'C4')
    check('header counts five steps', (await page.locator('.header .meta').textContent()).includes('1/5'), true)
    check('notation rendered', await page.locator('.notation svg').count() > 0, true)

    check('one key highlighted for a single-note step', await page.locator('.key.expected').count(), 1)

    // --- Matching engine --------------------------------------------------
    await play(page, [61]) // C#4 against an expected C4
    check('a wrong note does not advance', await readout(page), 'C4')
    check('a wrong note is counted', await page.locator('.readout-errors').textContent(), '1 wrong')

    await play(page, [60])
    await checkReadout(page, 'the right note advances to D4', 'D4')
    await play(page, [62])
    await checkReadout(page, 'step 3 is E4', 'E4')
    await play(page, [64])
    await checkReadout(page, 'step 4 is F#4 (alter is applied)', 'F#4')
    await play(page, [66])
    await checkReadout(page, 'step 5 is the C major chord', 'C4 · E4 · G4')
    check('three keys highlighted for a chord', await page.locator('.key.expected').count(), 3)

    // SCREENSHOT=player.png node tests/check.mjs — useful when the layout changes.
    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT })

    // Rolled one note at a time, which is how a chord is actually played.
    await page.evaluate(() => window.__midi.noteOn(60))
    await page.evaluate(() => window.__midi.noteOn(64))
    check('a partial chord does not advance', await readout(page), 'C4 · E4 · G4')
    await page.evaluate(() => window.__midi.noteOn(67))

    // --- Results ----------------------------------------------------------
    await page.locator('.accuracy').waitFor({ timeout: 3000 })
    check('accuracy is steps / (steps + errors)', await page.locator('.accuracy').textContent(), '83%')
    check('errors are reported', await page.locator('.results-stats dd').nth(1).textContent(), '1')
    check('step count is reported', await page.locator('.results-stats dd').nth(0).textContent(), '5')

    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT.replace('.png', '-results.png') })

    await page.getByText('Play again').click()
    await checkReadout(page, 'play again starts over', 'C4')
    check('play again clears the error count', await page.locator('.readout-errors').textContent(), '')
  } finally {
    await browser.close()
    server.kill('SIGTERM')
  }

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
