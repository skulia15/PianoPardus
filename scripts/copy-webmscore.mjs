// webmscore is loaded at runtime from a <script> tag rather than bundled: it is
// 17 MB of WebAssembly that most sessions never touch, and its loader resolves
// the .wasm files relative to its own script URL. Copying the four files it
// actually needs into public/ keeps them out of git while still serving them
// from our own origin.
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FILES = [
  'webmscore.js',
  'webmscore.lib.data',
  'webmscore.lib.mem.wasm',
  'webmscore.lib.wasm',
]

const from = (name) => fileURLToPath(new URL(`../node_modules/webmscore/${name}`, import.meta.url))
const to = (name) => fileURLToPath(new URL(`../public/webmscore/${name}`, import.meta.url))

export function copyWebmscore() {
  mkdirSync(fileURLToPath(new URL('../public/webmscore', import.meta.url)), { recursive: true })

  let copied = 0
  for (const name of FILES) {
    const source = statSync(from(name))
    let destination = null
    try {
      destination = statSync(to(name))
    } catch {
      // Not there yet.
    }
    if (destination && destination.size === source.size) continue
    copyFileSync(from(name), to(name))
    copied++
  }
  return copied
}

const copied = copyWebmscore()
if (copied > 0) console.log(`copied ${copied} webmscore file(s) into public/webmscore/`)
