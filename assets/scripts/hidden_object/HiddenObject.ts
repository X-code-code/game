import { _decorator, Color, Component, Label, Node, Sprite, SpriteFrame, tween, UITransform, Vec3 } from 'cc';
import type { HiddenObjectConfig, Size } from '../config/CityTypes';
import type { TargetClicked } from '../gameplay/TargetInput';
import { HiddenObjectHit, HiddenObjectState, hiddenObjectMapPosition } from './HiddenObjectState';

const { ccclass } = _decorator;

/** An independent city prop: owns its hit shape and discovery feedback, not tasks. */
@ccclass('HiddenObject')
export class HiddenObject extends Component {
    private state: HiddenObjectState | null = null;

    public configure(config: HiddenObjectConfig, mapSize: Size, spriteFrame?: SpriteFrame): void {
        this.state = new HiddenObjectState(config);
        this.node.name = config.id;
        const position = hiddenObjectMapPosition(config, mapSize);
        this.node.setPosition(position.x, position.y, 0);
        this.node.setScale(config.scale, config.scale, 1);
        this.node.setRotationFromEuler(0, 0, config.rotation);
        const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        const area = config.clickArea;
        const diameter = area.shape === 'circle' ? area.radius * 2 : area.width;
        const height = area.shape === 'circle' ? area.radius * 2 : area.height;
        transform.setContentSize(diameter, height);
        if (spriteFrame) {
            (this.node.getComponent(Sprite) ?? this.node.addComponent(Sprite)).spriteFrame = spriteFrame;
        }
        this.node.active = this.state.isVisible;
    }

    /** Stage 17 may reveal a conditionally visible object through this method. */
    public setVisible(visible: boolean): void {
        this.state?.setVisible(visible);
        this.node.active = visible;
    }

    public get hintAvailable(): boolean {
        return this.node.isValid && this.node.activeInHierarchy && !!this.state?.config.targetable && !this.state.isFound;
    }

    public restoreFound(): void {
        if (!this.state?.restoreFound()) return;
        this.node.active = true;
        this.showFoundFeedback(false);
    }

    public hitTest(uiX: number, uiY: number): boolean {
        const state = this.state;
        const transform = this.node.getComponent(UITransform);
        if (!state || !transform || !this.node.activeInHierarchy) return false;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        return state.hitTest(local.x, local.y);
    }

    public activate(uiX: number, uiY: number): TargetClicked | null {
        const hit = this.discover(uiX, uiY);
        return hit ? { type: 'hiddenObject', ...hit } : null;
    }

    /** Emits one targetClicked report per discovery. The consumer decides task progress. */
    public discover(uiX: number, uiY: number): HiddenObjectHit | null {
        const state = this.state;
        const transform = this.node.getComponent(UITransform);
        if (!state || !transform || !this.node.activeInHierarchy) return null;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const result = state.discover(local.x, local.y);
        if (!result) return null;
        this.showFoundFeedback(true);
        this.node.emit('targetClicked', { type: 'hiddenObject', ...result });
        return result;
    }

    private showFoundFeedback(animate: boolean): void {
        const badge = new Node('FoundBadge');
        this.node.addChild(badge);
        badge.addComponent(UITransform).setContentSize(100, 100);
        const label = badge.addComponent(Label);
        label.string = '✓';
        label.fontSize = 76;
        label.lineHeight = 86;
        label.color = new Color(255, 255, 255, 255);
        if (animate) {
            badge.setScale(0.1, 0.1, 1);
            tween(badge).to(0.25, { scale: badge.scale.clone().set(1.15, 1.15, 1) })
                .to(0.1, { scale: badge.scale.clone().set(1, 1, 1) }).start();
        }
    }
}
