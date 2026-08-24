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

    // SCREENSHOT=player.png node tests/check.mjs — useful when the layout changes.
    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT })
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
