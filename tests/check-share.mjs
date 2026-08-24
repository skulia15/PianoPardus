// Checks the share target and offline behaviour, which only exist in a real
// build with the service worker running. Run: npm run build && npm run check:share
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = 5200
const BASE = `http://localhost:${PORT}`
const here = (path) => fileURLToPath(new URL(path, import.meta.url))

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`)
}

function startPreview() {
  const server = spawn(
    process.execPath,
    [here('../node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: here('..'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview server did not start')), 60_000)
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Local:')) {
        clearTimeout(timer)
        resolve(server)
      }
    })
    server.stderr.on('data', (chunk) => process.stderr.write(chunk))
  })
}

async function main() {
  if (!existsSync(here('../dist/sw.js'))) {
    console.error('No build found. Run `npm run build` first.')
    process.exit(1)
  }

  const server = await startPreview()
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } })
  const page = await context.newPage()

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 20_000,
    })
    check('service worker controls the page', true, true)

    // What Android's share sheet actually does: a multipart POST navigation to
    // the share target's action.
    await page.evaluate(() => {
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = '/import'
      form.enctype = 'multipart/form-data'
      const input = document.createElement('input')
      input.type = 'file'
      input.name = 'file'
      form.appendChild(input)
      document.body.appendChild(form)
      window.__shareForm = form
    })
    await page.locator('form input[type=file]').setInputFiles(here('../samples/middle-c-test.musicxml'))

    await Promise.all([
      page.waitForURL(/\/play\//, { timeout: 20_000 }),
      page.evaluate(() => window.__shareForm.submit()),
    ])
    check('a shared file opens in the player', await page.locator('.header h1').textContent(), 'Middle C Test')

    await page.goto(BASE, { waitUntil: 'networkidle' })
    check('the shared piece is in the library', await page.locator('.piece-title').count(), 1)

    // --- Offline ----------------------------------------------------------
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    check('library loads offline', await page.locator('.piece-title').first().textContent(), 'Middle C Test')

    await page.locator('.piece-open').first().click()
    await page.waitForFunction(() => document.querySelector('.readout-notes')?.textContent !== '…', null, { timeout: 20_000 })
    check('an imported piece plays offline', await page.locator('.readout-notes').textContent(), 'C4')

    // --- Cold deep link ---------------------------------------------------
    // /play/:id and /import are client-side routes with nothing behind them on
    // the server, so a host that does not fall back to index.html serves a 404.
    // vercel.json carries that rewrite; this checks the app itself copes with
    // being entered at a deep URL rather than routed to from the library.
    await context.setOffline(false)
    const deepLink = page.url()
    await page.goto(BASE)
    await page.goto(deepLink, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('.readout-notes')?.textContent !== '…', null, { timeout: 20_000 })
    check('a piece opens from a cold deep link', await page.locator('.readout-notes').textContent(), 'C4')
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
