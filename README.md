# PianoPardus

A phone-first play-along piano practice PWA. Plug a MIDI keyboard into an Android
phone over USB-C, import a MusicXML or MIDI file, and play through it with the
notation on screen and a piano diagram showing which keys come next. The app
waits for the correct notes before advancing, so it is impossible to get lost,
and reports accuracy at the end.

No accounts, no backend, no built-in song library. Everything is local, and an
imported piece plays with no network at all.

The full specification is in [`pianopardus-spec.md`](pianopardus-spec.md).

## Status

All ten steps of the build order are implemented. What is verified in a headless
browser, and what still needs the physical device, is listed under
[Verification](#verification).

## Running it

```sh
npm install
npm run dev          # http://localhost:5173
```

`navigator.requestMIDIAccess()` needs a secure context, so `http://localhost` is
fine on the machine running the dev server, but testing on the phone needs HTTPS
or a localhost-equivalent origin:

**Cloudflare quick tunnel** — real HTTPS, nothing to sign up for, and it leaves
the phone's USB-C port free for the keyboard:

```sh
npm run build && npm run preview   # or npm run dev
cloudflared tunnel --url http://localhost:4173
```

Open the printed `https://<random>.trycloudflare.com` on the phone. `ngrok http
4173` works the same way.

**`adb reverse`** — `http://localhost` counts as a secure context, so forwarding
over USB sidesteps HTTPS entirely:

```sh
adb reverse tcp:4173 tcp:4173
```

Then open `http://localhost:4173` on the phone. This occupies the phone's USB-C
port with the laptop cable, so it only helps if you have a hub.

**Deploy it** for the most representative test — see [Deploying](#deploying).
Install to the home screen from there.

The service worker is disabled in dev mode — it would serve stale builds and cost
an hour. It only exists in real builds, which means **the share target and
offline mode can only be tested against `npm run preview` or a deployment.**

## Deploying

`vercel.json` is set up, so importing the repo at
[vercel.com/new](https://vercel.com/new) is the whole job: framework preset Vite,
build `npm run build`, output `dist`. Every push to `main` then deploys itself.

Three things in that config are load-bearing:

- **The SPA rewrite.** `/play/:id` and `/import` are client-side routes with
  nothing behind them on the server. Without the rewrite to `index.html`, a cold
  visit to either one is a 404 — Vercel's Vite preset does not add this. Static
  files still win, because rewrites are only consulted after the filesystem.
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.** Playwright is a devDependency and
  Vercel installs devDependencies, so without this every build downloads a
  browser it will never run.
- **No long cache on `sw.js` or the manifest.** A cached service worker is how
  you end up staring at a build from last week.

The deployed URL is HTTPS, which is what Web MIDI needs, and installing from it
is what makes the share target work at all. Any other static host is fine too;
it needs the same SPA fallback.

## Using it

1. **Import.** Tap Import on the library screen and pick a `.musicxml`, `.xml`,
   `.mxl`, `.mid` or `.midi` file. Once the app is installed to the home screen
   you can also share a file to it from Chrome or Drive.
2. **Play.** Tap a piece. The blue keys are what to play next; the cursor sits on
   the current step. Play them and it advances. A wrong note flashes red and
   counts against you but changes nothing else.
3. **Finish.** The last step opens the results screen: accuracy, wrong notes,
   elapsed time.

Restart and a bar-jump slider are under the keyboard. There is no play/pause —
the app is always waiting for input.

The on-screen keys are tappable as well as MIDI-driven. That is not in the spec;
it is there because it is the only way to exercise the matching engine without
the keyboard plugged in, and it is what the automated checks use.

### How wide the keyboard is

Two octaves by default, windowed on the notes to play. A step spanning more than
that — both hands wide apart, which is normal in real arrangements — widens the
window instead of hiding the outer notes, up to six octaves.

It grows but never shrinks within a piece. That is a measured decision, not
laziness: on a real two-hand arrangement, letting the window narrow again resized
the keyboard on a fifth of all steps, and a keyboard that stays where you learned
it reads better than one that is always the ideal width. Growing only, the same
piece resizes twice from beginning to end.

## Verification

```sh
npm run check                        # dev server + headless browser, 40 checks
npm run build && npm run check:share # share target and offline, 6 checks
```

`tests/check.mjs` drives the app through a fake MIDI device (`tests/fake-midi.js`
replaces `navigator.requestMIDIAccess`), so the parser, the matching engine and
the results maths are all checked without hardware. Set `CHROMIUM_PATH` to use a
Chromium already on the machine instead of one Playwright downloads.

There is also a tool for running a real file end to end:

```sh
node tests/playthrough.mjs ~/Downloads/some-piece.mid
```

It imports the file, plays every step through the fake keyboard, and reports the
step count, the accuracy it ended on, whether any notes were hidden off the
keyboard's edge, and how often the keyboard resized. Real files are where the
interesting problems are — this is what caught the keyboard hiding notes on wide
two-hand steps, on a 429-step arrangement where 55% of steps span more than two
octaves.

Covered: the `halfTone + 12` conversion (middle C comes out as MIDI 60),
`<alter>` handling, chord grouping in both formats, wrong notes counting without
advancing, partial chords not advancing, accuracy arithmetic, bar jumping, the
keyboard widening for a four-octave step, the MIDI-only mode, a multipart share
POST exactly as Android sends it, and loading and playing with the network cut.

**Still needs the phone**, because nothing else can prove it:

- A real keyboard being enumerated over USB-C, and its note-ons arriving.
- Whether the notation is legible and auto-scrolls sensibly on a real score
  longer than two bars.
- The Android share sheet actually offering PianoPardus (the POST handler is verified,
  the OS-level matching is not).
- Installing to the home screen.

`spike/midi-test.html` is the standalone page from step 1. It has no
dependencies, so it stays the fastest way to answer "is the adapter the problem":
serve it over HTTPS, tap Connect MIDI, play a key.

## Known limitations

Deliberate, from the spec:

- **No iOS.** Safari has no Web MIDI. This will not change.
- **No tempo, rhythm or dynamics.** A step is one vertical slice of the score;
  play its notes in any order and it advances. Velocity and the sustain pedal are
  ignored.
- **Octave-exact matching.** No enharmonic or transposition cleverness.
- **Repeated notes need a re-press.** The held set is cleared when a step
  completes, so the same note in consecutive steps has to be released and played
  again. This is how a person would play it anyway.
- **No notation for MIDI files.** MIDI carries no engraving information. Those
  pieces show the next four steps as text instead, and say so.
- **Nothing is kept from the results screen.** No history, no streaks.

Worth knowing:

- **MIDI files include every track.** Drums and bass come through as notes to
  play, which makes a full pop arrangement unplayable. Filtering percussion is a
  one-line change in `src/lib/midifile.ts` if that becomes annoying.
- **Grace notes become their own steps.** Filter on `note.IsGraceNote` in
  `src/lib/musicxml.ts` if they get irritating.
- **A step with more than six notes** means something was parsed wrong, not that
  the arrangement is dense.
- **All connected MIDI inputs are used at once**, rather than making you choose
  one. The connected input's name is shown under the keyboard.

## Layout

```
src/
  screens/     Library, Player, Import (the share-sheet landing)
  components/  Notation (OSMD), Keyboard (SVG), Upcoming, Results, JumpControl
  lib/
    musicxml.ts  .mxl unzip, cursor walk to steps, pitch-mapping check
    midifile.ts  @tonejs/midi flatten and chord grouping
    matcher.ts   the entire matching engine
    midi.ts      Web MIDI input
    db.ts        IndexedDB, shared with the service worker
  sw.ts        service worker: precache, app-shell routing, share POST handler
samples/       test fixtures, and what they should produce
spike/         the step 1 MIDI spike page
scripts/       icon and fixture generators
```
