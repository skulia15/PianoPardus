# Keyway — Play-Along Piano Practice PWA

**Handoff spec, v1.** Working title; rename freely.

---

## 1. Elevator pitch

A phone-first play-along piano trainer. Plug a MIDI keyboard into an Android phone over USB-C, import a sheet music file, and play through it with the notation on screen and a piano diagram showing exactly which keys come next. The app waits for the correct notes before advancing, so it is impossible to get lost, and reports accuracy at the end.

It exists because the commercial options are all wrong in one way or another: subscription-priced, locked to a curated royalty-free song list, desktop-only, or unmaintained. This one takes any file the user already has.

## 2. Goals

1. **Read real notation, with a safety net.** The staff is the primary display. The keyboard diagram underneath is the crutch that lets a non-fluent reader keep going.
2. **Any song the user can find.** No built-in library, no licensing, no curation. If it parses, it plays.
3. **Phone-native.** Samsung Galaxy S24, Chrome, keyboard on USB-C. Never open a laptop to practise.
4. **Zero friction to import.** Android share sheet from the browser or Drive straight into the app.
5. **No accounts, no network dependency.** Everything local. Works in aeroplane mode after install.

## 3. Non-goals for v1

Explicitly out of scope. Do not build these.

- In-app search of any sheet music library (v2 — import is via share sheet only).
- Audio/microphone pitch detection (MIDI keyboard only).
- Tempo-following, metronome, or rhythm scoring.
- Sustain pedal, velocity, or dynamics evaluation.
- Fingering suggestions.
- Practice history, streaks, stats over time, gamification.
- Accounts, sync, sharing, cloud storage.
- iOS support (Web MIDI is unavailable in Safari — note this in the README).
- Editing or transposing scores.

## 4. Platform reality check — verify before writing app code

Web MIDI is supported in Chrome on Android and works over USB-C OTG. Two constraints that will bite if ignored:

- `navigator.requestMIDIAccess()` requires a **secure context**. Dev over `localhost` is fine; testing on the phone requires HTTPS (use a tunnel, or deploy to Vercel and test against the deployed URL).
- **Web Share Target requires the PWA to be installed** to the home screen. It will not work in a browser tab. Test import only after installing.

**First task for the agent:** build a throwaway page that calls `requestMIDIAccess()`, lists inputs, and logs note-on events. Confirm on the actual phone with the actual keyboard before anything else is written. If this fails, the project stops here and the cause is the USB adapter, not the code.

## 5. Stack

| Concern | Choice | Notes |
|---|---|---|
| Build | Vite + React + TypeScript | |
| PWA | `vite-plugin-pwa` | Needed for install + share target |
| Notation | OpenSheetMusicDisplay (OSMD) | Renders MusicXML, exposes a cursor and note pitches |
| MIDI file parsing | `@tonejs/midi` | For `.mid` imports |
| Compressed MusicXML | `jszip` or `fflate` | `.mxl` is a zip archive |
| Storage | IndexedDB via `idb` | Store raw file bytes + metadata |
| Styling | Plain CSS or Tailwind | Dark theme, large touch targets |
| Input | Web MIDI API directly | No wrapper library needed |

No backend. No state management library — React state and a couple of contexts are enough.

## 6. Core architecture

Both file formats normalise into one internal structure. Renderers differ; the matching engine does not.

```ts
type Step = {
  index: number;
  notes: number[];      // MIDI note numbers, sorted, sounded together
  measure?: number;     // for display and jump-to-measure
  osmdCursorIndex?: number; // MusicXML only
};

type Piece = {
  id: string;
  title: string;
  source: 'musicxml' | 'midi';
  steps: Step[];
  rawFile: Blob;
};
```

A **step** is one vertical slice of the score: a single note, or a chord, or both hands sounding together. The player advances one step at a time. This is the single most important simplification in v1 — it removes all timing logic.

### Parsers

**MusicXML path.** Load into OSMD, then walk `osmd.cursor` from the start, calling `cursor.NotesUnderCursor()` at each position. Convert each note's pitch with `note.halfTone + 12` to get the MIDI number. Skip rests and tied continuations. Record the cursor index so the renderer can jump the visible cursor to any step.

**MIDI path.** Parse with `@tonejs/midi`, flatten all tracks into one note list sorted by time, then group notes whose start times fall within ~50 ms into a single step. No notation is rendered for this path — see §7.2.

`.mxl` files must be unzipped first: read `META-INF/container.xml` to find the rootfile path, extract that entry, pass the resulting XML string to OSMD.

### Matching engine

State: `currentStepIndex`, `heldNotes: Set<number>`, `errors: number`.

On note-on:
- Add to `heldNotes`.
- If the note is not in the current step's expected set → increment `errors`, flash the key red, do not advance.
- If `heldNotes` is a superset of the expected set → step is complete: flash green, increment `currentStepIndex`, clear `heldNotes`, advance the cursor and the keyboard highlight.

On note-off: remove from `heldNotes`.

That is the entire engine. Octave-exact matching, no enharmonic cleverness, no timing window. Chords work naturally because the user can roll them.

**Deliberate simplification:** ignore note-off ordering and let notes be held across steps if they happen to be correct. Do not try to be clever about repeated notes in v1 — if the same note appears in consecutive steps, requiring a release then re-press is acceptable and matches how a person would play it anyway.

## 7. Screens

Three screens. Bottom nav is unnecessary — a back arrow is enough.

### 7.1 Library

- List of imported pieces: title, format badge (`XML` / `MIDI`), step count, date added.
- Tap to open the player.
- Long-press or swipe to delete.
- Empty state explains how to import: "Find a `.musicxml` or `.mid` file in your browser and share it to Keyway."
- A file-picker button as a fallback import path (`<input type="file">`), because share target only works once installed.

### 7.2 Player

Vertical layout, portrait. Landscape is a v2 concern.

```
┌──────────────────────────────┐
│  ← Title            bar 12/48│  header, thin
├──────────────────────────────┤
│                              │
│   [ OSMD notation, cursor    │  ~50% height
│     on the current step ]    │  auto-scrolls to keep
│                              │  cursor in view
├──────────────────────────────┤
│  next: C4 · E4 · G4          │  step readout
├──────────────────────────────┤
│ ▏▏█▏▏▏█▏█▏▏█▏▏▏█▏▏  │  piano keyboard, ~2 octaves
│  ▲     ▲     ▲             │  centred on current step
└──────────────────────────────┘
```

- **Notation pane.** OSMD render, `autoResize: true`, `drawFromMeasureNumber` used for paging or simply scroll the container to the cursor's bounding box after each advance. Cursor visible and coloured.
- **Keyboard pane.** Rendered as SVG or divs, not an image. Shows roughly two octaves, windowed so the current step's notes are always visible; shift the window when the step moves outside it. Highlight states: **blue** = expected now, **green** = correctly held, **red** = wrong key pressed (300 ms flash).
- **MIDI-source pieces** hide the notation pane entirely and show only the step readout and keyboard, with the pane space given over to a simple upcoming-notes list (next 4 steps). Be honest in the UI about this: a small note reading "no notation available for MIDI files".
- **Controls:** back, restart, and a measure-jump control (a slider or a numeric stepper). No play/pause — the app is always waiting for input.
- **Connection state:** if no MIDI input is connected, show a persistent banner with a "Connect keyboard" button that re-runs `requestMIDIAccess()` and lists inputs for selection.

### 7.3 Results

Shown when the last step completes.

- Accuracy: `steps / (steps + errors)` as a percentage.
- Total errors, elapsed time.
- Buttons: "Play again", "Back to library".

Nothing is persisted from this screen in v1.

## 8. Import flow

**Share target.** In the web app manifest:

```json
"share_target": {
  "action": "/import",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "files": [{
      "name": "file",
      "accept": [".mid", ".midi", ".musicxml", ".xml", ".mxl",
                 "audio/midi", "audio/x-midi",
                 "application/vnd.recordare.musicxml+xml"]
    }]
  }
}
```

The service worker intercepts the POST to `/import`, pulls the file out of the `FormData`, stashes it in IndexedDB, and redirects to `/import?id=<newId>` where the React app picks it up, parses it, and navigates to the player.

Android's share sheet matches on both MIME type and extension, and MIDI MIME types are inconsistent across apps — keep the extension entries in the `accept` list, they do most of the work.

**File picker fallback.** Same parse-and-store path, triggered from the library screen. Build this first; it is the only import path that works before installation.

## 9. Build order

Sequenced so there is something runnable at every stage.

1. **MIDI spike.** Standalone page, `requestMIDIAccess()`, log note-on/note-off. Verify on the phone over USB-C. *Stop and confirm before continuing.*
2. **Scaffold.** Vite + React + TS, PWA plugin, manifest, dark theme, three empty routes.
3. **Import via file picker.** Store the blob in IndexedDB, list it on the library screen.
4. **MusicXML parse + render.** OSMD into the player pane, cursor visible, walk the cursor to build `Step[]`.
5. **Keyboard component.** Static two-octave SVG, highlight the current step's notes in blue.
6. **Matching engine.** Wire MIDI input to the engine; advance the cursor and keyboard on correct input, flash red on wrong. **This is the moment the app becomes real — test it here.**
7. **Results screen.** Accuracy, errors, time.
8. **MIDI file path.** `@tonejs/midi` parse, chord grouping, keyboard-only player mode.
9. **Share target.** Manifest entry, service worker POST handler, install to home screen, test the end-to-end share from Chrome.
10. **Polish.** Auto-scroll the notation, measure jump, connection banner, empty states.

Steps 1–7 are the hour. Steps 8–10 are the rest of the weekend.

## 10. Acceptance criteria for v1

- [ ] Keyboard connects over USB-C on the Galaxy and note-ons are received in the installed PWA.
- [ ] A `.musicxml` file imported via the file picker appears in the library and opens in the player.
- [ ] Notation renders with a visible cursor on the current step.
- [ ] The piano diagram highlights the expected note(s) in blue.
- [ ] Playing the correct note or chord advances the cursor and the highlight.
- [ ] Playing a wrong note flashes red, counts an error, and does not advance.
- [ ] Completing the final step shows a results screen with an accuracy percentage.
- [ ] A `.mid` file imports and plays in keyboard-only mode.
- [ ] Sharing a file from Chrome to the installed app imports it.
- [ ] The app loads and plays an already-imported piece with no network connection.

## 11. Known pitfalls

- **OSMD `halfTone`.** Off-by-twelve errors are the classic bug here. Verify against a known file: middle C in the score must produce MIDI 60. Test before building anything on top of the parser.
- **Grace notes, ornaments, repeats, voltas.** OSMD's cursor handles repeats by walking the played order, which is what is wanted, but grace notes will produce steps with a single note that feel odd to play through. Acceptable in v1; consider filtering `note.IsGraceNote` if it becomes annoying.
- **Multi-voice piano scores.** Both hands under one cursor position is correct and desirable — the user should play both. But dense arrangements produce large chords. If a step has more than 6 notes, something has been parsed wrong.
- **Service worker caching during development.** It will serve stale builds and waste an hour. Disable the PWA plugin in dev mode, enable it only for builds.
- **Web MIDI permission prompt.** Chrome may prompt on each session unless the PWA is installed. Expected behaviour, not a bug.
- **The `.mxl` zip.** MuseScore exports default to `.mxl`, so this path matters more than it looks — most real-world files will be compressed.

## 12. Sourcing sheet music

Not a code concern, but it determines whether the app is useful.

- **IMSLP** — public domain scores, free, huge, mostly PDF with some MusicXML. Classical only.
- **MuseScore community uploads** — MusicXML export available on many free scores; popular-song arrangements sit behind the Pro subscription.
- **MIDI files** are far more widely available than MusicXML for popular music, which is precisely why the MIDI path exists in v1 despite the missing notation.

A realistic v2 feature is PDF-to-MusicXML via optical music recognition (Audiveris runs offline), which would unlock the large body of scores that only exist as PDFs. It is a substantial project on its own and should not be attempted before v1 works.
