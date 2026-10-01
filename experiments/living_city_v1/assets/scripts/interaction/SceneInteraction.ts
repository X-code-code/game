import { AssetManager, Node, Sprite, SpriteFrame, tween, UITransform, Vec3, warn } from 'cc';
import type { InteractiveObjectConfig, Size } from '../config/CityTypes';
import type { TapTarget, TargetClicked } from '../gameplay/TargetInput';
import { containsClickArea, hiddenObjectMapPosition } from '../hidden_object/HiddenObjectState';
import type { SceneDepthLayer } from '../map/SceneDepthLayer';

/** A one-way reveal, with independently authored closed and opened layers. */
export class SceneInteraction implements TapTarget {
    public readonly node: Node;
    private readonly sprite: Sprite;
    private currentState: string;
    private request = 0;

    public constructor(public readonly config: InteractiveObjectConfig, size: Size,
        private readonly bundle: AssetManager.Bundle, depth: SceneDepthLayer, restored?: string) {
        this.currentState = restored === this.openState ? restored : config.initialState;
        this.node = new Node(config.id);
        const position = hiddenObjectMapPosition(config, size);
        this.node.setPosition(position.x, position.y);
        this.node.setScale(config.scale, config.scale, 1);
        this.node.setRotationFromEuler(0, 0, config.rotation);
        const visualSize = config.visualSize ?? { width: 100, height: 100 };
        this.node.addComponent(UITransform).setContentSize(visualSize.width, visualSize.height);
        this.sprite = this.node.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.sprite.trim = false;
        depth.addActor(this.node, () => config.depthY ?? position.y, true);
        this.loadAppearance();
    }

    public get state(): string { return this.currentState; }
    private get openState(): string {
        return this.config.actions.find(action => action.objectId === this.config.id)?.state ?? 'opened';
    }
    public get available(): boolean {
        return this.node.isValid && this.node.activeInHierarchy && this.currentState !== this.openState;
    }
    public hitTest(x: number, y: number): boolean {
        if (!this.available) return false;
        const point = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(x, y, 0));
        return containsClickArea(this.config.clickArea, point.x, point.y);
    }
    public activate(x: number, y: number): TargetClicked | null {
        if (!this.hitTest(x, y)) return null;
        this.setState(this.openState);
        tween(this.node).to(0.12, { scale: new Vec3(this.config.scale * 1.04, this.config.scale * 1.04, 1) })
            .to(0.15, { scale: new Vec3(this.config.scale, this.config.scale, 1) }).start();
        return { type: 'scene', id: this.config.id, tags: ['interactiveObject'] };
    }
    public setState(state: string): void {
        this.currentState = state;
        this.loadAppearance();
    }
    private loadAppearance(): void {
        const request = ++this.request;
        const asset = this.currentState === this.openState ? this.config.openAsset : this.config.asset;
        if (!asset) return;
        this.bundle.load(`${asset}/spriteFrame`, SpriteFrame, (error, frame) => {
            if (!this.node.isValid || request !== this.request) return;
            if (error || !frame) { warn(`Interaction art unavailable: ${asset}`, error); return; }
            this.sprite.spriteFrame = frame;
        });
    }
}
