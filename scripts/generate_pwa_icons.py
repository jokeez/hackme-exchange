#!/usr/bin/env python3
"""Generate self-contained PWA icons from canonical HackMe HMC logo-hex.png."""
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
LOGO_PATH = PUBLIC / "logo-hex.png"
ICONS = PUBLIC / "icons"
SRC_LOGO = ROOT.parent / "HackMe" / "web" / "site" / "assets" / "logo-hex.png"
ICON_VERSION = 3


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def ensure_logo() -> Image.Image:
    if not LOGO_PATH.exists() and SRC_LOGO.exists():
        LOGO_PATH.write_bytes(SRC_LOGO.read_bytes())
    if not LOGO_PATH.exists():
        raise SystemExit(f"missing logo: {LOGO_PATH}")
    raw = Image.open(LOGO_PATH).convert("RGBA")
    bbox = raw.getbbox()
    if not bbox:
        raise SystemExit("logo-hex.png has no visible pixels")
    # Trim transparent padding so the hex fills the icon.
    x0, y0, x1, y1 = bbox
    pad = max(4, int(max(x1 - x0, y1 - y0) * 0.02))
    return raw.crop((max(0, x0 - pad), max(0, y0 - pad), min(raw.width, x1 + pad), min(raw.height, y1 + pad)))


def make_bg(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        draw.line([(0, y), (size, y)], fill=(lerp(10, 5, t), lerp(16, 7, t), lerp(32, 13, t), 255))
    return img


def paste_logo(canvas: Image.Image, logo_src: Image.Image, fill_ratio: float) -> Image.Image:
    size = canvas.size[0]
    inner = int(size * fill_ratio)
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
    inset = int(size * 0.06)
    draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=int(size * 0.18),
        outline=(77, 228, 255, 90),
        width=max(2, size // 80),
    )
    ring = ring.filter(ImageFilter.GaussianBlur(radius=max(1, size // 100)))
    return Image.alpha_composite(canvas, ring)


def rounded_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=int(size * 0.21), fill=255)
    return mask


def render_icon(logo_src: Image.Image, size: int, fill_ratio: float, maskable: bool = False) -> Image.Image:
    bg = make_bg(size)
    if not maskable:
        bg = add_glow_ring(bg)
    icon = paste_logo(bg, logo_src, fill_ratio)
    if maskable:
        return icon
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0), rounded_mask(size))
    return out


def png_to_data_uri(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def write_embedded_svg(path: Path, size: int, logo_src: Image.Image, fill_ratio: float, maskable: bool) -> None:
    icon = render_icon(logo_src, size, fill_ratio, maskable)
    data_uri = png_to_data_uri(icon)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
  <image href="{data_uri}" width="{size}" height="{size}" preserveAspectRatio="xMidYMid meet"/>
</svg>
'''
    path.write_text(svg, encoding="utf-8")


def write_favicon_ico(path: Path, logo_src: Image.Image) -> None:
    sizes = [16, 32, 48]
    images = [render_icon(logo_src, s, 0.88, False) for s in sizes]
    images[0].save(path, format="ICO", sizes=[(s, s) for s in sizes])


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    logo_src = ensure_logo()
    print(f"logo crop {logo_src.size}")

    targets = [
        (192, 0.86, False, "icon-192.png"),
        (512, 0.86, False, "icon-512.png"),
        (512, 0.72, True, "icon-maskable-512.png"),
        (180, 0.86, False, "apple-touch-icon.png"),
        (32, 0.84, False, "favicon-32.png"),
    ]
    for size, fill, maskable, name in targets:
        out = render_icon(logo_src, size, fill, maskable)
        out.save(ICONS / name, optimize=True)
        print(f"wrote {name} {out.size}")

    write_embedded_svg(ICONS / "icon-192.svg", 192, logo_src, 0.86, False)
    write_embedded_svg(ICONS / "icon-512.svg", 512, logo_src, 0.86, False)
    write_embedded_svg(ICONS / "icon-maskable.svg", 512, logo_src, 0.72, True)
    write_favicon_ico(ICONS / "favicon.ico", logo_src)
    print(f"icon version {ICON_VERSION}")


if __name__ == "__main__":
    main()
