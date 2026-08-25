---
name: sheet-music-to-midi
description: Turn a photo, screenshot or PDF of sheet music into a MIDI or MusicXML file that PianoPardus can import. Use whenever someone sends an image of a score and wants it as MIDI, MusicXML, .mxl, or "something I can play along to". Finds and verifies an existing public-domain edition rather than trusting optical recognition.
---

# Sheet music image to MIDI

## What actually works, and what does not

Optical music recognition on a phone photo **does not work well enough to hand
over**. Measured on this repo's own material with `oemer`, the best open-source
end-to-end OMR:

| Input | Bars | Key sig | Time sig | Note order |
|---|---|---|---|---|
| Perfect digital render, full page | correct | correct | correct | 55% |
| Phone screenshot, full page | 3 of 16 | wrong | missing | unusable |
| Phone screenshot, one system, binarised | correct | missed | missing | scrambled |

A missed key signature alone makes every accidental wrong, and PianoPardus waits
for the exact note — so a wrong pitch is a step the player can never pass. **Never
hand over an OMR result as if it were the score.**

What does work is recognising the piece and finding an edition that already
exists in machine-readable form, then proving it matches the page. That is the
procedure below.

## Procedure

### 1. Read the page, not the noteheads

Text stays legible long after noteheads stop being. From the image, record:

- title and composer / "Traditional"
- key signature (count the sharps or flats) and time signature
- number of bars, and how many staves per system
- tempo marking
- any chord symbols printed above the staff
- the first line of lyrics
- any publisher notice

Crop and upscale to read small print:

```bash
python3 .claude/skills/sheet-music-to-midi/crop-page.py <image> /tmp/page.png
```

### 2. Settle the rights question in one line

The composition is usually what matters: traditional, or a composer dead more
than 70 years, means the music is public domain. A publisher's "All Rights
Reserved" on the page covers *that engraving and arrangement*, not the tune.
Finding a different public-domain setting sidesteps it entirely, which is what
this procedure does anyway.

If the piece is in copyright — most film and pop music — no free source will
exist. Say so, and point at the fallback in step 6 rather than producing
something unverified.

### 3. Look for an existing edition

In rough order of usefulness:

- **[Mutopia](https://www.mutopiaproject.org/ftp/)** — classical, LilyPond
  typesettings, `.mid` and `.rdf` metadata per piece. Browse
  `/ftp/<ComposerId>/<Opus>/<work>/`.
- **[Songs from the Public Domain](https://bbloomf.github.io/lilypond-songs/)** —
  traditional songs and hymns, MIDI with lyrics.
- **[CPDL / ChoralWiki](https://www.cpdl.org/)** — choral and part-songs.
- **[abcnotation](https://abcnotation.com/)** — folk tunes; often rough
  transcriptions in the wrong metre, so verify hard.
- **IMSLP** — huge, but mostly PDF scans rather than machine-readable files.

### 4. Verify before believing it

This is the step that makes the result trustworthy. Never skip it.

```bash
node .claude/skills/sheet-music-to-midi/verify.cjs <candidate.mid|.musicxml> \
  --key -1 --time 6/8 --bars 16 --melody "A4 A4 A4 A#4 A#4 C5"
```

It reports the candidate's key signature, time signature, bar count, range and
opening melody, and compares them with what the page says. Every stated fact has
to match. If one does not, the candidate is a different setting — say so and keep
looking rather than shipping it.

Chord symbols printed on the page are a second, independent check: import the
result and see whether the chord names the player derives agree with them.

### 5. Convert and deliver

```bash
node .claude/skills/sheet-music-to-midi/to-musicxml.cjs <in.mid> <out.musicxml>
```

Deliver **both** files, named after the piece — the app takes its title from the
filename when the file has no usable one. MusicXML is the better one to import:
it opens with notation immediately, where a `.mid` makes the app download the
17 MB engraving engine first.

Say plainly which edition it is and how it differs from their page — a different
arrangement of the same tune is a fine answer, but it has to be labelled.

### 6. When nothing exists

Do not fall back to OMR output. Tell them instead:

- **[Audiveris](https://audiveris.com/)** on a laptop — free, offline, and far
  better than anything installable here; export MusicXML, then share it to the
  app. Note that GitHub downloads are blocked from this container, so it cannot
  be run here.
- **[PlayScore 2](https://www.playscore.co/)** on the phone — scans and exports
  MusicXML/MIDI, but export is behind a subscription.
- For a short piece, typing it into MuseScore by hand is often quicker than
  correcting a bad scan.

`oemer` can be installed here (`pip install oemer`, plus
`onnxruntime==1.18.1` and `opencv-python-headless==4.10.0.84`, whose newer
versions both break it) but treat anything it produces as a diagnostic, not a
deliverable.
