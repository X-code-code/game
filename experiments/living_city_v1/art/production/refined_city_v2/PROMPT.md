# lc_refined_street_direction_v2

Status: generated concept reference only; not approved runtime art.
Tool: built-in image_gen.
Reference: art/review/collection_flight_smoke_02/initial_444x960.png (existing playable screenshot; layout/style reference, not approved source art).
Generation specification: portrait 3:4 concept illustration, opaque background. Actual result: 1086×1448 RGB, recorded in `generation_record.json`; preserved as `lc_refined_street_direction_v2_source.png`.
Final game specification: none for this concept. Runtime art is exported from editable layered drawing sources with blueprint-sized canvases.

Processing: the generated concept is retained unchanged. Runtime layers are separately authored in `render_refined.py`, which extends the retained v1 drawing sources; they are not image crops from this concept. `production_manifest.json` records every runtime asset ID, dimensions, source and export process. `qa_report.json` records mechanical checks; game acceptance is recorded in `art/review/refined_city_v2/runtime_report.json`.

## Exact prompt

Use case: stylized-concept
Asset ID: lc_refined_street_direction_v2
Asset type: art direction reference for an original 2D chicken-town hidden-object mobile game; concept reference only, not a flattened runtime background.
Input image 1 is the current playable game's layout/style reference. Keep its near-top-down parallel projection, warm cream/ochre/terracotta/sage/slate palette, short cute bird characters, and continuous vertical street with a crossing lane. Do not reproduce the bottom game HUD.
Primary request: show how this same town can look substantially more crafted and detailed while remaining a clear, drawable 2D game. Portrait 3:4 composition, dense charming small-town shop frontages on both sides, varied shallow tiled roofs, exposed timber joinery, subtle plaster patina, woodgrain shelving, striped scalloped canvas awnings, warm window displays, ceramic patterns, flower pots and ivy, baskets, a cloth tailor's workbench, tea service, a chestnut cart, bun steamer, little post office and grain shop. Cluster useful objects around their users with clear supports. A few small cream-colored chicken residents doing different jobs. Preserve clear walkways and distinct searchable objects. Show a little parcel chest, a folded stall cover and a leafy flower box that suggest opening, lifting and parting interactions. Small lost objects include a pocket watch, sewing scissors, blue feather, envelope, honey dipper, seed packet, apple and a brass key.
Style: polished original hand-drawn 2D game illustration using controlled shape-based forms, varied fine warm-brown outlines, careful overlaps, 3 restrained shade steps, fine localized material markings, soft left-upper light and warm contact shadows. More meticulous than the supplied rough screenshot, not a 3D render, not photoreal, not watercolor wash. Maintain easy-to-read silhouettes at phone scale; avoid thick uniform icon outlines, clip-art shapes and visual noise. No words, UI, watermarks, recognizable IP, horizon or perspective vanishing point. Entire scene visible with modest edge margins. This reference will be redrawn into editable layered sources; do not imply it is already an approved asset.
