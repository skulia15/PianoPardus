#!/usr/bin/env python3
"""Transcribe an engraved score (a clean PDF page render) into MusicXML + MIDI.

This is not general OMR. It exploits the fact that engraved staves are exactly
regular: find the five staff lines, and every notehead's pitch follows from its
y position. That makes pitch and note ORDER — the two things a play-along app
actually needs — reliable, in a way end-to-end OMR on the same input is not.

    pdftoppm -r 400 -png score.pdf page
    python3 transcribe.py page-*.png -o out --title "..." --key 4 --tempo 88
    python3 transcribe.py page-1.png --overlay 0 > /dev/null   # visual check

Assumes: one grand staff per system, no accidentals outside the key signature
(check with --scan-accidentals), one voice per staff. Verify the result by
rendering it back to notation and comparing with the original — always.
"""
import argparse, struct, sys
import numpy as np
from scipy import ndimage
from PIL import Image

NAMES = ['C','D','E','F','G','A','B']
SEMI  = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
# how many diatonic steps beyond the staff we accept; past this it is title or
# tempo text, whose letterforms are genuinely notehead-shaped
MAX_LEDGER_STEPS = (-7, 14)

def dname(i): return NAMES[i % 7] + str(i // 7)

# ---------------------------------------------------------------- geometry
def load(path):
    return np.array(Image.open(path).convert('L')) < 128

def staff_rows(dark):
    """y of every staff line: a row that is dark across most of the page"""
    rows = np.where(dark.sum(axis=1) > dark.shape[1]*0.45)[0]
    groups = []
    for r in rows:
        if groups and r - groups[-1][-1] <= 2: groups[-1].append(r)
        else: groups.append([r])
    return [int(np.mean(g)) for g in groups]

def systems(dark):
    L = staff_rows(dark)
    if len(L) % 10:
        raise SystemExit(f"found {len(L)} staff lines, expected a multiple of 10 "
                         "(one grand staff per system)")
    st = [L[i:i+5] for i in range(0, len(L), 5)]
    return [(st[i], st[i+1]) for i in range(0, len(st), 2)]

def barlines(dark, treb, bass, sp, tol=0.985):
    """a barline runs the full height of the grand staff, so it also segments bars"""
    col = dark[treb[0]:bass[4]+1, :].mean(axis=0)
    cand = np.where(col >= tol)[0]
    groups = []
    for x in cand:
        if groups and x - groups[-1][-1] <= int(sp*0.8): groups[-1].append(int(x))
        else: groups.append([int(x)])
    return [int(np.mean(g)) for g in groups]

# ---------------------------------------------------------------- noteheads
def _run(dark, axis):
    """length of the dark run through each pixel along `axis`"""
    a = dark if axis == 0 else dark.T
    H, W = a.shape
    f = np.zeros((H, W), np.int32); b = np.zeros((H, W), np.int32)
    for i in range(H):      f[i] = np.where(a[i], (f[i-1] if i else 0)+1, 0)
    for i in range(H-1,-1,-1): b[i] = np.where(a[i], (b[i+1] if i < H-1 else 0)+1, 0)
    r = f + b - 1
    return r if axis == 0 else r.T

def strip_lines(reg, lines, y0, sp):
    """Remove staff and ledger lines where all three hold: the pixel sits on a
    known line row, its vertical run is line-thin, and its horizontal run is
    longer than any notehead. A notehead's own arcs fail at least one test, so
    heads that sit on or between lines survive whole."""
    thin = (_run(reg,0) > 0) & (_run(reg,0) <= max(3,int(sp*0.34))) & (_run(reg,1) >= sp*2.4)
    rows = np.zeros(reg.shape[0], bool)
    for k in range(-10, 23, 2):
        yc = lines[4] - k*(sp/2.0) - y0
        lo, hi = max(0,int(round(yc-sp*0.20))), min(reg.shape[0], int(round(yc+sp*0.20))+1)
        if lo < hi: rows[lo:hi] = True
    return reg & ~(thin & rows[:,None])

def split_stack(ys, sp):
    """Heads stacked a 2nd/3rd apart merge into one column and their density
    peaks blur together, so use geometry instead: a run of n heads a third
    apart spans (n-1)*sp plus one head height."""
    lo, hi = ys.min(), ys.max()
    wide = np.bincount(ys - lo, minlength=hi-lo+1) >= sp*0.72
    out, y, H = [], 0, len(wide)
    while y < H:
        if not wide[y]: y += 1; continue
        z = y
        while z < H and wide[z]: z += 1
        band = z - y
        if band >= sp*0.72:
            n = max(1, min(int(round((band - sp*1.05)/sp)) + 1, 5))
            if n == 1: out.append(lo + y + band/2.0)
            else:
                d = (band - sp*1.05)/(n-1)
                out += [lo + y + sp*0.52 + d*k for k in range(n)]
        y = z
    return out

def has_dot(dark, cx, cy, sp, W):
    """augmentation dot: a small round solid blob to the right. For a head on a
    line the dot sits half a space higher, so the search window is generous."""
    x0,x1 = int(cx+sp*0.58), int(cx+sp*2.30)
    y0,y1 = int(cy-sp*0.80), int(cy+sp*0.80)
    if x1 >= W or x0 < 0 or y0 < 0: return False
    sub = dark[y0:y1, x0:x1]
    if not sub.any(): return False
    lab, n = ndimage.label(sub)
    for i in range(1, n+1):
        ys, xs = np.where(lab == i)
        h = ys.max()-ys.min()+1; w = xs.max()-xs.min()+1
        if not (sp*0.16 <= h <= sp*0.62 and sp*0.16 <= w <= sp*0.62): continue
        if abs(w-h) > sp*0.26 or len(ys)/(h*w) < 0.62: continue
        return True
    return False

def has_ledger(dark, cx, k, lines, sp):
    """A head beyond the staff must rest on a ledger line, so look for the line
    itself: a horizontal stroke through the head that is WIDER than the head and
    line-thin where it projects past it. Dynamics and text set off the staff are
    notehead-shaped, but no such stroke runs through them."""
    if -1 <= k <= 9: return True
    kk = (k if k % 2 == 0 else (k-1 if k > 9 else k+1))
    y = int(lines[4] - kk*(sp/2.0))
    if not (0 <= y < dark.shape[0]): return False
    row = dark[y]
    x = int(cx)
    if not (0 <= x < len(row) and row[x]): return False
    xl = x
    while xl > 0 and row[xl-1]: xl -= 1
    xr = x
    while xr < len(row)-1 and row[xr+1]: xr += 1
    if (xr-xl+1) < sp*1.45: return False          # no wider than the head: not a line
    pad = int(sp*1.2)
    if y-pad < 0 or y+pad+1 > dark.shape[0]: return False
    thin = 0
    for px in (xl+2, xr-2):
        col = dark[y-pad:y+pad+1, px]
        run = _run(col.reshape(-1,1), 0)[pad, 0]
        if 0 < run <= sp*0.45: thin += 1
    return thin >= 1

def heads_of(dark, treb, bass, staff, has_timesig):
    lines = treb if staff == 0 else bass
    sp = (lines[4]-lines[0])/4.0
    base = 30 if staff == 0 else 18            # bottom line: E4 treble, G2 bass
    y0, y1 = int(lines[0]-sp*5.5), int(lines[4]+sp*5.5)
    reg = dark[y0:y1, :]
    solid = ndimage.binary_fill_holes(strip_lines(reg, lines, y0, sp))

    ry, rx = int(sp*0.36), int(sp*0.50)
    yy, xx = np.mgrid[-ry:ry+1, -rx:rx+1]
    core = ndimage.binary_opening(solid, (yy/ry)**2 + (xx/rx)**2 <= 1.0)
    # whole notes have no stem and a thin ring the opening can erase; they are
    # also the only glyph about 2sp wide, so add them back by width
    wl, wn = ndimage.label(ndimage.binary_closing(solid, np.ones((1, max(3,int(sp*0.35))))))
    for i in range(1, wn+1):
        wy, wx = np.where(wl == i)
        ww = wx.max()-wx.min()+1; wh = wy.max()-wy.min()+1
        if not (1.70*sp <= ww <= 2.45*sp and 0.82*sp <= wh <= 4.5*sp): continue
        # a whole note (or a column of them) is notehead-wide on every row;
        # a stemmed head that merged with its ledger line is not
        if (np.bincount(wy-wy.min(), minlength=wh) >= sp*0.72).mean() < 0.80: continue
        core[wy, wx] = True

    bl = barlines(dark, treb, bass, (treb[4]-treb[0])/4.0)   # system property
    clefpad = sp*(12.0 if has_timesig else 9.5)   # clef + key sig (+ time sig)
    lab, n = ndimage.label(core)
    out = []
    for i in range(1, n+1):
        ys, xs = np.where(lab == i)
        h = ys.max()-ys.min()+1; w = xs.max()-xs.min()+1
        if not (1.25*sp <= w <= 2.45*sp) or h < 0.82*sp: continue
        if len(ys)/(h*w) < 0.42: continue
        cx = float(xs.mean())
        if cx < bl[0] + clefpad or cx > bl[-1] - sp*0.3: continue
        for cy in [c+y0 for c in ([float(ys.mean())] if h <= 1.40*sp else split_stack(ys, sp))]:
            k = int(round((lines[4]-cy)/(sp/2.0)))
            if not (MAX_LEDGER_STEPS[0] <= k <= MAX_LEDGER_STEPS[1]): continue
            if not has_ledger(dark, cx, k, lines, sp): continue
            bb = dark[int(cy-sp*0.42):int(cy+sp*0.42), int(cx-sp*0.42):int(cx+sp*0.42)]
            dens = float(bb.mean()) if bb.size else 0.0
            out.append(dict(x=round(cx,1), pitch=dname(base+k), step=k,
                            dot=has_dot(dark, cx, cy, sp, dark.shape[1]),
                            open=bool(dens < 0.72)))
    out.sort(key=lambda r: (r['x'], -r['step']))
    meas = [[] for _ in range(len(bl)-1)]
    for hd in out:
        for j in range(len(bl)-1):
            if bl[j] <= hd['x'] < bl[j+1]: meas[j].append(hd); break
    return [cluster(m, sp) for m in meas], sp, bl

def cluster(m, sp):
    cl = []
    for hd in m:
        if cl and abs(hd['x']-cl[-1][-1]['x']) < sp*0.9: cl[-1].append(hd)
        else: cl.append([hd])
    return cl

# ---------------------------------------------------------------- rhythm
def durations(cl, x1, sp):
    """Open noteheads pin their own value (half / dotted half / whole). Whatever
    beats remain are shared among the filled notes in proportion to the engraved
    x-spacing, then snapped. Every bar is forced to total 4 beats."""
    if not cl: return []
    n = len(cl)
    edges = [c[0]['x'] for c in cl] + [x1 - sp*0.4]
    gaps = [max(edges[i+1]-edges[i], sp*0.3) for i in range(n)]
    dur = [None]*n
    for i, c in enumerate(cl):
        if any(h['open'] for h in c):
            dur[i] = 4.0 if n == 1 else (3.0 if any(h['dot'] for h in c) else 2.0)
    fixed = sum(d for d in dur if d is not None)
    if fixed > 4.0 + 1e-9:                     # a spurious dot
        for i in range(n):
            if dur[i] == 3.0: dur[i] = 2.0
        fixed = sum(d for d in dur if d is not None)
    idx = [i for i in range(n) if dur[i] is None]
    if not idx:
        if fixed < 4.0 - 1e-9: dur[-1] += 4.0 - fixed     # note(s) plus rests
        return dur
    rem = 4.0 - fixed
    if rem <= 0:
        for i in idx: dur[i] = 0.25
        return dur
    gtot = sum(gaps[i] for i in idx)
    LEGAL = [0.25,0.375,0.5,0.75,1.0,1.5,2.0,3.0]
    for i in idx:
        raw = rem*gaps[i]/gtot
        cand = LEGAL if not any(h['dot'] for h in cl[i]) else [0.375,0.75,1.5,3.0]
        dur[i] = min(cand, key=lambda v: abs(v-raw))
    err = 4.0 - sum(dur)
    if abs(err) > 1e-9:
        k = max(idx, key=lambda i: dur[i])
        if dur[k] + err > 0: dur[k] = round(dur[k]+err, 4)
    return dur

# ---------------------------------------------------------------- assembly
def midi_of(pitch, fifths):
    sharps = 'FCGDAEB'[:max(0, fifths)]
    flats  = 'BEADGCF'[:max(0, -fifths)]
    letter, octv = pitch[0], int(pitch[1:])
    m = 12*(octv+1) + SEMI[letter]
    if letter in sharps: m += 1
    if letter in flats:  m -= 1
    return m

def transcribe(paths, fifths, ottava=(), multirest=None):
    measures = []
    printed = 0
    for pi, path in enumerate(paths):
        dark = load(path)
        for si, (treb, bass) in enumerate(systems(dark)):
            per = {}
            for staff in (0, 1):
                per[staff] = heads_of(dark, treb, bass, staff,
                                      has_timesig=(pi == 0 and si == 0))
            (tc, sp, bl) = per[0]; (bc, _, _) = per[1]
            for j in range(len(tc)):
                m = {}
                for key, cls in (('treble', tc[j]), ('bass', bc[j])):
                    ds = durations(cls, bl[j+1], sp)
                    shift = -12 if (key == 'bass' and printed in ottava) else 0
                    m[key] = [(d, sorted(midi_of(h['pitch'], fifths)+shift for h in c))
                              for c, d in zip(cls, ds)]
                measures.append(m)
                if multirest and printed == multirest[0]:
                    measures += [{'treble':[], 'bass':[]} for _ in range(multirest[1]-1)]
                printed += 1
    return measures

# ---------------------------------------------------------------- output
TYPES = [(4.0,'whole',0),(3.0,'half',1),(2.0,'half',0),(1.5,'quarter',1),
         (1.0,'quarter',0),(0.75,'eighth',1),(0.5,'eighth',0),
         (0.375,'16th',1),(0.25,'16th',0),(0.125,'32nd',0)]
STEPS = ['C','C','D','D','E','F','F','G','G','A','A','B']
ALTER = [0,1,0,1,0,0,1,0,1,0,1,0]
DIV = 8

def musicxml(ms, title, composer, fifths, tempo):
    L = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
         '"http://www.musicxml.org/dtds/partwise.dtd">',
         '<score-partwise version="4.0">',
         f'  <work><work-title>{title}</work-title></work>',
         f'  <identification><creator type="composer">{composer}</creator></identification>',
         '  <part-list><score-part id="P1"><part-name>Piano</part-name>',
         '    <score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>',
         '    <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>',
         '  </score-part></part-list>', '  <part id="P1">']
    for i, m in enumerate(ms):
        L.append(f'    <measure number="{i+1}">')
        if i == 0:
            L += ['      <attributes>', f'        <divisions>{DIV}</divisions>',
                  f'        <key><fifths>{fifths}</fifths></key>',
                  '        <time><beats>4</beats><beat-type>4</beat-type></time>',
                  '        <staves>2</staves>',
                  '        <clef number="1"><sign>G</sign><line>2</line></clef>',
                  '        <clef number="2"><sign>F</sign><line>4</line></clef>',
                  '      </attributes>',
                  f'      <direction placement="above"><direction-type><metronome>'
                  f'<beat-unit>quarter</beat-unit><per-minute>{tempo}</per-minute>'
                  f'</metronome></direction-type><sound tempo="{tempo}"/></direction>']
        for staff, key in ((1,'treble'), (2,'bass')):
            if staff == 2: L.append(f'      <backup><duration>{4*DIV}</duration></backup>')
            if not m[key]:
                L.append(f'      <note><rest measure="yes"/><duration>{4*DIV}</duration>'
                         f'<voice>{staff}</voice><staff>{staff}</staff></note>')
                continue
            for d, notes in m[key]:
                typ, dots = min(TYPES, key=lambda t: abs(t[0]-d))[1:]
                for j, n in enumerate(notes):
                    pc = n % 12
                    L.append('      <note>' + ('<chord/>' if j else '') +
                             f'<pitch><step>{STEPS[pc]}</step>' +
                             (f'<alter>{ALTER[pc]}</alter>' if ALTER[pc] else '') +
                             f'<octave>{n//12-1}</octave></pitch>' +
                             f'<duration>{int(round(d*DIV))}</duration>' +
                             f'<voice>{staff}</voice><type>{typ}</type>' + '<dot/>'*dots +
                             f'<staff>{staff}</staff></note>')
        L.append('    </measure>')
    return '\n'.join(L + ['  </part>', '</score-partwise>'])

def _vlq(n):
    b = [n & 0x7F]; n >>= 7
    while n: b.append((n & 0x7F) | 0x80); n >>= 7
    return bytes(reversed(b))

def midifile(ms, title, tempo, tpq=480):
    ev, t = [], 0
    for m in ms:
        for key in ('treble','bass'):
            tt = t
            for d, notes in m[key]:
                dur = int(round(d*tpq))
                for n in notes:
                    ev.append((tt, 1, bytes([0x90, n, 72])))
                    ev.append((tt+max(1,dur-8), 0, bytes([0x80, n, 0])))
                tt += dur
        t += 4*tpq
    ev.sort(key=lambda e: (e[0], e[1]))
    trk = _vlq(0) + b'\xFF\x03' + _vlq(len(title.encode())) + title.encode()
    trk += _vlq(0) + b'\xFF\x51\x03' + int(60_000_000/tempo).to_bytes(3,'big')
    trk += _vlq(0) + b'\xFF\x58\x04\x04\x02\x18\x08'
    prev = 0
    for tick, _, data in ev:
        trk += _vlq(tick-prev) + data; prev = tick
    trk += _vlq(0) + b'\xFF\x2F\x00'
    return (b'MThd' + struct.pack('>IHHH', 6, 0, 1, tpq)
            + b'MTrk' + struct.pack('>I', len(trk)) + trk)

# ---------------------------------------------------------------- checking
def overlay(path, sysno, out, xlo=0.0, xhi=1.0, scale=2):
    """Draw the detected pitches over the page. LOOK AT THIS before trusting
    the output — it is the only honest check that the notes are right."""
    from PIL import ImageDraw, ImageFont
    dark = load(path); im = Image.open(path).convert('RGB'); W, H = im.size
    treb, bass = systems(dark)[sysno]
    sp = (treb[4]-treb[0])/4.0
    top, bot = int(treb[0]-sp*6), int(bass[4]+sp*6)
    x0, x1 = int(W*xlo), int(W*xhi)
    c = im.crop((x0, top, x1, bot))
    c = c.resize((int(c.width*scale), int(c.height*scale)), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
    except Exception: f = ImageFont.load_default()
    for staff, col in ((0,(220,0,0)), (1,(0,80,220))):
        meas, sp, bl = heads_of(dark, treb, bass, staff, sysno == 0)
        for m in meas:
            for cl in m:
                for h in cl:
                    lines = treb if staff == 0 else bass
                    cx = (h['x']-x0)*scale
                    cy = (lines[4]-h['step']*(sp/2.0)-top)*scale
                    d.ellipse([cx-7,cy-7,cx+7,cy+7], outline=(0,200,0), width=4)
                    d.text((cx-26, cy-44 if staff == 0 else cy+12),
                           h['pitch'] + ('o' if h['open'] else '') + ('.' if h['dot'] else ''),
                           fill=col, font=f)
    c.save(out)
    return out

def scan_accidentals(paths):
    """Accidentals outside the key signature are NOT handled. Count candidates
    so you know whether this tool is safe to use on the score at all."""
    total = 0
    for path in paths:
        dark = load(path)
        for treb, bass in systems(dark):
            for lines in (treb, bass):
                sp = (lines[4]-lines[0])/4.0
                reg = dark[int(lines[0]-sp*5.5):int(lines[4]+sp*5.5), :]
                lab, n = ndimage.label(reg)
                for i in range(1, n+1):
                    ys, xs = np.where(lab == i)
                    h = ys.max()-ys.min()+1; w = xs.max()-xs.min()+1
                    if not (1.5*sp <= h <= 3.0*sp and 0.5*sp <= w <= 1.25*sp): continue
                    if len(ys)/(h*w) > 0.55: continue
                    if xs.mean() > sp*26: total += 1     # past the key signature
    return total

# ---------------------------------------------------------------- cli
def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('pages', nargs='+', help='page PNGs in order, 400 dpi')
    p.add_argument('-o', '--out', help='output basename (writes .musicxml and .mid)')
    p.add_argument('--title', default='Untitled')
    p.add_argument('--composer', default='')
    p.add_argument('--key', type=int, default=0, help='fifths: 4 = E major, -2 = B flat major')
    p.add_argument('--tempo', type=int, default=100)
    p.add_argument('--ottava', default='', help='comma-separated printed-measure indices '
                   '(0-based) whose bass staff is 8vb')
    p.add_argument('--multirest', default='', help='IDX:COUNT — expand the printed measure '
                   'at IDX (0-based) into COUNT bars')
    p.add_argument('--overlay', type=int, metavar='SYS',
                   help='write overlay-SYS.png for the first page and exit')
    p.add_argument('--scan-accidentals', action='store_true')
    a = p.parse_args()

    if a.overlay is not None:
        print(overlay(a.pages[0], a.overlay, f'overlay-{a.overlay}.png')); return
    if a.scan_accidentals:
        n = scan_accidentals(a.pages)
        print(f"{n} accidental candidates outside the key signature")
        print("non-zero means this tool will get those notes wrong" if n else "safe")
        return

    ott = {int(x) for x in a.ottava.split(',') if x.strip()}
    mr = tuple(int(x) for x in a.multirest.split(':')) if a.multirest else None
    ms = transcribe(a.pages, a.key, ott, mr)
    notes = [n for m in ms for k in ('treble','bass') for _, ns in m[k] for n in ns]
    bad = [i+1 for i, m in enumerate(ms) for k in ('treble','bass')
           if m[k] and abs(sum(d for d, _ in m[k]) - 4.0) > 1e-6]
    print(f"{len(ms)} measures, {len(notes)} notes, range {min(notes)}-{max(notes)}")
    if bad: print(f"WARNING bars not totalling 4 beats: {bad}")
    if a.out:
        open(a.out+'.musicxml','w').write(musicxml(ms, a.title, a.composer, a.key, a.tempo))
        open(a.out+'.mid','wb').write(midifile(ms, a.title, a.tempo))
        print(f"wrote {a.out}.musicxml and {a.out}.mid")

if __name__ == '__main__':
    main()
