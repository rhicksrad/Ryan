"""Turn raw poster art into what the site ships.

    python tools/art/posters.py <raw.png> [<raw.png> ...]

Each raw file must be named poster-<project id>.png (or .raw.png). It is centre
cropped to exactly 2:1, resized to 1024 x 512 and written to
src/assets/art/poster-<id>.webp at the highest quality that keeps it under
TARGET_KB (never below MIN_QUALITY). The size budget (scripts/size-budget.mjs)
holds each poster to 80 KB. Needs Pillow.
"""
import io
import os
import re
import sys

from PIL import Image

ART = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'art')
W, H = 1024, 512
TARGET_KB = 56
MIN_QUALITY = 50


def crop_2x1(im):
    w, h = im.size
    if w > 2 * h:
        x = (w - 2 * h) // 2
        return im.crop((x, 0, x + 2 * h, h))
    y = (h - w // 2) // 2
    return im.crop((0, y, w, y + w // 2))


def encode(im, quality):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    return buf.getvalue()


def main():
    for raw in sys.argv[1:]:
        m = re.match(r'poster-(.+?)(\.raw)?\.png$', os.path.basename(raw))
        if not m:
            sys.exit(f'not a poster file: {raw}')
        pid = m.group(1)
        im = crop_2x1(Image.open(raw).convert('RGB')).resize((W, H), Image.LANCZOS)
        quality = 86
        data = encode(im, quality)
        while len(data) > TARGET_KB * 1024 and quality > MIN_QUALITY:
            quality -= 4
            data = encode(im, quality)
        with open(os.path.join(ART, f'poster-{pid}.webp'), 'wb') as f:
            f.write(data)
        print(f'poster-{pid}.webp  q{quality}  {len(data) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
