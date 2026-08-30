#!/usr/bin/env python3
"""Generate PWA icons from canonical HackMe HMC logo-hex.png."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
LOGO_PATH = PUBLIC / "logo-hex.png"
ICONS = PUBLIC / "icons"
SRC_LOGO = ROOT.parent / "HackMe" / "web" / "site" / "assets" / "logo-hex.png"


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def ensure_logo() -> Image.Image:
    if not LOGO_PATH.exists() and SRC_LOGO.exists():
        LOGO_PATH.write_bytes(SRC_LOGO.read_bytes())
    if not LOGO_PATH.exists():
        raise SystemExit(f"missing logo: {LOGO_PATH}")
    return Image.open(LOGO_PATH).convert("RGBA")


def make_bg(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        draw.line([(0, y), (size, y)], fill=(lerp(10, 5, t), lerp(16, 7, t), lerp(32, 13, t), 255))
    return img


def paste_logo(canvas: Image.Image, logo_src: Image.Image, pad_ratio: float) -> Image.Image:
    size = canvas.size[0]
    pad = int(size * pad_ratio)
    inner = size - pad * 2
    logo = logo_src.copy()
    logo.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def add_glow_ring(canvas: Image.Image) -> Image.Image:
    size = canvas.size[0]
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ring)
    inset = int(size * 0.08)
    draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=int(size * 0.18),
        outline=(77, 228, 255, 70),
        width=max(2, size // 96),
    )
    ring = ring.filter(ImageFilter.GaussianBlur(radius=max(1, size // 128)))
    return Image.alpha_composite(canvas, ring)


def rounded_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=int(size * 0.21), fill=255)
    return mask


def render_icon(logo_src: Image.Image, size: int, pad_ratio: float, maskable: bool = False) -> Image.Image:
    bg = make_bg(size)
    if not maskable:
        bg = add_glow_ring(bg)
    icon = paste_logo(bg, logo_src, pad_ratio)
    if maskable:
        return icon
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0), rounded_mask(size))
    return out


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    logo_src = ensure_logo()
    targets = [
        (192, 0.14, False, "icon-192.png"),
        (512, 0.14, False, "icon-512.png"),
        (512, 0.20, True, "icon-maskable-512.png"),
        (180, 0.14, False, "apple-touch-icon.png"),
        (32, 0.12, False, "favicon-32.png"),
    ]
    for size, pad, maskable, name in targets:
        out = render_icon(logo_src, size, pad, maskable)
        out.save(ICONS / name, optimize=True)
        print(f"wrote {name} {out.size}")


if __name__ == "__main__":
    main()
