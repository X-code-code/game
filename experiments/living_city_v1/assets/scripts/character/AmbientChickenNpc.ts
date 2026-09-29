import { _decorator, Color, Component, Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { AmbientChickenRoute, AmbientNpcRouteSpec, AmbientNpcPose } from './AmbientChickenRoute';

const { ccclass } = _decorator;

/** Optional pose art; one base frame is enough for a low-cost background extra. */
export interface AmbientNpcFrames {
    idle: SpriteFrame;
    walk?: SpriteFrame;
    chat?: SpriteFrame;
    gesture?: SpriteFrame;
}

export interface AmbientChickenNpcSpec extends AmbientNpcRouteSpec {
    /** Sprite square in world units. Depth is staged by scaling the whole node. */
    spriteSize?: number;
    scale?: number;
}

/** A non-interactive map child. Its position inherits map drag and zoom. */
@ccclass('AmbientChickenNpc')
export class AmbientChickenNpc extends Component {
    private motion: AmbientChickenRoute | null = null;
    private appearance: Node | null = null;
    private shadow: Node | null = null;
    private sprite: Sprite | null = null;
    private frames: AmbientNpcFrames | null = null;
    private displayedFrame: SpriteFrame | null = null;
    private size = 150;
    private scale = 1;

    public configure(spec: AmbientChickenNpcSpec, frames?: AmbientNpcFrames): void {
        if (spec.spriteSize !== undefined && (!Number.isFinite(spec.spriteSize) || spec.spriteSize <= 0)) {
            throw new Error(`Invalid sprite size for ${spec.id}`);
        }
        if (spec.scale !== undefined && (!Number.isFinite(spec.scale) || spec.scale <= 0)) {
            throw new Error(`Invalid scale for ${spec.id}`);
        }
        this.motion = new AmbientChickenRoute(spec);
        this.node.name = spec.id;
        this.size = spec.spriteSize ?? 150;
        this.scale = spec.scale ?? 1;
        const shadow = this.shadow ?? new Node('FootShadow');
        if (!this.shadow) this.node.addChild(shadow);
        this.shadow = shadow;
        shadow.setSiblingIndex(0);
        shadow.setPosition(0, -this.size * .367 + 2, 0);
        shadow.setScale(1, .24, 1);
        const shadowGraphic = shadow.getComponent(Graphics) ?? shadow.addComponent(Graphics);
        shadowGraphic.clear();
        shadowGraphic.fillColor = new Color(72, 64, 62, 51);
        shadowGraphic.circle(0, 0, this.size * .18);
        shadowGraphic.fill();
        const appearance = this.appearance ?? new Node('NpcArt');
        if (!this.appearance) this.node.addChild(appearance);
        this.appearance = appearance;
        const transform = appearance.getComponent(UITransform) ?? appearance.addComponent(UITransform);
        transform.setContentSize(this.size, this.size);
        this.sprite = appearance.getComponent(Sprite) ?? appearance.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.sprite.trim = false;
        if (frames) this.setFrames(frames);
        this.drawPose(this.motion.pose);
    }

    /** May be called after asynchronous resources.load; frames remain owned by the resource manager. */
    public setFrames(frames: AmbientNpcFrames): void {
        this.frames = frames;
        this.displayedFrame = null;
        if (this.motion) this.drawPose(this.motion.pose);
    }

    public get currentPose(): AmbientNpcPose | null { return this.motion?.pose ?? null; }

    /** Map-local foot contact line; ignores bobbing of the art above the shadow. */
    public get footY(): number {
        return this.node.position.y - this.size * ((222 - 128) / 256) * Math.abs(this.node.scale.y);
    }

    protected update(deltaTime: number): void {
        if (!this.motion || !Number.isFinite(deltaTime) || deltaTime <= 0) return;
        this.drawPose(this.motion.tick(Math.min(deltaTime, 0.1)));
    }

    protected onDestroy(): void {
        this.motion = null;
        this.frames = null;
        this.displayedFrame = null;
        this.sprite = null;
        this.appearance = null;
        this.shadow = null;
    }

    private drawPose(pose: AmbientNpcPose): void {
        this.node.setPosition(pose.x, pose.y, 0);
        this.node.setScale(this.scale, this.scale, 1);
        const appearance = this.appearance;
        if (!appearance) return;
        const t = pose.animationSeconds;
        let angle = 0;
        let lift = 0;
        let stretch = 1;
        let gesture = false;
        if (pose.moving) {
            const step = Math.sin(t * 11.5);
            lift = Math.abs(step) * 2.6;
            angle = step * 2.1;
            stretch = 1 - Math.abs(step) * 0.018;
        } else {
            switch (pose.activity) {
            case 'browse': {
                const lean = Math.sin(t * 2.7);
                angle = lean * 2.0;
                lift = -Math.max(0, lean) * 1.8;
                break;
            }
            case 'look':
                angle = Math.sin(t * 1.3) * 2.4;
                lift = Math.sin(t * 2.0) * 0.7;
                break;
            case 'chat': {
                const syllable = Math.sin(t * 7.0);
                lift = Math.max(0, syllable) * 1.3;
                angle = Math.sin(t * 3.3) * 1.8;
                gesture = syllable > 0.6 && Math.sin(t * 1.1) > 0.05;
                break;
            }
            case 'gesture': {
                const pulse = Math.sin(pose.segmentProgress * Math.PI * 4);
                angle = pulse * 3.7;
                lift = Math.max(0, pulse) * 1.7;
                gesture = pulse > 0.15;
                break;
            }
            default:
                lift = Math.sin(t * 2.1) * 0.7;
                stretch = 1 + Math.sin(t * 2.1) * 0.006;
            }
        }
        appearance.setPosition(0, lift, 0);
        appearance.setScale(pose.facing === 'left' ? -1 : 1, stretch, 1);
        appearance.setRotationFromEuler(0, 0, angle);
        const frames = this.frames;
        const frame = frames && (pose.moving && Math.sin(t * 11.5) > 0.1 ? frames.walk
            : gesture ? frames.gesture
                : pose.activity === 'chat' ? frames.chat : null) || frames?.idle;
        if (frame && frame !== this.displayedFrame && this.sprite) {
            this.sprite.spriteFrame = frame;
            this.displayedFrame = frame;
        }
    }
}
