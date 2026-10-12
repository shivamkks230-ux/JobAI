"""Generate JobMatch AI branding assets (app icon, adaptive icon, splash, favicon).

Design language:
- Briefcase (jobs) + magnifying glass with person glyph (candidate search) + AI sparkle.
- Premium purple/violet/indigo gradient: #3B2FBF -> #5425D8 -> #7C3AED -> #A855F7.
- Supersampled 4x then downscaled with LANCZOS for crisp edges.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = "/app/frontend/assets/images"
SS = 4  # supersample factor

STOPS = [
    (0.00, (59, 47, 191)),    # deep indigo
    (0.40, (84, 37, 216)),    # #5425D8 primary purple
    (0.72, (124, 58, 237)),   # #7C3AED violet
    (1.00, (168, 85, 247)),   # #A855F7 accent
]
PURPLE = (84, 37, 216)
INK = (23, 21, 58)  # #17153A
WHITE = (255, 255, 255)


def gradient_image(w, h, stops=STOPS):
    """Diagonal multi-stop gradient as RGBA image."""
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    t = (x + y) / 2.0
    img = np.zeros((h, w, 3), dtype=np.float32)
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], dtype=np.float32)
    for c in range(3):
        img[..., c] = np.interp(t, pos, cols[:, c])
    a = np.full((h, w, 1), 255, dtype=np.float32)
    return Image.fromarray(np.concatenate([img, a], axis=2).astype(np.uint8), "RGBA")


def rounded_mask(w, h, radius):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return m


def draw_sparkle(draw, cx, cy, r, color):
    """Four-point AI sparkle star."""
    inner = r * 0.22
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rad = r if i % 2 == 0 else inner
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    draw.polygon(pts, fill=color)


def draw_mark(canvas, cx, cy, size, monochrome=False):
    """Draw the JobMatch AI logo mark centered at (cx, cy), sized ~`size` px.

    Briefcase + magnifier-with-person + sparkles.
    monochrome=True renders everything white (for gradient tiles / adaptive icon).
    """
    d = ImageDraw.Draw(canvas)
    s = size / 100.0  # unit

    fg = WHITE
    accent = WHITE if monochrome else PURPLE

    # --- Briefcase ---
    bw, bh = 62 * s, 44 * s
    bx, by = cx - bw / 2, cy - bh / 2 + 6 * s
    rad = 9 * s
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=rad, fill=fg)
    # handle
    hw, hh, ht = 24 * s, 12 * s, 5.5 * s
    hx, hy = cx - hw / 2, by - hh + 1.5 * s
    d.rounded_rectangle([hx, hy, hx + hw, hy + hh], radius=ht / 2 + 1, outline=fg, width=int(ht))
    # flap line + clasp: violet detail reads on white, on tiles and on adaptive bg
    detail = (124, 58, 237) if monochrome else accent
    flap_y = by + bh * 0.34
    d.line([bx + 3 * s, flap_y, bx + bw - 3 * s, flap_y], fill=detail, width=int(2.4 * s))
    cw, ch = 11 * s, 8 * s
    d.rounded_rectangle([cx - cw / 2, flap_y - ch / 2, cx + cw / 2, flap_y + ch / 2],
                        radius=2 * s, fill=detail)

    # --- Magnifying glass with person glyph (bottom-right overlap) ---
    lens_r = 16 * s
    lx, ly = cx + 21 * s, cy + 17 * s
    ring_w = int(5.5 * s)
    d.ellipse([lx - lens_r, ly - lens_r, lx + lens_r, ly + lens_r], fill=(124, 58, 237))
    d.ellipse([lx - lens_r, ly - lens_r, lx + lens_r, ly + lens_r], outline=fg, width=ring_w)
    # person glyph inside lens
    head_r = 4.2 * s
    d.ellipse([lx - head_r, ly - lens_r * 0.55, lx + head_r, ly - lens_r * 0.55 + head_r * 2],
              fill=WHITE)
    shoulder_r = 8.5 * s
    d.pieslice([lx - shoulder_r, ly + 0.2 * s, lx + shoulder_r, ly + shoulder_r * 2 + 0.2 * s],
               start=180, end=360, fill=WHITE)
    # handle of the magnifier
    ang = math.radians(45)
    sx = lx + (lens_r + ring_w / 2 - 1 * s) * math.cos(ang)
    sy = ly + (lens_r + ring_w / 2 - 1 * s) * math.sin(ang)
    ex = lx + (lens_r + 17 * s) * math.cos(ang)
    ey = ly + (lens_r + 17 * s) * math.sin(ang)
    d.line([sx, sy, ex, ey], fill=fg, width=int(6.5 * s))
    # rounded cap on handle end
    cap_r = 3.25 * s
    d.ellipse([ex - cap_r, ey - cap_r, ex + cap_r, ey + cap_r], fill=fg)

    # --- AI sparkles (top-right) ---
    draw_sparkle(d, cx + 20 * s, by - 15 * s, 9 * s, WHITE)
    draw_sparkle(d, cx + 34 * s, by - 3 * s, 5 * s, WHITE if monochrome else (233, 213, 255))


def make_icon(size_px):
    """Full-bleed gradient square icon with the mark."""
    w = size_px * SS
    img = gradient_image(w, w)
    # subtle radial glow behind mark
    glow = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr = int(w * 0.34)
    gd.ellipse([w / 2 - gr, w / 2 - gr, w / 2 + gr, w / 2 + gr], fill=(255, 255, 255, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.06))
    img = Image.alpha_composite(img, glow)
    draw_mark(img, w / 2, w / 2, w * 0.62)
    return img.resize((size_px, size_px), Image.LANCZOS)


def make_adaptive(size_px):
    """Transparent foreground, mark in white, sized inside the 66% safe zone."""
    w = size_px * SS
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    draw_mark(img, w / 2, w / 2, w * 0.52, monochrome=True)
    return img.resize((size_px, size_px), Image.LANCZOS)


def make_logo_tile(size_px):
    """Gradient rounded tile with mark, transparent outside (for in-app/splash use)."""
    w = size_px * SS
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    grad = gradient_image(w, w)
    mask = rounded_mask(w, w, int(w * 0.235))
    img.paste(grad, (0, 0), mask)
    # soft inner top sheen
    sheen = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.rounded_rectangle([0, 0, w - 1, int(w * 0.5)], radius=int(w * 0.235), fill=(255, 255, 255, 26))
    sheen.putalpha(Image.composite(sheen.split()[3], Image.new("L", (w, w), 0), mask))
    img = Image.alpha_composite(img, sheen)
    draw_mark(img, w / 2, w / 2, w * 0.68, monochrome=True)
    return img.resize((size_px, size_px), Image.LANCZOS)


def wave_layer(w, h, base_y, amp, phase, color, alpha):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    for x in range(0, w + 8, 8):
        y = base_y + amp * math.sin((x / w) * math.pi * 2 * 1.15 + phase)
        pts.append((x, y))
    pts += [(w, h), (0, h)]
    d.polygon(pts, fill=color + (alpha,))
    return layer


def make_splash(w=1440, h=2880):
    """White splash: centered logo tile + app name + tagline, gradient waves bottom."""
    img = Image.new("RGBA", (w, h), WHITE + (255,))

    # logo tile with soft shadow
    tile = make_logo_tile(460)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    smask = rounded_mask(460, 460, int(460 * 0.235)).filter(ImageFilter.GaussianBlur(28))
    sh = Image.new("RGBA", (460, 460), (84, 37, 216, 90))
    sh.putalpha(smask)
    tx, ty = int(w / 2 - 230), int(h * 0.30)
    shadow.alpha_composite(sh, (tx + 6, ty + 26))
    img = Image.alpha_composite(img, shadow)
    img.alpha_composite(tile, (tx, ty))

    # text
    def font(name, size):
        for p in [f"/usr/share/fonts/truetype/dejavu/{name}",
                  f"/usr/share/fonts/truetype/freefont/{name.replace('DejaVuSans', 'FreeSans').replace('-', '')}.ttf",
                  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]:
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
        return ImageFont.load_default()

    f_name = font("DejaVuSans-Bold.ttf", 108)
    f_tag = font("DejaVuSans.ttf", 46)

    def center_text(y, text, f, fill, spacing=0):
        bb = img.textbbox((0, 0), text, font=f)
        tw = bb[2] - bb[0]
        ImageDraw.Draw(img).text((w / 2 - tw / 2, y), text, font=f, fill=fill)

    d = ImageDraw.Draw(img)
    name = "JobMatch AI"
    bb = d.textbbox((0, 0), name, font=f_name)
    d.text((w / 2 - (bb[2] - bb[0]) / 2, ty + 460 + 90), name, font=f_name, fill=INK)
    tag = "Find the Right Job. Faster."
    bb2 = d.textbbox((0, 0), tag, font=f_tag)
    d.text((w / 2 - (bb2[2] - bb2[0]) / 2, ty + 460 + 240), tag, font=f_tag, fill=(100, 116, 139))

    # gradient waves at the bottom
    base = h * 0.82
    img = Image.alpha_composite(img, wave_layer(w, h, base, 46, 0.4, (168, 85, 247), 60))
    img = Image.alpha_composite(img, wave_layer(w, h, base + 70, 54, 2.2, (124, 58, 237), 90))
    img = Image.alpha_composite(img, wave_layer(w, h, base + 150, 60, 4.0, (84, 37, 216), 140))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    make_icon(1024).convert("RGBA").save(f"{OUT}/icon.png", optimize=True)
    make_icon(512).convert("RGBA").save(f"{OUT}/playstore-icon.png", optimize=True)
    make_icon(512).convert("RGBA").save(f"{OUT}/favicon.png", optimize=True)
    make_adaptive(1024).save(f"{OUT}/adaptive-icon.png", optimize=True)
    make_logo_tile(512).save(f"{OUT}/logo-mark.png", optimize=True)
    make_splash().convert("RGB").save(f"{OUT}/splash-image.png", optimize=True)
    print("Generated:")
    for f in ["icon.png", "playstore-icon.png", "favicon.png", "adaptive-icon.png",
              "logo-mark.png", "splash-image.png"]:
        p = os.path.join(OUT, f)
        print(f"  {f}: {os.path.getsize(p) // 1024} KB")


if __name__ == "__main__":
    main()
