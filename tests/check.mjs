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
const FAKE_WAKE_LOCK = readFileSync(here('./fake-wakelock.js'), 'utf8')

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
  // MIDI files are engraved on import, which takes a moment and loads the engine.
  await page.waitForFunction(() => !document.querySelector('.header button[disabled]'), null, {
    timeout: 120_000,
  })
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
  await page.addInitScript(FAKE_WAKE_LOCK)
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
    await page.waitForTimeout(200) // let the 90ms fill transition settle
    check(
      'all three are actually painted blue, not just classed',
      await page.evaluate(() => [
        ...new Set(
          Array.from(document.querySelectorAll('.key.expected rect')).map(
            (rect) => getComputedStyle(rect).fill,
          ),
        ),
      ]),
      ['rgb(76, 125, 255)'],
    )

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

    // --- Jump to measure --------------------------------------------------
    await page.locator('.jump input').fill('2')
    await checkReadout(page, 'jumping to bar 2 moves to its first step', 'C4 · E4 · G4')
    check('the jump control reads the current bar', await page.locator('.jump .label').textContent(), 'bar 2')
    await page.locator('.jump input').fill('1')
    await checkReadout(page, 'jumping back to bar 1 works too', 'C4')

    // --- Skip back --------------------------------------------------------
    await play(page, [60])
    await play(page, [62])
    await checkReadout(page, 'two notes in, part way through bar 1', 'E4')

    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await checkReadout(page, 'skip back returns to the start of the bar', 'C4')

    await page.locator('.jump input').fill('2')
    await checkReadout(page, 'at the start of bar 2', 'C4 · E4 · G4')
    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await checkReadout(page, 'skip back from a bar start goes to the previous bar', 'C4')

    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await page.waitForTimeout(150)
    check('skip back at the very start stays put', await readout(page), 'C4')

    // --- Playback ---------------------------------------------------------
    await page.evaluate(() => window.__midi.clearSent())
    await page.locator('button[aria-label="Play the piece"]').click()
    await checkReadout(page, 'playback advances with no input at all', 'D4')

    check(
      'playback sounds the notes on a connected instrument',
      await page.evaluate(() => window.__midi.noteOnsSent().map((message) => message.data[1])),
      [60, 62],
    )
    check(
      'and schedules the note-offs rather than leaving notes on',
      await page.evaluate(() =>
        window.__midi.sent.some((m) => (m.data[0] & 0xf0) === 0x80 && m.timestamp !== null),
      ),
      true,
    )

    // Four quarter notes at this score's tempo is about 2.4 s. A fixed tick
    // would come in around 1.6 s, so this distinguishes following the score's
    // rhythm from merely ticking — and catches the schedule drifting.
    const startedAt = Date.now()
    await page.waitForFunction(
      () => document.querySelector('.readout-notes')?.textContent === 'C4 · E4 · G4',
      null,
      { timeout: 10_000 },
    )
    const elapsed = Date.now() - startedAt
    check("playback follows the score's own tempo", elapsed > 1500 && elapsed < 3000, true)
    if (elapsed <= 1500 || elapsed >= 3000) console.log(`      elapsed ${elapsed}ms, expected ~1800`)

    check(
      'playback stops itself at the last step',
      await page.locator('button[aria-label="Play the piece"]').count(),
      1,
    )

    // Stopping part way leaves the cursor where it stands.
    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await checkReadout(page, 'skipped back to the start again', 'C4')
    await page.locator('button[aria-label="Play the piece"]').click()
    await checkReadout(page, 'playing again from the start', 'D4')
    await page.locator('button[aria-label="Stop playing"]').click()
    const stoppedAt = await readout(page)
    await page.waitForTimeout(1200)
    check('stopping halts it where it stands', await readout(page), stoppedAt)

    await page.locator('.controls button', { hasText: 'Sound' }).click()
    await page.evaluate(() => window.__midi.clearSent())
    await page.locator('button[aria-label="Play the piece"]').click()
    await page.waitForTimeout(1200)
    check('sound off plays silently', await page.evaluate(() => window.__midi.noteOnsSent().length), 0)
    await page.locator('button[aria-label="Stop playing"]').click()
    await page.locator('.controls button', { hasText: 'Sound' }).click()

    // A quarter note at this score's tempo is ~600 ms, so a quarter of that
    // speed must not have moved within 900 ms.
    await page.locator('.speed').click()
    check('the speed control cycles', await page.locator('.speed').textContent(), '0.25×')
    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await page.locator('button[aria-label="Back to the start of the bar"]').click()
    await checkReadout(page, 'back at the start for the speed check', 'C4')
    await page.locator('button[aria-label="Play the piece"]').click()
    await page.waitForTimeout(900)
    check('quarter speed really is slower', await readout(page), 'C4')
    await page.locator('button[aria-label="Stop playing"]').click()

    // --- MIDI file path ---------------------------------------------------
    await importFixture(page, 'scale-test.mid')
    check('MIDI file takes its title from the header', await page.getByText('Scale Test').count(), 1)

    await page.getByText('Scale Test').click()
    await page.locator('.readout-notes').waitFor()
    await page.waitForFunction(() => document.querySelector('.readout-notes').textContent !== '…')

    check('a MIDI file is engraved into notation on import', await page.locator('.notation svg').count(), 1)
    check('engraved MIDI gets bar numbers', (await page.locator('.header .meta').textContent()).includes('bar 1'), true)
    check('engraving agrees with the raw MIDI grouping on step count', (await page.locator('.header .meta').textContent()).includes('1/4'), true)
    check('first MIDI step is C4', await readout(page), 'C4')

    // --- Falling back to the piano roll -----------------------------------
    await page.locator('.controls button', { hasText: 'Roll' }).click()
    await page.waitForFunction(() => document.querySelector('.roll-svg') !== null, null, { timeout: 10_000 })
    check('the roll replaces the notation when asked', await page.locator('.notation').count(), 0)
    check('the roll draws the current step', await page.locator('.roll-note.current').count(), 1)
    check('the steps survive the switch', await readout(page), 'C4')

    await page.locator('.controls button', { hasText: 'Notation' }).click()
    await page.waitForFunction(() => document.querySelector('.notation svg') !== null, null, { timeout: 20_000 })
    check('and the notation comes back', await page.locator('.notation svg').count(), 1)

    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT.replace('.png', '-midi.png') })

    await play(page, [60])
    await checkReadout(page, 'MIDI piece advances on the right note', 'D4')
    await play(page, [62])
    await play(page, [64])
    await checkReadout(page, 'MIDI piece reaches the chord', 'C4 · E4 · G4')
    await play(page, [60, 64, 67])
    await page.locator('.accuracy').waitFor({ timeout: 3000 })
    check('a clean run is 100%', await page.locator('.accuracy').textContent(), '100%')

    // --- A step wider than the default keyboard window --------------------
    await importFixture(page, 'wide-test.mid')
    await page.getByText('Wide Test').click()
    await page.waitForFunction(() => document.querySelector('.readout-notes')?.textContent !== '…')

    check('a four-octave step is read correctly', await readout(page), 'C2 · C4 · C6')
    check('the keyboard widens to fit it', await page.locator('.key.white').count(), 35)
    check('so nothing is hidden off the edge', await page.locator('.offscreen').count(), 0)
    check('all three notes are visible and expected', await page.locator('.key.expected').count(), 3)

    await play(page, [36, 60, 84])
    await checkReadout(page, 'the wide chord advances', 'C4')
    // Deliberate: growing only. Letting it narrow again resized the keyboard on a
    // fifth of the steps of a real two-hand arrangement, which reads worse than
    // slightly thinner keys.
    check('and the keyboard keeps the wider window', await page.locator('.key.white').count(), 35)

    await page.locator('.header button').click()
    await page.locator('.piece').first().waitFor()
    check('all three pieces are listed', await page.locator('.piece').count(), 3)
    check('step counts are shown once known', (await page.locator('.piece-meta').first().textContent()).includes('2 steps'), true)
    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT.replace('.png', '-library.png') })

    // --- Bundled starter pieces -------------------------------------------
    check('the starter list is bundled', await page.locator('.starter-row').count(), 8)

    await page.locator('.starter-row', { hasText: 'Gymnopédie No. 1' }).click()
    await page.waitForFunction(
      () => document.querySelectorAll('.starter-row.added').length === 1,
      null,
      { timeout: 30_000 },
    )
    check('adding one puts it in the library', await page.locator('.piece').count(), 4)
    check(
      'with the title and composer from the manifest',
      (await page.locator('.piece-title').first().textContent()).trim(),
      'Gymnopédie No. 1 · Satie',
    )

    await page.locator('.piece-open', { hasText: 'Gymnopédie' }).first().click()
    await page.waitForFunction(() => document.querySelector('.readout-notes')?.textContent !== '…', null, { timeout: 30_000 })
    check('a bundled .mxl unzips and renders as notation', await page.locator('.notation svg').count(), 1)
    check('and it has bars to jump between', (await page.locator('.header .meta').textContent()).includes('bar 1'), true)

    // --- Screen wake lock -------------------------------------------------
    // Practising means nothing touches the phone, so the screen times out mid
    // piece unless the lock is held — and held again after every interruption.
    const lockState = () => page.evaluate(() => ({ active: window.__wakeLock.active, requests: window.__wakeLock.requests }))

    await page.waitForFunction(() => window.__wakeLock.active === 1, null, { timeout: 5_000 }).catch(() => {})
    check('the player holds a screen wake lock', (await lockState()).active, 1)

    const before = (await lockState()).requests
    await page.evaluate(() => window.__wakeLock.hide())
    check('the browser dropping it while hidden is not fought', (await lockState()).active, 0)

    await page.evaluate(() => window.__wakeLock.show())
    await page.waitForFunction(() => window.__wakeLock.active === 1, null, { timeout: 5_000 }).catch(() => {})
    check('and it is taken again when the page comes back', (await lockState()).active, 1)
    check('which needed a fresh request', (await lockState()).requests > before, true)

    await page.locator('.header button[aria-label="Back to library"]').click()
    await page.locator('.starter').waitFor()
    await page.waitForFunction(() => window.__wakeLock.active === 0, null, { timeout: 5_000 }).catch(() => {})
    check('and released again on the way out of the player', (await lockState()).active, 0)

    // --- Titles -----------------------------------------------------------
    // Vite serves the module, so the predicate can be exercised directly.
    const titles = await page.evaluate(async () => {
      const { looksLikePartName } = await import('/src/lib/titles.ts')
      const parts = ['Piano', 'Acoustic Grand Piano', 'Nylon Guitar', 'Right Hand', 'Track 1', 'Untitled', 'Voice', 'Staff 2', '', '   ']
      const real = ['The Rains of Castamere', 'Piano Man', 'Piano Sonata No. 14', 'Clair de Lune', 'Maple Leaf Rag', 'Gymnopédie No. 1']
      return {
        missed: parts.filter((name) => !looksLikePartName(name)),
        overreach: real.filter((name) => looksLikePartName(name)),
      }
    })
    check('instrument and part names are recognised as such', titles.missed, [])
    check('real titles containing an instrument word survive', titles.overreach, [])

    await importFixture(page, 'a-fine-test-piece.mid')
    check(
      'a file named after its instrument falls back to the filename',
      (await page.locator('.piece-title').first().textContent()).trim(),
      'a fine test piece',
    )
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
