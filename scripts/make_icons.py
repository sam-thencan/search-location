"""Generate extension icons at 16/48/128 — a simple pin-on-rounded-square.

Emits two variants:
  icon{size}.png      — active (teal pin on slate)
  icon{size}-off.png  — inactive (greyscale pin on slate)
"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

BG_ACTIVE = (15, 23, 42, 255)       # slate-900
BG_OFF = (30, 41, 59, 255)          # slate-800 (subtly darker for off state)
ACCENT_ACTIVE = (20, 184, 166, 255) # teal-500
ACCENT_OFF = (100, 116, 139, 255)   # slate-500 (desaturated)
WHITE = (255, 255, 255, 255)
DOT_OFF = (203, 213, 225, 255)      # slate-300

def draw_icon(size: int, active: bool) -> Image.Image:
    bg = BG_ACTIVE if active else BG_OFF
    accent = ACCENT_ACTIVE if active else ACCENT_OFF
    dot = WHITE if active else DOT_OFF

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=bg)

    cx, cy = size / 2, size * 0.44
    head_r = size * 0.22
    d.ellipse([cx - head_r, cy - head_r, cx + head_r, cy + head_r], fill=accent)

    tip_y = size * 0.86
    d.polygon(
        [(cx - head_r * 0.7, cy + head_r * 0.4), (cx + head_r * 0.7, cy + head_r * 0.4), (cx, tip_y)],
        fill=accent,
    )

    inner_r = head_r * 0.38
    d.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=dot)

    return img

for size in (16, 48, 128):
    draw_icon(size, active=True).save(os.path.join(OUT, f"icon{size}.png"), "PNG")
    draw_icon(size, active=False).save(os.path.join(OUT, f"icon{size}-off.png"), "PNG")
    print(f"wrote icon{size}.png + icon{size}-off.png")
