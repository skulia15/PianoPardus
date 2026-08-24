# Test fixtures

`middle-c-test.musicxml` — five steps, written so a pitch-mapping bug is obvious:

| step | notes | MIDI |
|---|---|---|
| 1 | C4 | 60 |
| 2 | D4 | 62 |
| 3 | E4 | 64 |
| 4 | F#4 | 66 |
| 5 | C4 E4 G4 | 60 64 67 |

Import it and check the step readout says `C4`. If it says `C3` or `C5`, the
`halfTone + 12` conversion in `src/lib/musicxml.ts` is wrong and everything
downstream is transposed. Step 4 covers `<alter>`, step 5 covers chords.

`node tests/check.mjs` verifies all of this in a headless browser.
