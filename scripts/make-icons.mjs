// Generates the PWA icons. Hand-rolled PNG writer so the repo needs no image
// tooling: run `node scripts/make-icons.mjs` after changing anything here.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const BG = [0x6b, 0x7c, 0xff]
const WHITE = [0xf2, 0xf3, 0xf8]
const BLACK = [0x14, 0x16, 0x1c]

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = 255
  }
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) set(x, y, color)
    }
  }

  rect(0, 0, size, size, BG)

  // A one-octave keyboard, kept inside the middle 60% so it survives masking.
  const kx = size * 0.2
  const kw = size * 0.6
  const ky = size * 0.29
  const kh = size * 0.42
  rect(kx, ky, kx + kw, ky + kh, WHITE)

  const whiteWidth = kw / 7
  for (let i = 1; i < 7; i++) {
    const x = kx + whiteWidth * i
    rect(x - size * 0.006, ky, x + size * 0.006, ky + kh, BG)
  }

  // Black keys sit between white keys 1-2, 2-3, 4-5, 5-6, 6-7.
  const blackWidth = whiteWidth * 0.58
  for (const i of [1, 2, 4, 5, 6]) {
    const centre = kx + whiteWidth * i
    rect(centre - blackWidth / 2, ky, centre + blackWidth / 2, ky + kh * 0.62, BLACK)
  }

  return px
}

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

function png(size) {
  const pixels = render(size)
  const stride = size * 4
  // One filter byte (0 = none) in front of every scanline.
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const file = new URL(`../public/icons/icon-${size}.png`, import.meta.url)
  writeFileSync(file, png(size))
  console.log(`wrote icon-${size}.png`)
}
