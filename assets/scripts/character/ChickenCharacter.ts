import { _decorator, Color, Component, Graphics, Label, Node, Sprite, SpriteFrame, tween, Tween, UITransform, Vec3, warn } from 'cc';
import type { ChickenBehaviorSpec, ChickenBehaviorType, ChickenConfig, Size } from '../config/CityTypes';
import { ChickenBehaviorController, ChickenPose } from '../behavior/ChickenBehaviorController';
import type { TargetClicked } from '../gameplay/TargetInput';
import { ChickenCharacterState, chickenMapPosition } from './ChickenCharacterState';

const { ccclass } = _decorator;

interface BehaviorFrames {
    frames: readonly SpriteFrame[];
    frameDurationSeconds: number;
}

/** One visible chicken: placement, pose display, hit shape and tap feedback. */
@ccclass('ChickenCharacter')
export class ChickenCharacter extends Component {
    private state: ChickenCharacterState | null = null;
    private visualRoot: Node | null = null;
    private bodyRoot: Node | null = null;
    private headRoot: Node | null = null;
    private eyeOpen: Node | null = null;
    private eyeClosed: Node | null = null;
    private zzzNode: Node | null = null;
    private behavior: ChickenBehaviorController | null = null;
    private baseY = 0;
    private tapBadge: Node | null = null;
    private baseSkinFrame: SpriteFrame | null = null;
    private actionSkinFrame: SpriteFrame | null = null;
    private displayedSkinFrame: SpriteFrame | null = null;
    private animationSeconds = 0;
    private behaviorAnimationSeconds = 0;
    private behaviorFrames: Partial<Record<ChickenBehaviorType, BehaviorFrames>> = {};
    private directedMotion: { x: number; y: number; facing: 'left' | 'right'; moving: boolean } | null = null;

    public configure(config: ChickenConfig, mapSize: Size, skinFrame?: SpriteFrame): void {
        this.state = new ChickenCharacterState(config);
        this.node.name = config.id;
        const position = chickenMapPosition(config, mapSize);
        this.baseY = position.y;
        this.node.setPosition(position.x, position.y, 0);
        this.node.setScale(config.scale, config.scale, 1);

        const area = config.clickArea;
        const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        transform.setContentSize(area.shape === 'circle' ? area.radius * 2 : area.width,
            area.shape === 'circle' ? area.radius * 2 : area.height);

        const appearance = this.visualRoot ?? new Node('VisualRoot');
        if (!this.visualRoot) this.node.addChild(appearance);
        appearance.getComponent(UITransform) ?? appearance.addComponent(UITransform);
        appearance.setScale(config.facing === 'left' ? -1 : 1, 1, 1);
        if (skinFrame) {
            (appearance.getComponent(Sprite) ?? appearance.addComponent(Sprite)).spriteFrame = skinFrame;
        }
        this.visualRoot = appearance;
        this.bodyRoot = this.ensureRigPart(appearance, 'Body', 0, -12, 140, 140);
        this.headRoot = this.ensureRigPart(appearance, 'Head', 17, 18, 120, 120);
        this.eyeOpen = this.ensureRigPart(this.headRoot, 'EyeOpen', 11, 6, 30, 30);
        this.eyeClosed = this.ensureRigPart(this.headRoot, 'EyeClosed', 11, 6, 30, 30);
        this.zzzNode = this.ensureRigPart(this.node, 'Zzz', 42, 90, 100, 40);
        if (!this.zzzNode.getComponent(Label)) {
            const zzz = this.zzzNode.addComponent(Label);
            zzz.string = 'Zzz';
            zzz.fontSize = 27;
            zzz.lineHeight = 33;
            zzz.color = new Color(71, 96, 135, 255);
        }
        this.behavior = new ChickenBehaviorController(config, mapSize.width, position.x, config.facing);
        this.animationSeconds = (config.id.length * 0.73) % 3;
        this.behaviorAnimationSeconds = 0;
        this.behaviorFrames = {};
        this.directedMotion = null;
        this.applyPose(this.behavior.pose());
        this.node.active = this.state.isVisible;
    }

    /** The visual root can hold a skin, accessories and carried item without mirroring the hit shape. */
    public get appearanceNode(): Node | null { return this.visualRoot; }
    /** Keep the prototype paint responsive to the same behavior pose as the drawn rig. */
    public applyPrototypeSkin(frame: SpriteFrame, visualSize?: Size): void {
        const appearance = this.visualRoot;
        if (!appearance?.isValid) return;
        const width = visualSize?.width ?? 210;
        const height = visualSize?.height ?? 210;
        appearance.getComponent(UITransform)?.setContentSize(width, height);
        const sprite = appearance.getComponent(Sprite) ?? appearance.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;
        this.baseSkinFrame = frame;
        this.displayedSkinFrame = frame;
        this.drawFootShadow(width, height);
        if (this.bodyRoot) this.bodyRoot.active = false;
        if (this.headRoot) this.headRoot.active = false;
        // The cast v2 art includes its own eyes, wings and clothes. The old
        // painted overlays would cover the authored blink and action frames.
        const oldWing = appearance.getChildByName('WingFlutter');
        if (oldWing) oldWing.active = false;
        const oldEyelid = appearance.getChildByName('BlinkPaint');
        if (oldEyelid) oldEyelid.active = false;
        if (this.behavior) this.applyPose(this.behavior.pose());
    }

    private drawFootShadow(width: number, height: number): void {
        const shadow = this.node.getChildByName('FootShadow') ?? new Node('FootShadow');
        if (!shadow.parent) this.node.insertChild(shadow, 0);
        // Authored frames share a 384 px canvas with the soles at pixel 372.
        // Keep the shadow on the ground while the body bobs and changes frames.
        shadow.setPosition(0, -height * (0.5 - 12 / 384), 0);
        shadow.setScale(1, 0.25, 1);
        const graphic = shadow.getComponent(Graphics) ?? shadow.addComponent(Graphics);
        graphic.clear();
        const radius = Math.min(width * 0.25, 44);
        graphic.fillColor = new Color(72, 61, 48, 10);
        graphic.circle(0, 0, radius * 1.3);
        graphic.fill();
        graphic.fillColor = new Color(72, 61, 48, 15);
        graphic.circle(0, 0, radius);
        graphic.fill();
        graphic.fillColor = new Color(72, 61, 48, 20);
        graphic.circle(0, 0, radius * 0.7);
        graphic.fill();
    }

    /** Action art uses the same 210-square canvas and grounded feet as the base skin. */
    public applyPrototypeActionFrame(frame: SpriteFrame): void {
        this.actionSkinFrame = frame;
        if (this.behavior) this.applyPose(this.behavior.pose());
    }

    /** Install authored frames for a behavior after the scene resolves its asset paths. */
    public applyBehaviorFrames(behaviorType: ChickenBehaviorType, frames: readonly SpriteFrame[],
        frameDurationSeconds = 0.18): void {
        if (frames.length < 2 || frames.some(frame => !frame) || new Set(frames).size < 2
            || !Number.isFinite(frameDurationSeconds) || frameDurationSeconds <= 0) {
            warn(`Chicken ${this.node.name}: ${behaviorType} animation needs two distinct frames and a positive frame duration`);
            return;
        }
        this.behaviorFrames[behaviorType] = { frames: [...frames], frameDurationSeconds };
        if (this.behavior) this.applyPose(this.behavior.pose());
    }
    public applyPrototypeAccessory(id: string, frame: SpriteFrame): void {
        const appearance = this.visualRoot;
        if (!appearance?.isValid || !appearance.getComponent(Sprite)?.spriteFrame) return;
        const layout: Record<string, { x: number; y: number; size: number }> = {
            demo_straw_hat: { x: 13, y: 67, size: 105 },
            demo_red_scarf: { x: 10, y: -10, size: 101 },
            demo_egg: { x: -43, y: -14, size: 36 },
        };
        const placement = layout[id];
        if (!placement) return;
        const visual = appearance.getChildByName(id) ?? new Node(id);
        if (!visual.parent) appearance.addChild(visual);
        visual.setPosition(placement.x, placement.y, 0);
        const transform = visual.getComponent(UITransform) ?? visual.addComponent(UITransform);
        transform.setContentSize(placement.size, placement.size);
        const sprite = visual.getComponent(Sprite) ?? visual.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;
    }
    public get behaviorType(): ChickenBehaviorType | null { return this.behavior?.behaviorType ?? null; }
    public get hintAvailable(): boolean {
        return this.node.isValid && this.node.activeInHierarchy && !!this.state?.config.targetable;
    }

    /** The scene may change behavior without rebuilding the character or its hit target. */
    public setBehavior(spec: ChickenBehaviorSpec): void {
        this.behaviorAnimationSeconds = 0;
        if (this.behavior) this.applyPose(this.behavior.setBehavior(spec));
    }

    /** Let a scene event direct the feet without fighting the default patrol controller. */
    public setDirectedMotion(x: number, y: number, facing: 'left' | 'right', moving: boolean): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.directedMotion = { x, y, facing, moving };
        if (this.behavior) this.applyPose(this.behavior.pose());
    }

    public clearDirectedMotion(): void {
        this.directedMotion = null;
        if (this.behavior) this.applyPose(this.behavior.pose());
    }

    public setVisible(visible: boolean): void {
        this.state?.setVisible(visible);
        this.node.active = visible;
    }

    public hitTest(uiX: number, uiY: number): boolean {
        const state = this.state;
        const transform = this.node.getComponent(UITransform);
        if (!state || !transform || !this.node.activeInHierarchy) return false;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        return state.hitTest(local.x, local.y);
    }

    public activate(uiX: number, uiY: number): TargetClicked | null {
        const state = this.state;
        const transform = this.node.getComponent(UITransform);
        if (!state || !transform || !this.node.activeInHierarchy) return null;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const hit = state.click(local.x, local.y);
        if (!hit) return null;
        const report: TargetClicked = { type: 'chicken', ...hit };
        this.node.emit('targetClicked', report);
        this.showTapFeedback();
        return report;
    }

    protected update(deltaTime: number): void {
        if (Number.isFinite(deltaTime) && deltaTime > 0) {
            const step = Math.min(deltaTime, 0.1);
            this.animationSeconds += step;
            this.behaviorAnimationSeconds += step;
        }
        if (this.behavior) this.applyPose(this.behavior.tick(deltaTime));
    }

    protected onDestroy(): void {
        if (this.tapBadge) Tween.stopAllByTarget(this.tapBadge);
    }

    private ensureRigPart(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        let part = parent.getChildByName(name);
        if (!part) {
            part = new Node(name);
            parent.addChild(part);
        }
        part.setPosition(x, y, 0);
        const transform = part.getComponent(UITransform) ?? part.addComponent(UITransform);
        transform.setContentSize(width, height);
        return part;
    }

    private applyPose(pose: ChickenPose): void {
        const directed = this.directedMotion;
        if (directed) pose = { ...pose, x: directed.x, facing: directed.facing, moving: directed.moving };
        this.node.setPosition(pose.x, directed?.y ?? this.baseY, 0);
        const prototype = this.baseSkinFrame !== null;
        const skin = this.state?.config.skin;
        const authored = this.behaviorFrames[pose.behaviorType];
        const showAction = !authored && !!this.actionSkinFrame && (
            (skin === 'demo_yellow' && pose.behaviorType === 'idle' && pose.eyesClosed)
            || (skin === 'demo_blue' && pose.behaviorType === 'walk' && pose.moving
                && Math.sin(this.animationSeconds * Math.PI * 4.4) > 0)
            || (skin === 'demo_pink' && pose.behaviorType === 'peck' && pose.headY < -9)
        );
        let nextFrame = showAction ? this.actionSkinFrame : this.baseSkinFrame;
        if (authored) {
            const frames = authored.frames;
            let index: number;
            if (pose.behaviorType === 'peck') {
                // Follow the behavior controller's actual dip, including its pause.
                const dip = Math.max(0, Math.min(1, -pose.headY / 24));
                index = Math.round(dip * (frames.length - 1));
            } else if (pose.behaviorType === 'walk' && !pose.moving) {
                index = 0;
            } else {
                index = Math.floor(this.behaviorAnimationSeconds / authored.frameDurationSeconds) % frames.length;
            }
            nextFrame = frames[index];
        }
        if (prototype && nextFrame && nextFrame !== this.displayedSkinFrame) {
            const sprite = this.visualRoot?.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = nextFrame;
            this.displayedSkinFrame = nextFrame;
        }
        let x = 0;
        let y = pose.visualY;
        let angle = 0;
        let stretchX = 1;
        let stretchY = pose.visualScaleY;
        if (prototype) {
            const t = this.animationSeconds;
            switch (pose.behaviorType) {
            case 'idle': {
                const breath = Math.sin(t * 2.5);
                x = Math.sin(t * 1.25) * 0.5;
                angle = Math.sin(t * 1.7) * 0.7;
                stretchX = 1 + breath * 0.006;
                stretchY = 1 - breath * 0.009;
                break;
            }
            case 'walk': {
                if (pose.moving) {
                    const step = Math.sin(t * Math.PI * 4.4);
                    angle = step * 1.3;
                    stretchX = 1 + Math.abs(step) * 0.007;
                    stretchY = 1 - Math.abs(step) * 0.011;
                } else {
                    stretchY = 1 + Math.sin(t * 2.1) * 0.006;
                }
                break;
            }
            case 'peck': {
                const dip = Math.max(0, -pose.headY / 24);
                angle = -2.2 * dip;
                x = dip * 1.5;
                y -= dip * 2.5;
                stretchX = 1 + dip * 0.008;
                stretchY = 1 - dip * 0.01;
                break;
            }
            case 'sleep':
                angle = Math.sin(t * 1.2) * 0.4;
                stretchX = 1 + Math.sin(t * 3.4) * 0.008;
                break;
            }
        }
        this.visualRoot?.setPosition(x, y, 0);
        this.visualRoot?.setScale((pose.facing === 'left' ? -1 : 1) * stretchX, stretchY, 1);
        this.visualRoot?.setRotationFromEuler(0, 0, angle);
        this.bodyRoot?.setPosition(0, -12, 0);
        this.headRoot?.setPosition(17, 18 + pose.headY, 0);
        this.headRoot?.setRotationFromEuler(0, 0, pose.headAngle);
        if (this.eyeOpen) this.eyeOpen.active = !pose.eyesClosed;
        if (this.eyeClosed) this.eyeClosed.active = pose.eyesClosed;
        if (this.zzzNode) {
            this.zzzNode.active = pose.showZzz;
            if (pose.showZzz) this.zzzNode.setPosition(42, 90 + Math.sin(this.animationSeconds * 2) * 5, 0);
        }
    }

    private showTapFeedback(): void {
        if (!this.tapBadge) {
            const badge = new Node('TapFeedback');
            this.node.addChild(badge);
            badge.setPosition(0, 82, 0);
            badge.addComponent(UITransform).setContentSize(60, 60);
            const label = badge.addComponent(Label);
            label.string = '♥';
            label.fontSize = 40;
            label.lineHeight = 46;
            label.color = new Color(228, 72, 97, 255);
            this.tapBadge = badge;
        }
        const badge = this.tapBadge;
        Tween.stopAllByTarget(badge);
        badge.active = true;
        badge.setScale(0.6, 0.6, 1);
        tween(badge).to(0.14, { scale: new Vec3(1.2, 1.2, 1) })
            .to(0.25, { scale: new Vec3(0.85, 0.85, 1) })
            .call(() => { badge.active = false; }).start();
    }
}
