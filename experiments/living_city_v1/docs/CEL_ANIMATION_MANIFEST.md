# Street-block cel animation manifest

The isolated street block loads an optional character manifest from its own Cocos Asset Bundle. For the current messenger, import `manifest.json` at `assets/bundles/city_living_city_street_block_01/cels/messenger_customer/manifest.json`. Import each real, transparent cel PNG beside it. There is deliberately no manifest or PNG at this path until the character art passes review. If the manifest or any frame is unavailable or invalid, the existing `Graphics` chicken and name label continue to render.

## Manifest schema (version 1)

```json
{
  "schemaVersion": 1,
  "actorId": "messenger_customer",
  "canvasPx": { "width": 256, "height": 256 },
  "footpointPx": { "x": 128, "y": 215 },
  "paintedHeightPx": 180,
  "clips": {
    "walk_n": [
      { "asset": "courier_walk_n_00", "durationSeconds": 0.12 },
      { "asset": "courier_walk_n_01", "durationSeconds": 0.12 }
    ],
    "walk_nw": [
      { "asset": "courier_walk_nw_00", "durationSeconds": 0.12 },
      { "asset": "courier_walk_nw_01", "durationSeconds": 0.12 }
    ],
    "walk_ne": [
      { "asset": "courier_walk_ne_00", "durationSeconds": 0.12 },
      { "asset": "courier_walk_ne_01", "durationSeconds": 0.12 }
    ],
    "turn_nw_w": [
      { "asset": "courier_turn_nw_w_00", "durationSeconds": 0.17 },
      { "asset": "courier_turn_nw_w_01", "durationSeconds": 0.17 }
    ],
    "idle_w": [
      { "asset": "courier_idle_w_00", "durationSeconds": 0.3 }
    ],
    "receive_w": [
      { "asset": "courier_receive_w_00", "durationSeconds": 0.2 },
      { "asset": "courier_receive_w_01", "durationSeconds": 0.2 }
    ],
    "turn_w_ne": [
      { "asset": "courier_turn_w_ne_00", "durationSeconds": 0.17 },
      { "asset": "courier_turn_w_ne_01", "durationSeconds": 0.17 }
    ],
    "idle_ne": [
      { "asset": "courier_turn_w_ne_01", "durationSeconds": 0.3 }
    ]
  }
}
```

This is a **schema example, not an asset inventory or approval**. It shows the minimum two-frame shape of each moving clip, not the final 36-frame production plan. The current production template has no drawn cels. Its listed frame names are planning IDs only.

- Each `asset` is a PNG basename in the manifest's directory, without `.png` or `/spriteFrame`. The loader resolves it as `cels/messenger_customer/<asset>/spriteFrame` inside the same city bundle. Names contain lowercase letters, numbers, and underscores, starting with a letter. This prevents a manifest from silently referencing old portrait sprites in another bundle or folder.
- Every exported PNG must retain the exact `canvasPx` dimensions, including transparent margins. The loader checks Cocos `SpriteFrame.originalSize` for every cel before showing any of them. Trimmed packing is acceptable because the Sprite uses `trim = false` and a fixed display size.
- `footpointPx` is one **shared registration point for every frame**, measured from the canvas top left. The renderer converts it to a Cocos anchor of `(x / width, 1 - y / height)`. The route node stays at that footpoint and is also the depth-sorting point. Artwork within each canvas must be aligned to it; the loader cannot verify the painted feet.
- `paintedHeightPx` measures the nominal painted figure from head to registered footpoint in the source PNG. The renderer scales it to `npcPlans.actorHeight` (120 world units for this messenger), so a 180 px painted figure on a 256 px canvas yields a roughly 171 world-unit full canvas. This separates canvas dimensions and transparent margins from the visible figure's gameplay size.
- North, north-west and north-east movement select distinct hand-drawn walk clips. The schema requires all three, west-facing idle/receive, both turns and a final north-east idle; left/right mirroring alone cannot carry this route. The final idle may reference the last `turn_w_ne` cel, avoiding a new image when that cel is a settled pose. A new route with southbound motion needs more directional cels and runtime selection before it can replace the diagnostic drawing.
- Each frame has its own `durationSeconds` from `0.04` to `2`. Idle clips need at least one frame; all others need at least two. Directional walk and idle loop. Turns and receive play once and hold their final frame until route/event state changes. A clip change begins at its first frame. Fit the first turn within its 0.35-second beat, receive within the 1.1-second handoff beat and the departure turn within its 0.35-second stationary beat.

The messenger's existing route determines the directional walk clip versus idle. Arrival at waypoint 4 starts the existing 1.9-second tea event: turn toward the counter, wait, receive the cup, then turn north-east while stationary before resuming the route. The renderer loads frames asynchronously, keeps the latest requested state while loading, and switches from diagnostic drawing only after **all** frames are ready. Its implementation is reusable for later NPCs by providing their actor ID, bundle-local cel folder and painted figure's world height; those NPCs remain diagnostic until they have approved animation and an explicit integration.
