"""Generate extension icons at 16/48/128.

On state: filled teal pin on slate rounded square — high contrast.
Off state: transparent background, thin light-grey outlined pin only —
reads as visibly "off" in both light and dark Chrome toolbars.
"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

BG_ACTIVE = (0, 0, 0, 255)           # black
ACCENT_ACTIVE = (239, 106, 71, 255)  # #EF6A47 brand orange
WHITE = (255, 255, 255, 255)

OUTLINE_OFF = (156, 163, 175, 255)   # gray-400 (readable on light + dark toolbars)


def draw_active(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=BG_ACTIVE)

    cx, cy = size / 2, size * 0.44
    head_r = size * 0.22
    d.ellipse([cx - head_r, cy - head_r, cx + head_r, cy + head_r], fill=ACCENT_ACTIVE)

    tip_y = size * 0.86
    d.polygon(
        [(cx - head_r * 0.7, cy + head_r * 0.4), (cx + head_r * 0.7, cy + head_r * 0.4), (cx, tip_y)],
        fill=ACCENT_ACTIVE,
    )

    inner_r = head_r * 0.38
    d.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=WHITE)
    return img


def draw_off(size: int) -> Image.Image:
    """Transparent bg, solid light-grey pin silhouette with no inner dot.
    Unambiguously 'off' vs the filled-teal-on-dark 'on' icon."""
    scale = 4
    big = size * scale
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx, cy = big / 2, big * 0.44
    head_r = big * 0.24
    tip_y = big * 0.86

    d.ellipse([cx - head_r, cy - head_r, cx + head_r, cy + head_r], fill=OUTLINE_OFF)
    d.polygon(
        [(cx - head_r * 0.7, cy + head_r * 0.4), (cx + head_r * 0.7, cy + head_r * 0.4), (cx, tip_y)],
        fill=OUTLINE_OFF,
    )

    return img.resize((size, size), Image.LANCZOS)


for size in (16, 48, 128):
    draw_active(size).save(os.path.join(OUT, f"icon{size}.png"), "PNG")
    draw_off(size).save(os.path.join(OUT, f"icon{size}-off.png"), "PNG")
    print(f"wrote icon{size}.png + icon{size}-off.png")
