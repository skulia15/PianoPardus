"""Pull the page out of a screenshot and make it legible.

    python3 crop-page.py <image> <out.png> [scale]

A screenshot of a score viewer is mostly chrome; this finds the bright page,
crops to it and upscales, which is what makes small print readable.
"""
import sys
import cv2
import numpy as np

source, out = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0

image = cv2.imread(source)
if image is None:
    raise SystemExit(f'could not read {source}')

gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
count, _, stats, _ = cv2.connectedComponentsWithStats((gray > 200).astype(np.uint8), 8)

if count > 1:
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = (stats[largest, k] for k in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP,
                                             cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT))
    # Only trust it if the bright region really is a page rather than a highlight.
    if w * h > 0.15 * gray.size:
        pad = 6
        image = image[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]

big = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
cv2.imwrite(out, big)
print(f'wrote {out} {big.shape[1]}x{big.shape[0]}')
