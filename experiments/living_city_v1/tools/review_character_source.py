"""Inspect a generated character source at actual mobile display sizes.

This script does no repainting or alpha cleanup. It keeps the source unchanged.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGBA")
    alpha = source.getchannel("A")
    # Image generation may leave alpha=1..4 in a large invisible halo.
    # Use visible (>8) pixels for the QA framing while retaining original pixels.
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise SystemExit("empty alpha")
    crop = source.crop(bbox)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # A 4x nearest-neighbor display preserves how the 79 px sprite really reads.
    board = Image.new("RGB", (850, 530), "#efe0c4")
    draw = ImageDraw.Draw(board)
    sizes = (79, 127)
    for row, height in enumerate(sizes):
        width = round(crop.width * height / crop.height)
        small = crop.resize((width, height), Image.Resampling.LANCZOS)
        small.save(args.output_dir / f"sprite_{height}px.png")
        for column, backdrop in enumerate(("#d5c4a5", "#695e52")):
            tile = Image.new("RGBA", (400, 210), backdrop)
            tile.alpha_composite(small, ((400 - width) // 2, 46))
            board.paste(tile.convert("RGB"), (25 + column * 410, 25 + row * 255))
            label = f"{height} px on {backdrop}"
            draw.text((40 + column * 410, 35 + row * 255), label, fill="#30251d")
    board.save(args.output_dir / "display_size_contact.png")

    data = list(alpha.getdata())
    metrics = {
        "source": str(args.source),
        "canvas": list(source.size),
        "mode": source.mode,
        "visible_alpha_bbox_over_8": list(bbox),
        "alpha_zero_pixels": sum(a == 0 for a in data),
        "alpha_partial_pixels": sum(0 < a < 255 for a in data),
        "alpha_opaque_pixels": sum(a == 255 for a in data),
        "requested_display_heights": list(sizes),
        "postprocessing": "only non-destructive crop and downscale for QA; original unchanged",
    }
    (args.output_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
