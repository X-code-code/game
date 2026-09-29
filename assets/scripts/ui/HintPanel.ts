import { Button, Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import type { ActiveHint, HintResult } from '../hint/HintManager';

/** A free hint button and a map-local marker that follows the selected live target. */
export class HintPanel {
    public readonly root = new Node('HintPanel');
    public readonly marker = new Node('HintMarker');
    private readonly message: Label;
    private readonly background: Graphics;
    private readonly button: Node;
    private readonly ring: Graphics;
    private lastRadius = 0;
    private tracking = false;
    private expanded = false;
    private laidOut = false;

    public constructor(parent: Node, map: Node, onRequest: () => void,
        private readonly compact = false) {
        map.addChild(this.marker);
        this.marker.addComponent(UITransform);
        this.ring = this.marker.addComponent(Graphics);
        this.marker.active = false;
        parent.addChild(this.root);
        this.root.addComponent(UITransform).setContentSize(600, 74);
        this.background = this.root.addComponent(Graphics);
        const text = new Node('HintMessage');
        this.root.addChild(text);
        text.setPosition(-80, 0, 0);
        text.addComponent(UITransform).setContentSize(410, 66);
        this.message = text.addComponent(Label);
        this.message.fontSize = 26;
        this.message.lineHeight = 31;
        this.message.color = new Color(75, 54, 39, 255);
        this.message.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.message.verticalAlign = Label.VerticalAlign.CENTER;
        this.message.overflow = Label.Overflow.SHRINK;
        this.message.string = '需要线索时，点一下提示';
        const button = new Node('RequestHint');
        this.button = button;
        this.root.addChild(button);
        button.setPosition(210, 0, 0);
        button.addComponent(UITransform).setContentSize(160, 62);
        const g = button.addComponent(Graphics);
        g.fillColor = new Color(239, 207, 130, 255);
        g.roundRect(-80, -31, 160, 62, 12);
        g.fill();
        button.addComponent(Button);
        const caption = new Node('Text');
        button.addChild(caption);
        caption.addComponent(UITransform).setContentSize(150, 60);
        const label = caption.addComponent(Label);
        label.string = '提示';
        label.fontSize = 30;
        label.lineHeight = 38;
        label.color = new Color(75, 54, 39, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        button.on(Button.EventType.CLICK, onRequest);
        this.layoutMode(false);
        this.resize();
    }

    public showResult(result: HintResult): void {
        this.update(result.status === 'shown' ? result.hint : null);
        this.message.string = result.status === 'shown' ?
            `${result.hint.kind === 'interactiveObject' ? '先看看圈出的机关' : '圈出的目标'}：${result.hint.label}` :
            result.status === 'complete' ? '本城所有目标已找到' : '暂时没有可提示的目标';
    }

    public update(hint: ActiveHint | null): void {
        if (this.compact) this.layoutMode(!!hint);
        this.marker.active = !!hint && this.root.activeInHierarchy;
        if (!hint) {
            if (this.tracking) this.message.string = '需要线索时，点一下提示';
            this.tracking = false;
            return;
        }
        this.tracking = true;
        this.marker.setPosition(hint.position.x, hint.position.y, 0);
        const pulse = 1 + 0.07 * Math.sin((4 - hint.remaining) * 8);
        this.marker.setScale(pulse, pulse, 1);
        if (this.lastRadius === hint.radius) return;
        this.lastRadius = hint.radius;
        this.ring.clear();
        this.ring.lineWidth = 12;
        this.ring.strokeColor = new Color(255, 255, 255, 245);
        this.ring.circle(0, 0, hint.radius);
        this.ring.stroke();
        this.ring.lineWidth = 6;
        this.ring.strokeColor = new Color(208, 91, 46, 255);
        this.ring.circle(0, 0, hint.radius);
        this.ring.stroke();
    }

    public resize(): void {
        const size = this.root.parent?.getComponent(UITransform)?.contentSize;
        if (!size) return;
        const portrait = size.height > size.width;
        const scale = portrait ? size.width * 0.94 / (this.compact && !this.expanded ? 390 : 600)
            : Math.min(1, size.width * 0.94 / 600);
        this.root.setScale(scale, scale, 1);
        if (this.compact && !this.expanded) {
            this.root.setPosition(size.width / 2 - 18 - 80 * scale,
                -size.height / 2 + 30 + 31 * scale, 0);
        } else {
            this.root.setPosition(0, -size.height / 2 + (portrait ? 190 : 125) * scale, 0);
        }
    }

    private layoutMode(expanded: boolean): void {
        if (this.laidOut && this.expanded === expanded) return;
        this.expanded = expanded;
        this.laidOut = true;
        this.background.clear();
        if (this.compact && !expanded) {
            this.root.getComponent(UITransform)?.setContentSize(160, 62);
            this.message.node.active = false;
            this.button.setPosition(0, 0, 0);
        } else {
            this.root.getComponent(UITransform)?.setContentSize(600, 74);
            this.message.node.active = true;
            this.button.setPosition(210, 0, 0);
            this.background.fillColor = new Color(255, 250, 235, 238);
            this.background.roundRect(-300, -37, 600, 74, 14);
            this.background.fill();
        }
        this.resize();
    }

    public blocksInput(x: number, y: number): boolean {
        if (!this.root.activeInHierarchy) return false;
        const t = this.root.getComponent(UITransform)!;
        const p = t.convertToNodeSpaceAR(new Vec3(x, y, 0));
        return Math.abs(p.x) <= t.width / 2 && Math.abs(p.y) <= t.height / 2;
    }

    public dispose(): void {
        if (this.root.isValid) this.root.destroy();
        if (this.marker.isValid) this.marker.destroy();
    }
}
