# PianoPardus

A phone-first play-along piano practice PWA. Plug a MIDI keyboard into an Android
phone over USB-C, import a MusicXML or MIDI file, and play through it with the
notation on screen and a piano diagram showing which keys come next. The app
waits for the correct notes before advancing, so it is impossible to get lost,
and reports accuracy at the end.

MIDI files get notation too: they are engraved into MusicXML on import, so a
`.mid` file plays with real staves rather than a bare note list.

No accounts, no backend, no built-in song library. Everything is local, and an
imported piece plays with no network at all.

The full specification is in [`pianopardus-spec.md`](pianopardus-spec.md).

## Status

All ten steps of the build order are implemented. What is verified in a headless
browser, and what still needs the physical device, is listed under
[Verification](#verification).

Two deliberate departures from the spec:

- §7.2 has MIDI pieces hide the notation pane and show an upcoming-notes list.
  They are engraved into notation instead — see
  [Notation from MIDI](#notation-from-midi) — and the list has become a piano
  roll, which is what a MIDI piece falls back to when engraving fails or is
  turned off.
- §3 rules out tempo entirely. There is now a playback mode with a speed
  control, which needs one — see [Playback](#playback). It is still not
  tempo-*following*: nothing about your own timing is ever measured or scored.
- §2 asks for no built-in library, to keep clear of licensing. Eight
  public-domain pieces are now bundled — see [Starter pieces](#starter-pieces).
  The licensing reasoning behind the original goal is why they are all free
  material and why every source is credited.

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

1. **Start with something.** Eight public-domain pieces are bundled, listed
   easiest first at the bottom of the library — Canon in D, Gymnopédie No. 1,
   Prelude in C, the Chopin Nocturne, In the Hall of the Mountain King, Rondo
   alla Turca, The Entertainer, Maple Leaf Rag. Tap one to add it. See
   [Starter pieces](#starter-pieces).
2. **Import.** Tap Import on the library screen and pick a `.musicxml`, `.xml`,
   `.mxl`, `.mid` or `.midi` file. Once the app is installed to the home screen
   you can also share a file to it from Chrome or Drive. A MIDI file pauses on
   "Engraving…" for a second or two while notation is worked out of it; that
   happens once, at import.
3. **Play.** Tap a piece. The blue keys are what to play next; the cursor sits on
   the current step. Play them and it advances. A wrong note flashes red and
   counts against you but changes nothing else.
4. **Finish.** The last step opens the results screen: accuracy, wrong notes,
   elapsed time.

Under the keyboard: skip back, play, speed, and a bar-jump slider, with Restart
below them.

**The screen stays awake while a piece is open.** Practising means both hands on
the keyboard and nothing touching the phone, which is exactly what Android's
screen timeout is waiting for. The player takes a screen wake lock for as long as
it is open — including while it sits waiting for you to find the next chord, not
just while it is playing itself. The browser drops that lock every time the page
stops being visible and never restores it, so it is taken again on every return;
that is the part that is easy to get wrong and it has a test. Leaving the player
releases it.

An engraved MIDI piece also gets a **Roll** button, which swaps the notation for
a piano roll: time running upwards, pitch across, on exactly the keyboard's
x axis, so a note falls onto the key it wants. Use it when the engraving comes
out badly — the choice is remembered per piece. It is also what a MIDI file gets
when engraving fails outright.

The on-screen keys are tappable as well as MIDI-driven. That is not in the spec;
it is there because it is the only way to exercise the matching engine without
the keyboard plugged in, and it is what the automated checks use.

### Finding middle C

Middle C carries a dot, on the keyboard and as a faint column on the piano roll.
Five octaves of identical keys on a phone give the eye nothing to hold on to, and
the octave labels are unreadable once the window passes three octaves — so the
labels stop there and the dot takes over. It grows as the window widens, staying
about the same size on screen however many keys are shown, and it stays legible
when the key underneath is lit blue or green.

### How wide the keyboard is

Two octaves by default, windowed on the notes to play. A step spanning more than
that — both hands wide apart, which is normal in real arrangements — widens the
window instead of hiding the outer notes, up to six octaves.

It grows but never shrinks within a piece. That is a measured decision, not
laziness: on a real two-hand arrangement, letting the window narrow again resized
the keyboard on a fifth of all steps, and a keyboard that stays where you learned
it reads better than one that is always the ideal width. Growing only, the same
piece resizes twice from beginning to end.

## Starter pieces

Eight pieces ship with the app so it is not empty on first run. Public-domain
compositions, engraved from [Mutopia Project](https://www.mutopiaproject.org/)
typesettings — sources, typesetters and licences are listed in
[`public/starter/CREDITS.md`](public/starter/CREDITS.md). Two of the eight are
CC BY and CC BY-SA rather than outright public domain, which is why that file
exists.

They are `.mxl` — compressed MusicXML — which is 160 kB for the set instead of
4.4 MB, and happens to exercise the format MuseScore exports by default. Each
one adds in well under a second: no engraving, no engine download, notation
straight away.

**No in-copyright music is bundled, and none should be.** Popular film and pop
arrangements are almost all still under copyright. Importing your own copy for
your own practice is one thing; shipping it inside a deployed app is a licence
nobody here has. That is also the spec's own position — §2 asks for no built-in
library precisely to avoid the licensing problem, which makes this the third
deliberate departure, and the reason it is limited to material that is genuinely
free.

## Fitting a piece to your keyboard

A 61-key instrument starts at C2, and plenty of piano writing goes below it. The
player waits for the exact note, so a piece reaching under the lowest key does
not merely sound wrong — it stops dead with no way past. **Your keyboard** at the
bottom of the library sets the range; 88 keys is the default.

Two things happen, in that order:

1. **The whole piece is shifted by whole octaves** if that is enough on its own.
   Every interval stays intact, and it is exactly what the transpose button on the
   instrument does. He's A Pirate has 170 notes below C2 on a 61-key keyboard;
   shifted up one octave it has none, and plays start to finish.
2. **Whatever still will not reach is folded in, note by note.** In the Hall of
   the Mountain King spans 76 semitones — wider than 61 keys, so no shift can
   save it. 187 notes get folded an octave inward. That does distort the writing,
   and it is still better than a step that can never be completed.

Folded notes are marked in the readout, the fit is stated under the keyboard
("61 keys · shifted up 1 octave"), and keys your instrument does not have are
greyed out on the diagram. The notation still shows the original pitches, because
it is the score — when a piece has been shifted you are playing an octave off the
page, deliberately.

Matching is still octave-exact in the sense §6 means: it is the target that moved
to reach your keyboard, not the tolerance that widened.

## Chord names

When the notes under the cursor spell a chord, its name appears beside them in
the step readout — `G`, `C/E`, `C7/G`, `Cm`, `Bdim7`. Inversions come out as
slash chords, and octaves and doubled notes make no difference, so a G major
spread across four octaves in both hands still reads as `G`.

A step that does not spell a chord gets no name rather than a wrong one, which
is most of real piano music: on The Entertainer 27% of steps are named and on
the Chopin Nocturne 21%, while the Prelude in C — arpeggiated throughout, so
never more than one note at a time — names nothing at all.

Roots are spelled the way a lead sheet spells them: `B♭m`, never `A♯m`. That
means the chord name and the note names beside it can disagree in flat keys,
because the note readout is still generated from MIDI numbers, which only know
sharps. Reading the notated spelling out of the score would fix both at once and
has not been done.

The name is in the readout rather than over the staff because putting it there
means drawing into OSMD's SVG and tracking the cursor through its layout, which
breaks quietly whenever the layout changes.

## What a piece gets called

A file's embedded title is used when it has one, and its filename otherwise.
The catch is that the fields holding that title are routinely filled with the
name of the *instrument* — a MIDI file's title comes from track 0's name event,
and exporters cheerfully name that track "Piano" or "Nylon Guitar", so importing
The Rains of Castamere would land a piece called "Nylon Guitar" in the library.

So a candidate title is rejected when every word in it is a part word — an
instrument, a hand, a staff, or a placeholder like "Untitled" or "Track 1" — and
the filename is used instead. Every *word*, so that "Piano Man" and "Piano
Sonata No. 14" come through untouched: one real word is enough to make a title.
Track names are never consulted at all, since they are the instrument or the
hand essentially without exception.

## Playback

**▶** plays the piece to you instead of waiting for you. The speed button cycles
1× → 0.25× → 0.5× → 0.75×.

**⏮** skips back to the start of the bar you are in — or to the previous bar if
you are already at its start, which is what "again" usually means. **⏭** goes
forward exactly one step, which is the way past something you cannot play: a
chord too wide to hold at both ends, most often. The two are deliberately not
symmetrical, because they answer different questions — "let me try that phrase
again" and "I cannot play this one".

The bar slider cannot do the second job. A bar is many steps, so on a
nine-hundred-step piece it moves in jumps of a dozen and no amount of accuracy
gets you to the next step.

Skipped steps are counted and shown on the results screen beside the accuracy,
not folded into it: a step you chose to pass over is not a wrong note, but it is
not a played one either.

Playback follows the score's own rhythm, not a metronomic tick: steps carry the
time they sound, taken from the enrolled cursor timestamp and the tempo for
MusicXML, and straight off the note times for MIDI. Half a bar of rests takes
half a bar.

Each step is scheduled against an absolute anchor rather than chained off the
previous timeout. That looks like a pointless distinction and is not: timer
granularity and rendering cost a few milliseconds per step, and chained, that
compounds. Measured against a 200 bpm arrangement, playback ran a tenth of a
piece behind within ten seconds. Anchored, it now hits the same step at the same
second as the source file.

**Sound** cycles between three settings:

- **phone** (the default) plays through the phone's own speaker. The voice is
  synthesised rather than sampled: a sine carrier with a sine modulator at three
  times the frequency, whose depth collapses in a third of a second. That gives
  the bright attack and mellow tail that makes a note sound struck rather than
  beeped, and low notes are given a longer ring, as they have on a real
  instrument. It is not a concert grand — a convincing sampled piano is
  megabytes, and this only has to answer "how does the piece go".
- **keyboard** sends the notes to the MIDI output instead, so a digital piano
  plays them in its own much better voice for no bytes at all. Offered only when
  there is an output to send to; a controller with no sound engine has none.
- **off**.

The choice is remembered. Verified by rendering a note through an
`OfflineAudioContext` and measuring it, since "it did not throw" is not the same
as "it made a sound": the buffer has to be audibly loud and its energy has to sit
at the pitch that was asked for.

While the piece is playing itself, your input is ignored: you are listening, and
a fumbled note then should not count against you.

## Notation from MIDI

MIDI carries no engraving information at all: no bars, no note values, no key
signature, no staves. Those have to be invented from the timing, which is a real
problem, not a formatting one.

Rather than hand-roll a quantiser, the app uses
[webmscore](https://github.com/LibreScore/webmscore) — MuseScore's own engine
compiled to WebAssembly. On a 1255-note two-hand arrangement it recovered 6/8,
one flat and 87 bars of clean quarter/eighth/16th values with dots and ties, in
about 1.5 seconds, and OSMD's cursor walk over the result produced exactly the
same 429 steps as the raw MIDI grouping — so the notation agrees with the file
it came from.

Three practical things about it:

- **It is 17 MB of WebAssembly**, so it is not bundled and not precached. It
  loads from a `<script>` tag on first MIDI import and the service worker keeps
  it in a runtime cache afterwards. Import a MIDI file offline before ever doing
  it online and engraving simply fails, which falls back to the roll.
- **It is not in git.** `npm install` puts it in `node_modules`, and
  `scripts/copy-webmscore.mjs` copies the four files it needs into
  `public/webmscore/`. That runs automatically before `dev`, `build` and the
  checks.
- **Its output is only as good as its input.** These files came out of notation
  software; a MIDI captured from a human performance is not quantised, and the
  engraving will be much messier. That is the limit of the technique, not of the
  library. Hit **Roll** when it happens.

It also comes out as two stacked staves rather than a piano grand staff, because
the MIDI's two tracks become two parts and webmscore exposes none of MuseScore's
import options. Legible, just taller than it should be.

### Licensing

webmscore is GPL, being MuseScore. That is irrelevant while this is a personal
tool, but publishing the app means distributing webmscore with it, and the
combined work inherits GPL terms. Worth knowing before putting it anywhere
public.

## Verification

```sh
npm run check                        # dev server + headless browser, 94 checks
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
keyboard widening for a four-octave step, a MIDI file being engraved and
switched to the roll and back, playback advancing at the score's own tempo and
sounding notes on a connected instrument, skip back landing on bar starts, a
multipart share POST exactly as Android sends it, a bundled .mxl unzipping into
notation, the screen wake lock surviving the page being hidden, a file
named after its instrument falling back to its filename, chord naming across
inversions, doublings and non-chords, a piece being shifted and folded onto a
shorter keyboard, the phone's voice producing sound at the right pitch, skipping a
single step and it being reported separately from errors, middle C being marked
on the keyboard and the roll, and loading and playing
with the network cut.

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
- **No rhythm or dynamics scoring.** A step is one vertical slice of the score;
  play its notes in any order and it advances, in your own time. Velocity and the
  sustain pedal are ignored. Tempo exists only for playback, never for judging
  you.
- **Octave-exact matching.** No enharmonic or transposition cleverness.
- **Every note of a step must be held at once.** A chord spanning more than a
  hand's reach at each end cannot be completed without a sustain pedal, which is
  not read. **⏭** is the way past one.
- **Repeated notes need a re-press.** The held set is cleared when a step
  completes, so the same note in consecutive steps has to be released and played
  again. This is how a person would play it anyway.
- **Notation for MIDI files is invented, not read.** See
  [Notation from MIDI](#notation-from-midi). When it cannot be worked out, the
  piano roll takes over and the app says so.
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
  components/  Notation (OSMD), Keyboard, PianoRoll, Results, JumpControl
  lib/
    starter.ts   the bundled public-domain pieces
    musicxml.ts  .mxl unzip, cursor walk to steps, pitch-mapping check
    midifile.ts  @tonejs/midi flatten and chord grouping
    notation.ts  engraving MIDI into MusicXML via webmscore
    playback.ts  the drift-free step scheduler and the speed control
    titles.ts    telling a piece's name from its instrument's
    chords.ts    naming the chord under the cursor
    range.ts     fitting a piece to the keyboard you own
    synth.ts     the phone's own piano voice
    wakelock.ts  keeping the screen on while the player is open
    steps.ts     where a skip back lands
    keys.ts      key geometry and the window, shared by keyboard and roll
    matcher.ts   the entire matching engine
    midi.ts      Web MIDI input
    db.ts        IndexedDB, shared with the service worker
  sw.ts        service worker: precache, app-shell routing, share POST handler
samples/       test fixtures, and what they should produce
spike/         the step 1 MIDI spike page
scripts/       icon and fixture generators
```
