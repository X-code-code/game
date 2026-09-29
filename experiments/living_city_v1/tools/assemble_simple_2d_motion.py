"""Turn the CDP capture into a compact animated WebP and review stills.

Usage: <bundled-python> tools/assemble_simple_2d_motion.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "art/review/simple_2d_trial_001/motion"
report = json.loads((OUT / "motion_capture.json").read_text(encoding="utf-8"))
samples = report["samples"]
frames = [Image.open(OUT / "frames" / sample["image"]).convert("RGB") for sample in samples]
assert all(frame.size == (444, 960) for frame in frames)

durations = [
    max(100, round((samples[index + 1]["elapsedSeconds"] - sample["elapsedSeconds"]) * 1000))
    for index, sample in enumerate(samples[:-1])
]
durations.append(durations[-1])
frames[0].save(
    OUT / "living_city_12s_444x960.webp",
    "WEBP",
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    quality=72,
    method=4,
)

# The full portrait shows game framing; this unaltered pixel crop gives a closer
# look at the service beat without changing the captured art or timing.
tea_indices = list(range(23, 43))
tea_frames = [frames[index].crop((0, 90, 270, 350)).resize((540, 520), Image.Resampling.NEAREST)
              for index in tea_indices]
tea_frames[0].save(
    OUT / "tea_exchange_crop_2x.webp", "WEBP", save_all=True,
    append_images=tea_frames[1:], duration=[durations[index] for index in tea_indices],
    loop=0, quality=75, method=4,
)

keyframes = {
    "01_approach": 15,
    "02_arrive": 26,
    "03_receive": 33,
    "04_turn_leave": 37,
    "05_leave": 45,
}
for label, index in keyframes.items():
    frames[index].save(OUT / f"{label}_444x960.png", optimize=True)

thumb_width = 296
thumb_height = 640
caption_height = 38
board = Image.new("RGB", (thumb_width * len(keyframes), thumb_height + caption_height), "#f4eee0")
draw = ImageDraw.Draw(board)
for cell, (label, index) in enumerate(keyframes.items()):
    x = cell * thumb_width
    board.paste(frames[index].resize((thumb_width, thumb_height), Image.Resampling.LANCZOS), (x, caption_height))
    draw.text((x + 8, 10), f"{label} · {samples[index]['elapsedSeconds']:.1f}s", fill="#543b2b")
board.save(OUT / "motion_keyframes_contact.png", optimize=True)

print(json.dumps({
    "webp": str(OUT / "living_city_12s_444x960.webp"),
    "frames": len(frames),
    "durationSeconds": round(sum(durations) / 1000, 2),
    "sizeBytes": (OUT / "living_city_12s_444x960.webp").stat().st_size,
    "teaCropBytes": (OUT / "tea_exchange_crop_2x.webp").stat().st_size,
    "stills": list(keyframes),
}))
