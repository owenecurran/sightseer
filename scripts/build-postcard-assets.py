"""Turns the postcard source scans into the assets the app actually ships.

The sources in assets/brand-source/postcard are photographic scans: CMYK
JPEGs around 1700x1100 for the blanks and 3500x2548 RGB for the grain
plates, tens of megabytes in total. None of that can go in a bundle, and
the blanks additionally arrive on a pure-white studio background that would
render as a white rectangle behind every card.

Run this after adding or swapping a source file:

    python scripts/build-postcard-assets.py

It writes assets/postcard/, which IS committed — the outputs are inputs to
the bundle, and regenerating them should be a deliberate act rather than
something that happens on someone's machine at build time.
"""

import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SRC = os.path.join('assets', 'brand-source', 'postcard')
OUT = os.path.join('assets', 'postcard')

# Which scans to ship. Enough that a screenful of cards is not obviously the
# same sheet repeated, few enough to keep the bundle honest — each card is a
# few hundred KB and they are all on screen at once in a feed.
BLANKS = ['13', '15', '18', '21', '23']
# The grain plates are nearly identical to each other at a glance; the point
# of more than one is that two cards next to each other do not share the same
# scratch. Three is enough for that.
GRAINS = ['19', '21', '27']

# The card renders about 360dp wide, so at 3x this is already more resolution
# than any phone will ask for. Paper texture upscales gracefully, which is why
# this is not larger.
CARD_WIDTH = 900
# The grain is a soft overlay with no fine detail worth preserving, and it is
# stretched over the picture rather than tiled.
GRAIN_WIDTH = 700

# Card stock is very nearly one colour, so a palette costs almost nothing in
# fidelity and saves an enormous amount: a full-colour RGBA card is 720KB and
# the same card at 128 colours is 55KB, with no banding visible on paper this
# flat. Five cards in two orientations at full colour would have been 8MB of
# bundle on their own.
PALETTE_COLORS = 128

# How far in from the card's edge the frame overlay reaches, as a fraction of
# the card's width. The frame is the card with its middle removed, laid back
# over the picture — so the picture's edge becomes the frame's inner deckle
# rather than a cut rectangle, and the border around the picture is the same
# torn edge as the border around the card. Slightly more than the layout's own
# inset, so the picture always runs underneath it.
FRAME_DEPTH_RATIO = 0.045

# Where each card's overall colour is pulled to, as a position between pure
# white and the theme's cream. The scans arrive with a strong yellow-green
# cast from the scanner, which against this app's dark green background reads
# as olive rather than as card — and the five sheets are wildly different
# from each other besides, one of them nearly two stops darker than the rest.
#
# Correcting the cast and leaving the spread deliberate: each sheet is pulled
# to its own point on the white-to-cream line, so a feed still shows cards of
# visibly different ages without any of them going green. Past 1.0 is a
# little warmer than the palette's cream, which is where the oldest card sits.
CARD_TONES = [0.30, 0.52, 0.74, 0.94, 1.12]


THEME_CREAM = (234, 231, 207)
PURE_WHITE = (255, 255, 255)

# How far from pure white still counts as the studio background. The card's
# own lightest cream sits far below this on the blue channel (about 234
# against the background's 255), so there is a wide gap to aim at.
WHITE_THRESH = 16


def cut_out_card(path):
    """Scan -> RGBA with the white background removed and the deckle kept.

    Flood filled from the corners rather than keyed on colour: the card has
    pale patches of its own that a colour key clips into holes, whereas the
    background is by definition the white region connected to the edge of the
    scan.
    """
    rgb = Image.open(path).convert('RGB')
    w, h = rgb.size

    filled = rgb.copy()
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(filled, seed, (255, 0, 255), thresh=WHITE_THRESH)

    # Anything the fill touched is background. Comparing against the original
    # finds it without a per-pixel loop.
    touched = ImageChops.difference(filled, rgb).convert('L')
    alpha = touched.point(lambda v: 0 if v > 10 else 255)
    # A hair of feather, so the deckle reads as torn paper rather than as a
    # cut-out with a stair-stepped edge.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))

    # Flood the background with the card's own colour before resampling. Left
    # white, it bleeds a bright fringe along the entire deckle as soon as the
    # image is scaled down.
    card_only = rgb.copy()
    card_only.putalpha(alpha)
    average = card_only.resize((1, 1), Image.LANCZOS).convert('RGB').getpixel((0, 0))
    backing = Image.new('RGB', (w, h), average)
    backing.paste(rgb, mask=alpha)

    backing.putalpha(alpha)
    return backing


# Which point in a channel's distribution counts as "the paper". High enough
# to sit above the stains, below the few blown highlights along the deckle.
PAPER_PERCENTILE = 0.80


def percentile(band, mask, fraction):
    """The value below which `fraction` of the masked pixels fall."""
    histogram = band.histogram(mask=mask)
    cutoff = sum(histogram) * fraction
    running = 0
    for value, count in enumerate(histogram):
        running += count
        if running >= cutoff:
            return value
    return 255


def retone(card, tone):
    """Neutralise the scanner's cast and set the sheet's overall shade.

    A flat per-channel gain, so every mark, fibre and stain on the card keeps
    its relationship to the paper around it — the alternative, grading the
    image, flattens exactly the texture the scan was used for.
    """
    target = tuple(
        round(PURE_WHITE[i] + (THEME_CREAM[i] - PURE_WHITE[i]) * tone) for i in range(3)
    )
    alpha = card.getchannel('A')
    # Matched on the paper's own base tone, not the sheet's average. The
    # average is dragged down by foxing, creases and the printed rules, so the
    # more stained a card is the darker and greyer this made it — one sheet
    # came out neutral grey with no cream left in it at all. A high percentile
    # reads the clean paper between the marks, which is the thing that should
    # be cream.
    bands = []
    for i, band in enumerate(card.convert('RGB').split()):
        base = percentile(band, alpha, PAPER_PERCENTILE)
        gain = target[i] / max(1, base)
        bands.append(band.point(lambda v, g=gain: min(255, round(v * g))))

    toned = Image.merge('RGB', bands)
    toned.putalpha(alpha)
    return toned


def erode(alpha, depth):
    """Pull an alpha channel inward by roughly `depth` pixels.

    Repeated 9x9 minimum filters rather than one huge one: a MinFilter is
    O(size^2) per pixel, so nine passes of 9 is far quicker than one pass of
    81 and erodes by the same amount.
    """
    step = 4  # a MinFilter(9) eats 4px off every side
    for _ in range(max(1, round(depth / step))):
        alpha = alpha.filter(ImageFilter.MinFilter(9))
    return alpha


def as_frame(card):
    """The card with its middle taken out — see FRAME_DEPTH_RATIO.

    The hole is the card's own outline eroded inward, so the edge left around
    the picture is the same torn deckle as the edge around the card, just
    smaller. A drawn or generated inner edge was the obvious alternative and
    is exactly what this replaces: it never matched, because the real deckle
    is not a wave.
    """
    alpha = card.getchannel('A')
    inner = erode(alpha, card.width * FRAME_DEPTH_RATIO)
    # Outer minus inner: opaque only in the ring between the two outlines.
    ring = ImageChops.subtract(alpha, inner)
    frame = card.copy()
    frame.putalpha(ring)
    return frame


def save_quantized(image, path):
    image.quantize(colors=PALETTE_COLORS, method=Image.FASTOCTREE).save(path, optimize=True)


def write_card(name, tone):
    card = retone(cut_out_card(os.path.join(SRC, 'blank', f'{name}.jpg')), tone)
    frame = as_frame(card)
    w, h = card.size

    def landscape(img):
        return img.resize((CARD_WIDTH, round(h * CARD_WIDTH / w)), Image.LANCZOS)

    def portrait(img):
        turned = img.rotate(90, expand=True)
        pw, ph = turned.size
        return turned.resize((round(pw * CARD_WIDTH / ph), CARD_WIDTH), Image.LANCZOS)

    save_quantized(landscape(card), os.path.join(OUT, f'card-{name}.png'))
    save_quantized(landscape(frame), os.path.join(OUT, f'cardframe-{name}.png'))
    # A portrait card is the same sheet turned, not a different one. The
    # deckle runs around all four edges, so a rotation is indistinguishable
    # from a scan of a portrait card.
    save_quantized(portrait(card), os.path.join(OUT, f'card-{name}-portrait.png'))
    save_quantized(portrait(frame), os.path.join(OUT, f'cardframe-{name}-portrait.png'))


def write_grain(name):
    grain = Image.open(os.path.join(SRC, 'textures', f'{name}.jpg')).convert('RGB')
    w, h = grain.size
    grain = grain.resize((GRAIN_WIDTH, round(h * GRAIN_WIDTH / w)), Image.LANCZOS)
    # JPEG, not PNG: this plate has no alpha and no flat areas, so PNG buys
    # nothing and costs several times the bytes.
    grain.save(os.path.join(OUT, f'grain-{name}.jpg'), quality=82, optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, tone in zip(BLANKS, CARD_TONES):
        write_card(name, tone)
        print('card', name, f'tone={tone}')

    for name in GRAINS:
        write_grain(name)
        print('grain', name)

    total = sum(
        os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)
    )
    print(f'{len(os.listdir(OUT))} files, {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
