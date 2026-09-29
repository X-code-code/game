"""Render reproducible geometry previews; these are not production art."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
SCENE = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))
OUT = ROOT / "design"


def font(size: int):
    windows_font = Path("C:/Windows/Fonts/arial.ttf")
    return ImageFont.truetype(str(windows_font), size) if windows_font.exists() else ImageFont.load_default()


PALETTE = {
    "building_back": (119, 138, 142, 235),
    "street_back": (183, 119, 81, 220),
    "depth": (135, 96, 68, 230),
    "overhead": (178, 73, 61, 160),
    "effects": (109, 167, 167, 160),
}


def render(name: str, size: tuple[int, int], focus: tuple[float, float], scale: float, hud: bool):
    width, height = size
    image = Image.new("RGBA", size, (233, 221, 199, 255))
    draw = ImageDraw.Draw(image, "RGBA")

    def at(x: float, y: float) -> tuple[int, int]:
        return (round(width / 2 + (x - focus[0]) * scale),
                round(height / 2 - (y - focus[1]) * scale))

    def box(x0, y0, x1, y1):
        a = at(x0, y0)
        b = at(x1, y1)
        return (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))

    draw.rectangle(box(-768, -1024, 768, 1024), fill=(219, 205, 177, 255))
    for region in SCENE["walkableRegions"]:
        points = [at(x, y) for x, y in region["polygon"]]
        fill = (232, 221, 198, 255) if region["access"] == "public" else (206, 196, 165, 255)
        draw.polygon(points, fill=fill, outline=(180, 160, 125, 210), width=2)
    for step in range(-900, 901, 85):
        p0, p1 = at(-280, step), at(310, step)
        draw.line((*p0, *p1), fill=(190, 178, 153, 110), width=1)

    for slot in SCENE["artSlots"]:
        if slot["layer"] == "ground":
            continue
        x, y = slot["center"].values()
        w, h = slot["size"].values()
        rect = box(x - w / 2, y - h / 2, x + w / 2, y + h / 2)
        fill = PALETTE[slot["layer"]]
        draw.rounded_rectangle(rect, radius=max(3, round(8 * scale)), fill=fill,
                               outline=(89, 65, 55, 220), width=max(1, round(2 * scale)))
        if (rect[2] - rect[0]) > 50 and (rect[3] - rect[1]) > 30:
            label = slot["id"].replace("lc_", "").replace("_back", "").replace("_front", "")
            draw.text((rect[0] + 5, rect[1] + 5), label[:20], font=font(10), fill=(37, 30, 27, 255))

    for footprint in SCENE["physicalFootprints"]:
        draw.polygon([at(x, y) for x, y in footprint["polygon"]],
                     fill=(118, 44, 42, 85), outline=(118, 44, 42, 220), width=2)

    for plan in SCENE["npcPlans"]:
        route = [at(p["x"], p["y"]) for p in plan["route"]]
        if len(route) > 1:
            draw.line(route, fill=(56, 104, 92, 180), width=max(2, round(4 * scale)), joint="curve")
            for i, p in enumerate(route[1:-1], 1):
                draw.ellipse((p[0]-3, p[1]-3, p[0]+3, p[1]+3), fill=(50, 102, 82, 255))
        x, y = route[0]
        radius = max(8, round(plan["footRadius"] * scale))
        draw.ellipse((x-radius, y-radius, x+radius, y+radius),
                     fill=(242, 218, 116, 255), outline=(104, 67, 46, 255), width=2)
        label = plan["id"].replace("_customer", "").replace("_chick", "")
        draw.text((x + radius + 4, y - 7), label, font=font(11), fill=(55, 43, 34, 255))

    for spot in SCENE["standingSpots"]:
        if spot["id"] in {"tea_customer_foot", "tea_cup_handoff"}:
            x, y = at(spot["at"]["x"], spot["at"]["y"])
            draw.ellipse((x-6, y-6, x+6, y+6), outline=(30, 84, 99, 255), width=2)
            draw.text((x + 8, y - 12), spot["id"].replace("tea_", ""), font=font(10),
                      fill=(30, 84, 99, 255))

    for target in SCENE["hiddenObjectSlots"]:
        x, y = at(target["at"]["x"], target["at"]["y"])
        draw.ellipse((x-5, y-5, x+5, y+5), fill=(250, 236, 182, 255),
                     outline=(20, 99, 104, 255), width=2)
        draw.text((x+7, y-8), target["id"].replace("tea_", "").replace("tailor_", ""),
                  font=font(10), fill=(20, 99, 104, 255))

    draw.rectangle((0, 0, width, 39), fill=(49, 47, 44, 210))
    draw.text((12, 11), f"GREYBOX {name} | {width}x{height} | zoom {scale / 0.46875:.2f}",
              font=font(13), fill=(255, 247, 231, 255))
    if hud:
        reserve = SCENE["camera"]["hudBottomReserveScreenPx"]
        draw.rectangle((0, height-reserve, width, height), fill=(42, 50, 55, 185))
        draw.text((14, height-reserve+14), "HUD reserved area (screen-fixed)",
                  font=font(13), fill=(255, 248, 224, 255))
        draw.text((14, height-reserve+40), "Targets and NPC routes remain in map coordinates.",
                  font=font(11), fill=(255, 248, 224, 255))

    output = OUT / f"preview_{name}.png"
    image.convert("RGB").save(output, optimize=True)
    print(output)


def main():
    camera = SCENE["camera"]
    viewport = camera["referenceViewport"]
    size = (viewport["width"], viewport["height"])
    fit = max(size[0] / SCENE["map"]["width"], size[1] / SCENE["map"]["height"])
    normal = camera["initialFocus"]
    detail = camera["detailPreviewFocus"]
    render("initial_444x960", size, (normal["x"], normal["y"]), fit * camera["initialZoom"], True)
    render("detail_444x960", size, (detail["x"], detail["y"]), fit * camera["maxZoom"], True)
    render("full_map", (576, 768), (0, 0), 576 / SCENE["map"]["width"], False)


if __name__ == "__main__":
    main()
