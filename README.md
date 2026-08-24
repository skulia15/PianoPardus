# Keyway

A phone-first play-along piano practice PWA. Plug a MIDI keyboard into an Android
phone over USB-C, import a MusicXML or MIDI file, and play through it with the
notation on screen and a piano diagram showing which keys come next. The app waits
for the correct notes before advancing, so it is impossible to get lost.

No accounts, no backend, no built-in song library. Everything is local.

The full specification is in [`keyway-spec.md`](keyway-spec.md). Read it before
writing code — it is the source of truth for scope, architecture and build order.

## Status

Build order step **1 of 10** — the MIDI spike. Nothing is scaffolded yet, and no
dependencies are installed. Per the spec (§4), the keyboard has to be confirmed
working on the real phone before any app code gets written: if `requestMIDIAccess()`
never sees the keyboard, the problem is the USB adapter and the project stops there.

- [x] 1. MIDI spike — `spike/midi-test.html`
- [ ] 2. Scaffold (Vite + React + TS + PWA plugin)
- [ ] 3. Import via file picker → IndexedDB → library
- [ ] 4. MusicXML parse + OSMD render, cursor walk to build `Step[]`
- [ ] 5. Keyboard component
- [ ] 6. Matching engine
- [ ] 7. Results screen
- [ ] 8. MIDI file path (`@tonejs/midi`)
- [ ] 9. Share target
- [ ] 10. Polish

## Step 1: testing the MIDI spike

`spike/midi-test.html` is a single standalone page with no dependencies. It
lists the available MIDI inputs and logs every note-on and note-off with its
MIDI note number, note name, velocity and channel.

**`navigator.requestMIDIAccess()` requires a secure context**, so opening the
file with `file://` will not work, and neither will `http://192.168.x.x` on the
phone. You need HTTPS, or an origin the browser already treats as secure.

### Option A — `adb reverse` (recommended: no tunnel, no third party, works offline)

`http://localhost` counts as a secure context, so forwarding the port over USB
sidesteps HTTPS entirely. The phone is already plugged into something — this just
uses the cable it is on.

On the laptop, from the repo root:

```sh
python3 -m http.server 8080        # or: npx --yes serve -l 8080 .
adb reverse tcp:8080 tcp:8080      # requires USB debugging on the phone
```

Then on the phone open `http://localhost:8080/spike/midi-test.html` in Chrome.

Caveat: this occupies the phone's USB-C port with the laptop cable, so you cannot
have the keyboard plugged into the same port at the same time. Use it only if you
have a USB-C hub, otherwise use option B or C.

### Option B — Cloudflare quick tunnel (real HTTPS, nothing to sign up for)

```sh
python3 -m http.server 8080
cloudflared tunnel --url http://localhost:8080
```

It prints a `https://<random>.trycloudflare.com` URL. Open that on the phone and
append `/spike/midi-test.html`. `ngrok http 8080` works the same way if you already
have it. The phone's USB-C port stays free for the keyboard.

### Option C — deploy it

Any static host over HTTPS works — Vercel, Netlify, GitHub Pages. Slowest loop to
iterate on, but the most representative of how the finished PWA will be loaded.

### What to check on the phone

1. The **Environment** panel shows `OK secure context` and `OK navigator.requestMIDIAccess`.
2. Tap **Connect MIDI** and allow the permission prompt.
3. The keyboard appears under **Inputs** with a name and manufacturer.
4. Playing a key logs `note-on` with a MIDI number, and releasing it logs `note-off`.
5. Play middle C — it must log as `C4` / midi `60`. Everything downstream assumes this.
6. Unplug and replug the keyboard — a `statechange` line should appear and the
   input list should update.

If step 3 never happens, try a different USB-C OTG adapter before debugging the code.

## Platform notes

- **Android Chrome only.** Web MIDI is not available in Safari, so there is no iOS
  support and there will not be one.
- Chrome may re-prompt for MIDI permission every session until the PWA is installed
  to the home screen. That is expected.
- Web Share Target (step 9) only works once the PWA is installed — it will never
  work in a browser tab.
