"""Refresh Cocos trim bounds for revised PNGs while keeping their UUIDs.

The scene places every SpriteFrame by the blueprint canvas center. After
redrawing a roof or removing the rear cart wheels, stale trim coordinates can
shift or clip the art in Cocos even though the exported PNG is correct.
"""

from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BUNDLE = ROOT / "assets/bundles/city_living_city_street_block_01/simple2d_scene"
BLUEPRINT = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))
SLOTS = {slot["id"]: slot for slot in BLUEPRINT["artSlots"]}
REVISED = (
    "lc_west_storefront_back",
    "lc_east_storefront_back",
    "lc_west_tailor_back",
    "lc_east_food_shop_back",
    "lc_south_post_house_back",
    "lc_south_grain_house_back",
    "lc_chestnut_cart_back",
)


def refresh(asset_id: str) -> None:
    slot = SLOTS[asset_id]
    png = BUNDLE / f"{asset_id}.png"
    meta = BUNDLE / f"{asset_id}.png.meta"
    record = json.loads(meta.read_text(encoding="utf-8"))
    original_uuid = record["uuid"]
    frame = record["subMetas"]["f9941"]["userData"]
    assert frame["trimType"] == "auto", asset_id
    with Image.open(png) as image:
        assert image.size == (slot["size"]["width"], slot["size"]["height"])
        raw_width, raw_height = image.size
        bounds = image.convert("RGBA").getchannel("A").getbbox()
        assert bounds is not None, asset_id
    left, top, right, bottom = bounds
    width, height = right - left, bottom - top
    right_margin, bottom_margin = raw_width - right, raw_height - bottom
    frame.update({
        "offsetX": (left - right_margin) / 2,
        "offsetY": (bottom_margin - top) / 2,
        "trimX": left,
        "trimY": top,
        "width": width,
        "height": height,
        "rawWidth": raw_width,
        "rawHeight": raw_height,
    })
    vertices = frame["vertices"]
    vertices["rawPosition"] = [
        -width / 2, -height / 2, 0,
        width / 2, -height / 2, 0,
        -width / 2, height / 2, 0,
        width / 2, height / 2, 0,
    ]
    vertices["uv"] = [
        left, raw_height - top,
        right, raw_height - top,
        left, raw_height - bottom,
        right, raw_height - bottom,
    ]
    vertices["nuv"] = [
        value / (raw_width if index % 2 == 0 else raw_height)
        for index, value in enumerate(vertices["uv"])
    ]
    vertices["minPos"] = [-width / 2, -height / 2, 0]
    vertices["maxPos"] = [width / 2, height / 2, 0]
    assert record["uuid"] == original_uuid
    meta.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"refreshed {asset_id}: {raw_width}x{raw_height}, trim {bounds}, UUID kept")


if __name__ == "__main__":
    for asset_id in REVISED:
        refresh(asset_id)
