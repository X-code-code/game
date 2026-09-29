"""Seed Cocos 3.8.8 image metadata for newly authored scene layers.

Existing metadata is never replaced: Cocos keeps UUIDs stable after import.
The local project build remains the authoritative check for these records.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from uuid import uuid4

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BUNDLE = ROOT / "assets/bundles/city_living_city_street_block_01/simple2d_scene"
BLUEPRINT = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))
SLOTS = {slot["id"]: slot for slot in BLUEPRINT["artSlots"]}
TEMPLATE = json.loads((BUNDLE / "lc_north_herb_stand.png.meta").read_text(encoding="utf-8"))
NEW_IDS = (
    "lc_south_post_house_back",
    "lc_south_grain_house_back",
    "lc_east_pottery_annex_back",
)


def write_meta(asset_id: str) -> None:
    png = BUNDLE / f"{asset_id}.png"
    destination = png.with_suffix(".png.meta")
    if destination.exists():
        print(f"kept existing {destination.name}")
        return

    slot = SLOTS[asset_id]
    with Image.open(png) as image:
        assert image.size == (slot["size"]["width"], slot["size"]["height"])
        alpha_bounds = image.convert("RGBA").getchannel("A").getbbox()
        assert alpha_bounds is not None
        raw_width, raw_height = image.size
    left, top, right, bottom = alpha_bounds
    width, height = right - left, bottom - top
    right_margin, bottom_margin = raw_width - right, raw_height - bottom
    uuid = str(uuid4())

    record = copy.deepcopy(TEMPLATE)
    record["uuid"] = uuid
    record["subMetas"]["6c48a"]["uuid"] = f"{uuid}@6c48a"
    record["subMetas"]["6c48a"]["displayName"] = asset_id
    record["subMetas"]["6c48a"]["userData"]["imageUuidOrDatabaseUri"] = uuid
    frame = record["subMetas"]["f9941"]
    frame["uuid"] = f"{uuid}@f9941"
    frame["displayName"] = asset_id
    frame_data = frame["userData"]
    frame_data.update({
        "offsetX": (left - right_margin) / 2,
        "offsetY": (bottom_margin - top) / 2,
        "trimX": left,
        "trimY": top,
        "width": width,
        "height": height,
        "rawWidth": raw_width,
        "rawHeight": raw_height,
        "imageUuidOrDatabaseUri": f"{uuid}@6c48a",
    })
    vertices = frame_data["vertices"]
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
        vertices["uv"][i] / (raw_width if i % 2 == 0 else raw_height)
        for i in range(8)
    ]
    vertices["minPos"] = [-width / 2, -height / 2, 0]
    vertices["maxPos"] = [width / 2, height / 2, 0]
    record["userData"]["redirect"] = f"{uuid}@6c48a"
    destination.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {destination.name} ({raw_width}x{raw_height}, trim {alpha_bounds})")


if __name__ == "__main__":
    for asset_id in NEW_IDS:
        write_meta(asset_id)
