import { AssetManager, Graphics, JsonAsset, Node, Sprite, SpriteFrame, UITransform, warn } from 'cc';

export type CelClipName = 'walk_n' | 'walk_nw' | 'walk_ne' | 'turn_nw_w' |
    'idle_w' | 'receive_w' | 'turn_w_ne' | 'idle_ne';

type CelFrameSpec = { asset: string; durationSeconds: number };
type CelManifest = {
    schemaVersion: 1;
    actorId: string;
    canvasPx: { width: number; height: number };
    footpointPx: { x: number; y: number };
    paintedHeightPx: number;
    clips: Record<CelClipName, CelFrameSpec[]>;
};
type LoadedCel = { frame: SpriteFrame; durationSeconds: number };
type LoadedClips = Record<CelClipName, LoadedCel[]>;

const CLIP_NAMES: CelClipName[] = [
    'walk_n', 'walk_nw', 'walk_ne', 'turn_nw_w', 'idle_w', 'receive_w', 'turn_w_ne', 'idle_ne',
];
const ONE_SHOT_CLIPS = new Set<CelClipName>(['turn_nw_w', 'receive_w', 'turn_w_ne']);
const ASSET_NAME = /^[a-z][a-z0-9_]*$/;

function positiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Reject malformed manifests before any of their PNG paths are requested. */
function parseManifest(value: unknown, actorId: string): CelManifest | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Partial<CelManifest>;
    const canvas = data.canvasPx;
    const footpoint = data.footpointPx;
    if (!canvas || !footpoint || data.schemaVersion !== 1 || data.actorId !== actorId ||
        !positiveInteger(canvas?.width) || !positiveInteger(canvas?.height) ||
        !Number.isFinite(footpoint?.x) || !Number.isFinite(footpoint?.y) ||
        typeof footpoint?.x !== 'number' || typeof footpoint?.y !== 'number' ||
        footpoint.x < 0 || footpoint.x > canvas.width ||
        footpoint.y < 0 || footpoint.y > canvas.height ||
        typeof data.paintedHeightPx !== 'number' ||
        !Number.isFinite(data.paintedHeightPx) || data.paintedHeightPx <= 0 ||
        data.paintedHeightPx > footpoint.y) return null;
    for (const name of CLIP_NAMES) {
        const frames = data.clips?.[name];
        if (!Array.isArray(frames) || frames.length < (name.startsWith('idle_') ? 1 : 2) ||
            !frames.every(frame => frame && typeof frame.asset === 'string' &&
                ASSET_NAME.test(frame.asset) && typeof frame.durationSeconds === 'number' &&
                Number.isFinite(frame.durationSeconds) &&
                frame.durationSeconds >= 0.04 && frame.durationSeconds <= 2)) return null;
    }
    return data as CelManifest;
}

/**
 * Loads fixed-canvas PNG cels from one city bundle. Nothing replaces the diagnostic
 * Graphics until the manifest and every referenced SpriteFrame have loaded.
 */
export class CelAnimationPlayer {
    private disposed = false;
    private clips: LoadedClips | null = null;
    private visual: Node | null = null;
    private sprite: Sprite | null = null;
    private manifest: CelManifest | null = null;
    private requestedClip: CelClipName = 'idle_w';
    private currentClip: CelClipName | null = null;
    private frameIndex = 0;
    private frameSeconds = 0;

    public get isReady(): boolean { return this.clips !== null; }

    public constructor(private readonly actor: Node, private readonly fallback: Graphics,
        private readonly fallbackLabel: Node, private readonly bundle: AssetManager.Bundle,
        private readonly actorId: string, private readonly folder: string,
        private readonly figureHeightWorld: number) {
        if (!Number.isFinite(figureHeightWorld) || figureHeightWorld <= 0) return;
        // Bundle metadata can answer this without a failed asset request on every
        // greybox run, before any cel art has been imported.
        if (!this.bundle.getInfoWithPath(`${folder}/manifest`, JsonAsset)) return;
        this.bundle.load(`${folder}/manifest`, JsonAsset, (error, asset) => {
            if (this.disposed || !this.actor.isValid) return;
            // An absent manifest is expected while the character is still greybox art.
            if (error || !asset) return;
            const manifest = parseManifest(asset.json, this.actorId);
            if (!manifest) {
                warn(`Cel manifest is invalid for ${this.actorId}; keeping diagnostic Graphics`);
                return;
            }
            this.loadFrames(manifest);
        });
    }

    private loadFrames(manifest: CelManifest): void {
        const assetNames = new Set<string>();
        for (const clipName of CLIP_NAMES) {
            for (const frame of manifest.clips[clipName]) assetNames.add(frame.asset);
        }
        // Creator's legacy TS target does not downlevel a Set spread reliably.
        const names = Array.from(assetNames);
        for (const name of names) {
            const path = `${this.folder}/${name}/spriteFrame`;
            if (!this.bundle.getInfoWithPath(path, SpriteFrame)) {
                warn(`Cel frame unavailable at ${path}; keeping diagnostic Graphics`);
                return;
            }
        }
        const loaded = new Map<string, SpriteFrame>();
        let pending = names.length;
        let failed = false;
        for (const name of names) {
            const path = `${this.folder}/${name}/spriteFrame`;
            this.bundle.load(path, SpriteFrame, (error, frame) => {
                if (this.disposed || !this.actor.isValid || failed) return;
                if (error || !frame || frame.originalSize.width !== manifest.canvasPx.width ||
                    frame.originalSize.height !== manifest.canvasPx.height) {
                    failed = true;
                    warn(`Cel frame unavailable or wrong canvas at ${path}; keeping diagnostic Graphics`, error);
                    return;
                }
                loaded.set(name, frame);
                pending--;
                if (pending === 0) this.activate(manifest, loaded);
            });
        }
    }

    private activate(manifest: CelManifest, loaded: Map<string, SpriteFrame>): void {
        if (this.disposed || !this.actor.isValid) return;
        const clips = {} as LoadedClips;
        for (const name of CLIP_NAMES) {
            clips[name] = manifest.clips[name].map(entry => ({
                frame: loaded.get(entry.asset)!, durationSeconds: entry.durationSeconds,
            }));
        }
        const visual = new Node(`${this.actorId}_cels`);
        this.actor.addChild(visual);
        const transform = visual.addComponent(UITransform);
        const worldScale = this.figureHeightWorld / manifest.paintedHeightPx;
        transform.setContentSize(manifest.canvasPx.width * worldScale,
            manifest.canvasPx.height * worldScale);
        // Cocos anchors use bottom-left origin; export footpoints use top-left origin.
        // The actor node is the world footpoint used by the depth sorter and route.
        transform.setAnchorPoint(manifest.footpointPx.x / manifest.canvasPx.width,
            1 - manifest.footpointPx.y / manifest.canvasPx.height);
        const sprite = visual.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        this.manifest = manifest;
        this.clips = clips;
        this.visual = visual;
        this.sprite = sprite;
        this.fallback.enabled = false;
        this.fallbackLabel.active = false;
        this.showRequestedClip();
    }

    /** Route and event state can change while assets are still loading. */
    public setState(clip: CelClipName): void {
        this.requestedClip = clip;
        if (this.clips) this.showRequestedClip();
    }

    private showRequestedClip(): void {
        if (!this.clips || !this.sprite) return;
        if (this.currentClip !== this.requestedClip) {
            this.currentClip = this.requestedClip;
            this.frameIndex = 0;
            this.frameSeconds = 0;
            this.sprite.spriteFrame = this.clips[this.currentClip][0].frame;
        }
    }

    public update(dt: number): void {
        if (!this.clips || !this.sprite || !this.currentClip || dt <= 0) return;
        const frames = this.clips[this.currentClip];
        this.frameSeconds += Math.min(dt, 0.25);
        // Turns and the receive beat play once, then hold until route/event state changes.
        while (this.frameSeconds >= frames[this.frameIndex].durationSeconds) {
            this.frameSeconds -= frames[this.frameIndex].durationSeconds;
            if (ONE_SHOT_CLIPS.has(this.currentClip) && this.frameIndex === frames.length - 1) {
                this.frameSeconds = 0;
                break;
            }
            this.frameIndex = (this.frameIndex + 1) % frames.length;
            this.sprite.spriteFrame = frames[this.frameIndex].frame;
        }
    }

    public dispose(): void {
        this.disposed = true;
        this.clips = null;
        this.manifest = null;
        this.sprite = null;
        this.visual = null;
    }
}
