"""Deterministically paint four tiny street-block target props.

Editable authored source for the simplified 2D style. Run with the bundled
Python runtime (Pillow required). The 96 px source canvas is exported losslessly;
Cocos scales the painted prop to the blueprint's world-unit visual size.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "assets/bundles/city_living_city_street_block_01/targets"
SIZE = 96
SS = 4
INK = "#634A3B"
EDGE = "#795A45"
LIGHT = "#F3E6C6"
TERRA = "#B9684D"
TERRA_DARK = "#94593F"
GOLD = "#D9AB62"
GOLD_DARK = "#A97943"
IRON = "#858077"
IRON_DARK = "#676259"
IRON_GLINT = "#BCAE99"


class Painter:
    def __init__(self) -> None:
        self.im = Image.new("RGBA", (SIZE * SS, SIZE * SS))
        self.draw = ImageDraw.Draw(self.im)

    def pts(self, points: list[tuple[float, float]]) -> list[tuple[int, int]]:
        return [(round(x * SS), round(y * SS)) for x, y in points]

    def polygon(self, points: list[tuple[float, float]], fill: str, outline: str = INK, width: float = 2.2) -> None:
        p = self.pts(points)
        self.draw.polygon(p, fill=fill)
        if outline:
            self.draw.line(p + [p[0]], fill=outline, width=round(width * SS), joint="curve")

    def line(self, points: list[tuple[float, float]], fill: str = INK, width: float = 2) -> None:
        self.draw.line(self.pts(points), fill=fill, width=round(width * SS), joint="curve")

    def ellipse(self, box: tuple[float, float, float, float], fill: str, outline: str = INK, width: float = 2) -> None:
        self.draw.ellipse(tuple(round(a * SS) for a in box), fill=fill,
                          outline=outline, width=round(width * SS))

    def arc(self, box: tuple[float, float, float, float], start: int, end: int, fill: str = INK, width: float = 2) -> None:
        self.draw.arc(tuple(round(a * SS) for a in box), start, end,
                      fill=fill, width=round(width * SS))

    def finish(self) -> Image.Image:
        return self.im.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def tea_clay_whistle() -> Image.Image:
    """A fired-clay bird whistle amongst the tea stall's clay cups."""
    p = Painter()
    p.polygon([(21, 55), (18, 48), (23, 42), (36, 39), (43, 30), (55, 28),
               (65, 32), (70, 40), (67, 48), (75, 52), (75, 60), (65, 64),
               (53, 61), (45, 68), (31, 65)], TERRA, width=2.5)
    p.polygon([(18, 48), (11, 43), (11, 37), (20, 38), (28, 44)], TERRA_DARK, width=2.3)
    p.ellipse((47, 37, 56, 46), EDGE, outline=None)
    p.ellipse((50, 38, 52, 40), LIGHT, outline=None)
    p.ellipse((31, 49, 36, 54), INK, outline=None)
    p.line([(31, 59), (41, 61), (51, 60)], "#D8996B", 1.8)
    p.arc((25, 30, 68, 67), 220, 300, "#E6AF7B", 2)
    return p.finish()


def tailor_thimble() -> Image.Image:
    """A worn copper thimble, unlike adjacent pale buttons and thread spools."""
    p = Painter()
    p.polygon([(25, 70), (25, 44), (27, 34), (34, 28), (47, 25), (60, 28),
               (67, 36), (70, 47), (70, 69), (63, 73), (34, 73)], GOLD,
              width=2.4)
    p.polygon([(27, 62), (69, 62), (70, 70), (63, 74), (34, 74), (25, 70)],
              GOLD_DARK, width=2)
    p.arc((28, 25, 67, 48), 191, 344, LIGHT, 2)
    for x, y in [(38, 36), (48, 33), (58, 37), (33, 46), (44, 44), (55, 45),
                 (64, 49), (37, 54), (49, 54), (59, 55)]:
        p.ellipse((x, y, x + 2.5, y + 2.5), "#997143", outline=None)
    p.line([(31, 66), (64, 66)], "#E6BE79", 1.6)
    return p.finish()


def banner_knot() -> Image.Image:
    """One tied fabric rosette, coloured like other banner stitches."""
    p = Painter()
    p.polygon([(45, 44), (24, 29), (20, 50), (33, 58), (43, 52)], TERRA,
              width=2.4)
    p.polygon([(52, 42), (72, 28), (77, 48), (63, 58), (53, 52)], TERRA_DARK,
              width=2.4)
    p.polygon([(42, 53), (36, 78), (47, 69), (52, 78), (54, 53)], TERRA,
              width=2.3)
    p.ellipse((39, 38, 57, 58), GOLD, width=2.4)
    p.line([(27, 39), (37, 46)], LIGHT, 1.4)
    p.line([(67, 39), (59, 46)], "#D18A6A", 1.4)
    return p.finish()


def chestnut_tongs() -> Image.Image:
    """Weathered iron tongs with a worn wooden pivot, among chestnuts."""
    p = Painter()
    p.polygon([(19, 72), (29, 67), (60, 34), (64, 28), (70, 32), (67, 39),
               (37, 72), (25, 79)], IRON, width=2.4)
    p.polygon([(27, 79), (34, 73), (69, 47), (75, 45), (78, 50), (75, 56),
               (43, 82), (32, 85)], IRON_DARK, width=2.4)
    p.ellipse((25, 69, 36, 80), GOLD_DARK, width=2)
    p.line([(62, 32), (56, 26), (61, 18)], INK, 2)
    p.line([(74, 49), (82, 47), (84, 38)], INK, 2)
    p.line([(45, 54), (60, 39)], IRON_GLINT, 1.2)
    return p.finish()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    review = ROOT / "art/review/simple_hidden_objects_v1"
    review.mkdir(parents=True, exist_ok=True)
    assets = {
        "tea_clay_whistle": tea_clay_whistle,
        "tailor_thimble": tailor_thimble,
        "banner_knot": banner_knot,
        "chestnut_tongs": chestnut_tongs,
    }
    records = []
    context = ["#A47A55", "#8FA789", "#B9684D", "#D9AB62"]
    sheet = Image.new("RGB", (420, 4 * 96 + 24), "#F6F0E1")
    sheet_draw = ImageDraw.Draw(sheet)
    for index, (asset_id, painter) in enumerate(assets.items()):
        path = OUT / f"{asset_id}.png"
        image = painter()
        image.save(path, optimize=True)
        alpha = image.getchannel("A")
        assert image.size == (SIZE, SIZE) and alpha.getextrema() == (0, 255)
        assert all(image.getpixel(xy)[3] == 0 for xy in [(0, 0), (95, 0), (0, 95), (95, 95)])
        records.append({"id": asset_id, "path": path.relative_to(ROOT).as_posix(),
                        "size": list(image.size), "transparent": True,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        y = index * 96 + 12
        sheet_draw.text((12, y), asset_id, fill=INK)
        sheet_draw.rectangle((190, y, 276, y + 86), fill=context[index])
        sheet.paste(image.resize((75, 75), Image.Resampling.LANCZOS), (195, y + 5),
                    image.resize((75, 75), Image.Resampling.LANCZOS))
        sheet_draw.rectangle((310, y + 24, 344, y + 58), fill=context[index])
        tiny = image.resize((22, 22), Image.Resampling.LANCZOS)
        sheet.paste(tiny, (316, y + 30), tiny)
    sheet.save(review / "contact_75px_and_22px.png", optimize=True)
    (HERE / "export_record.json").write_text(json.dumps({
        "styleId": "chicken_simple_2d_v1", "source": "render_targets.py",
        "generationSpec": "96x96 RGBA painted via Pillow at 4x supersampling",
        "finalGameAssetSpec": "Blueprint visualWorldSize per target, independent hit radius",
        "assets": records,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
