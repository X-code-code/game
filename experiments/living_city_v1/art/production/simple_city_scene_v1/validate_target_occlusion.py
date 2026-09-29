"""Measure real alpha overlap of the four independent targets and foreground slivers."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
BLUEPRINT = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))
SCALE = 8
results = []
contact = Image.new("RGB", (4 * 220, 230), "#F5E9D0")
contact_draw = ImageDraw.Draw(contact)
for index, target in enumerate(BLUEPRINT["hiddenObjectSlots"]):
    overlays = [slot for slot in BLUEPRINT["artSlots"]
                if slot["layer"] == "target_foreground" and slot.get("targetId") == target["id"]]
    assert len(overlays) == 1, (target["id"], len(overlays))
    overlay = overlays[0]
    assert overlay["center"] == target["at"], target["id"]
    w, h = target["visualWorldSize"].values()
    target_alpha = Image.open(ROOT / "assets/bundles/city_living_city_street_block_01/targets"
                              / f"{target['id']}.png").getchannel("A")
    target_alpha = target_alpha.resize((w * SCALE, h * SCALE), Image.Resampling.LANCZOS)
    fg_alpha = Image.open(HERE / "png" / f"{overlay['id']}.png").getchannel("A")
    fg_alpha = fg_alpha.resize((overlay["size"]["width"] * SCALE,
                                overlay["size"]["height"] * SCALE), Image.Resampling.NEAREST)
    px = (fg_alpha.width - target_alpha.width) // 2
    py = (fg_alpha.height - target_alpha.height) // 2
    visible = 0
    covered = 0
    for yy in range(target_alpha.height):
        for xx in range(target_alpha.width):
            if target_alpha.getpixel((xx, yy)) < 160:
                continue
            visible += 1
            if fg_alpha.getpixel((px + xx, py + yy)) >= 160:
                covered += 1
    fraction = round(covered / visible, 4)
    target_rgba = Image.open(ROOT / "assets/bundles/city_living_city_street_block_01/targets"
                             / f"{target['id']}.png").convert("RGBA")
    target_rgba = target_rgba.resize((w * SCALE, h * SCALE), Image.Resampling.LANCZOS)
    foreground_rgba = Image.open(HERE / "png" / f"{overlay['id']}.png").convert("RGBA")
    foreground_rgba = foreground_rgba.resize(fg_alpha.size, Image.Resampling.NEAREST)
    chip = Image.new("RGBA", fg_alpha.size, "#C7A078")
    chip.alpha_composite(target_rgba, (px, py))
    chip.alpha_composite(foreground_rgba)
    chip.thumbnail((200, 170), Image.Resampling.LANCZOS)
    contact.paste(chip.convert("RGB"), (index * 220 + (220 - chip.width) // 2, 27))
    contact_draw.text((index * 220 + 8, 5), target["id"], fill="#634A3B")
    contact_draw.text((index * 220 + 8, 207), f"covered {fraction:.1%}", fill="#634A3B")
    results.append({"targetId": target["id"], "foregroundArtSlotId": overlay["id"],
                    "coveredTargetOpaqueFraction": fraction, "targetOpaqueSamples": visible})
    print(f"{target['id']}: {fraction:.1%} target pixels covered")

assert all(0.14 <= result["coveredTargetOpaqueFraction"] <= 0.21 for result in results), results
contact.save(HERE / "review" / "target_foreground_contact.png", optimize=True)
report = {"method": "center-aligned target visualWorldSize alpha versus authored foreground alpha",
          "scale": SCALE, "status": "alpha_overlap_pass", "results": results}
(HERE / "occlusion_qa_report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
