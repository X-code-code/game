import { AssetManager, Node, Rect, Size as PixelSize, Sprite, SpriteFrame, tween, UITransform, Vec3, warn } from 'cc';
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
    private foreground: Node | null = null;
    private foregroundSprite: Sprite | null = null;
    private foregroundFrame: SpriteFrame | null = null;

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
        if (config.openForegroundStart !== undefined) {
            const foreground = new Node(`${config.id}_front_rim`);
            foreground.active = false;
            foreground.setScale(config.scale, config.scale, 1);
            foreground.setRotationFromEuler(0, 0, config.rotation);
            foreground.addComponent(UITransform);
            this.foregroundSprite = foreground.addComponent(Sprite);
            this.foregroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.foregroundSprite.trim = false;
            depth.addActor(foreground, () => (config.depthY ?? position.y) - 1, true);
            this.foreground = foreground;
            this.node.once(Node.EventType.NODE_DESTROYED, () => {
                this.foregroundFrame?.destroy();
                if (foreground.isValid) foreground.destroy();
            });
        }
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
        if (!this.foreground) tween(this.node).to(0.12, { scale: new Vec3(this.config.scale * 1.04, this.config.scale * 1.04, 1) })
            .to(0.15, { scale: new Vec3(this.config.scale, this.config.scale, 1) }).start();
        return { type: 'scene', id: this.config.id, tags: ['interactiveObject'] };
    }
    public setState(state: string): void {
        this.currentState = state;
        this.loadAppearance();
    }
    private loadAppearance(): void {
        const request = ++this.request;
        if (this.foreground) this.foreground.active = false;
        const asset = this.currentState === this.openState ? this.config.openAsset : this.config.asset;
        if (!asset) return;
        this.bundle.load(`${asset}/spriteFrame`, SpriteFrame, (error, frame) => {
            if (!this.node.isValid || request !== this.request) return;
            if (error || !frame) { warn(`Interaction art unavailable: ${asset}`, error); return; }
            this.sprite.spriteFrame = frame;
            if (this.currentState === this.openState) this.showForeground(frame);
        });
    }

    private showForeground(frame: SpriteFrame): void {
        if (!this.foreground?.isValid || !this.foregroundSprite || this.config.openForegroundStart === undefined) return;
        // Reuse a rectangular region of the actual generated PNG. No drawn mask,
        // new pixels, tint or replacement texture; only normal SpriteFrame loading.
        const rect = frame.rect;
        const start = Math.round(rect.height * this.config.openForegroundStart);
        const height = rect.height - start;
        const cropped = new SpriteFrame();
        cropped.reset({texture:frame.texture,rect:new Rect(rect.x,rect.y+start,rect.width,height),
            originalSize:new PixelSize(rect.width,height)});
        const visual = this.config.visualSize ?? {width:100,height:100};
        const offset = -visual.height * start / rect.height / 2 * this.config.scale;
        const angle = this.config.rotation * Math.PI / 180;
        this.foreground.setPosition(this.node.position.x - Math.sin(angle) * offset,
            this.node.position.y + Math.cos(angle) * offset);
        this.foreground.getComponent(UITransform)!.setContentSize(visual.width,visual.height*height/rect.height);
        const previous = this.foregroundFrame;
        this.foregroundFrame = cropped;
        this.foregroundSprite.spriteFrame = cropped;
        previous?.destroy();
        this.foreground.active = true;
    }
}
