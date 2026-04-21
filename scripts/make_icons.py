"""Generate extension icons at 16/48/128 — a simple pin-on-rounded-square."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (15, 23, 42, 255)       # slate-900
ACCENT = (20, 184, 166, 255) # teal-500
WHITE = (255, 255, 255, 255)

def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=BG)

    cx, cy = size / 2, size * 0.44
    head_r = size * 0.22
    d.ellipse([cx - head_r, cy - head_r, cx + head_r, cy + head_r], fill=ACCENT)

    tip_y = size * 0.86
    d.polygon(
        [(cx - head_r * 0.7, cy + head_r * 0.4), (cx + head_r * 0.7, cy + head_r * 0.4), (cx, tip_y)],
        fill=ACCENT,
    )

    inner_r = head_r * 0.38
    d.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=WHITE)

    return img

for size in (16, 48, 128):
    icon = draw_icon(size)
    icon.save(os.path.join(OUT, f"icon{size}.png"), "PNG")
    print(f"wrote icon{size}.png")
