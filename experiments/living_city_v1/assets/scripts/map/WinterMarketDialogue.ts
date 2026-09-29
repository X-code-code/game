import { Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import type { TapTarget, TargetClicked } from '../gameplay/TargetInput';

interface Speaker {
    npcId: string;
    name: string;
    clues: readonly [string, string];
}

/** Each speaker knows their own lost object and a landmark, without marking a task complete. */
const SPEAKERS: readonly Speaker[] = [
    {
        npcId: 'winter_lantern_courier',
        name: '邮差·青羽',
        clues: [
            '蓝手套掉在左边布摊，\n屋檐下还挂着冬衣。',
            '别看地上的雪，\n它挤在布摊的货物里。',
        ],
    },
    {
        npcId: 'winter_arch_vendor',
        name: '灯摊老板·阿榕',
        clues: [
            '牌楼的红灯笼下面，\n我听见铜铃叮了一声。',
            '找找那截细红绳，\n铜铃比灯笼暗得多。',
        ],
    },
    {
        npcId: 'winter_lower_lane_potter',
        name: '陶匠·白婶',
        clues: [
            '小陶哨在右边陶摊，\n混进茶盏旁的木架了。',
            '别拿错茶杯呀，\n陶哨顶上有小鸡冠。',
        ],
    },
];

const PANEL_WIDTH = 500;
const PANEL_HEIGHT = 120;
const DISPLAY_MS = 5500;

class MovingNpcTapTarget implements TapTarget {
    private clueIndex = 0;

    public constructor(
        private readonly npc: Node,
        private readonly speaker: Speaker,
        private readonly showClue: (speaker: Speaker, clue: string) => void,
    ) {}

    /** Use the moving art node's UI coordinates, so a route never leaves a static hit box behind. */
    public hitTest(uiX: number, uiY: number): boolean {
        if (!this.npc.isValid || !this.npc.activeInHierarchy) return false;
        const art = this.npc.getChildByName('NpcArt');
        const transform = art?.getComponent(UITransform);
        if (!art?.activeInHierarchy || !transform) return false;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        // The source cutout occupies about three quarters of its square canvas.
        // Keep the tap shape tight so nearby lost objects retain priority.
        const halfWidth = Math.max(12, transform.width * 0.32);
        const halfHeight = Math.max(14, transform.height * 0.38);
        return Math.abs(local.x) <= halfWidth && Math.abs(local.y) <= halfHeight;
    }

    public activate(_uiX: number, _uiY: number): TargetClicked | null {
        const clue = this.speaker.clues[this.clueIndex % this.speaker.clues.length];
        this.clueIndex++;
        this.showClue(this.speaker, clue);
        return null;
    }
}

/**
 * Three moving street characters answer a tap with a small clue. Add `targets`
 * before hidden objects in TargetInput so a lost object wins any overlap.
 */
export class WinterMarketDialogue {
    public readonly root = new Node('WinterMarketDialogue');
    public readonly targets: readonly TapTarget[];
    private readonly heading: Label;
    private readonly message: Label;
    private dismissTimer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    public constructor(view: Node, crowdLayer: Node) {
        if (!crowdLayer.isValid) throw new Error('Winter market crowd must exist before dialogue');
        this.targets = SPEAKERS.map(speaker => {
            const npc = crowdLayer.getChildByName(speaker.npcId);
            if (!npc) throw new Error(`Winter market speaker missing: ${speaker.npcId}`);
            return new MovingNpcTapTarget(npc, speaker, (who, clue) => this.show(who, clue));
        });

        view.addChild(this.root);
        this.root.addComponent(UITransform).setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
        const background = this.root.addComponent(Graphics);
        background.fillColor = new Color(49, 42, 38, 224);
        background.roundRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 18);
        background.fill();
        background.lineWidth = 2;
        background.strokeColor = new Color(252, 226, 176, 210);
        background.roundRect(-PANEL_WIDTH / 2 + 1, -PANEL_HEIGHT / 2 + 1,
            PANEL_WIDTH - 2, PANEL_HEIGHT - 2, 17);
        background.stroke();

        const nameNode = new Node('SpeakerName');
        this.root.addChild(nameNode);
        nameNode.setPosition(0, 39, 0);
        nameNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 36, 29);
        this.heading = nameNode.addComponent(Label);
        this.heading.fontSize = 22;
        this.heading.lineHeight = 26;
        this.heading.color = new Color(255, 223, 159, 255);
        this.heading.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.heading.verticalAlign = Label.VerticalAlign.CENTER;

        const clueNode = new Node('SpeakerClue');
        this.root.addChild(clueNode);
        clueNode.setPosition(0, -14, 0);
        clueNode.addComponent(UITransform).setContentSize(PANEL_WIDTH - 36, 70);
        this.message = clueNode.addComponent(Label);
        this.message.fontSize = 25;
        this.message.lineHeight = 33;
        this.message.color = new Color(255, 251, 239, 255);
        this.message.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.message.verticalAlign = Label.VerticalAlign.CENTER;
        this.message.overflow = Label.Overflow.SHRINK;
        this.root.active = false;
        this.resize();
    }

    public get visible(): boolean { return !this.disposed && this.root.isValid && this.root.activeInHierarchy; }

    public resize(): void {
        if (this.disposed || !this.root.isValid) return;
        const viewSize = this.root.parent?.getComponent(UITransform)?.contentSize;
        if (!viewSize) return;
        const portrait = viewSize.height > viewSize.width;
        const scale = Math.min(1, viewSize.width * 0.94 / PANEL_WIDTH);
        this.root.setScale(scale, scale, 1);
        // Sit above the existing lower hint control, outside the top task list.
        this.root.setPosition(0, -viewSize.height / 2 + (portrait ? 215 : 225) * scale, 0);
    }

    public blocksInput(uiX: number, uiY: number): boolean {
        if (!this.visible) return false;
        const transform = this.root.getComponent(UITransform)!;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        return Math.abs(local.x) <= PANEL_WIDTH / 2 && Math.abs(local.y) <= PANEL_HEIGHT / 2;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearDismissTimer();
        if (this.root.isValid) this.root.destroy();
    }

    private show(speaker: Speaker, clue: string): void {
        if (this.disposed || !this.root.isValid) return;
        this.heading.string = speaker.name;
        this.message.string = clue;
        this.root.active = true;
        this.clearDismissTimer();
        this.dismissTimer = setTimeout(() => {
            this.dismissTimer = null;
            if (!this.disposed && this.root.isValid) this.root.active = false;
        }, DISPLAY_MS);
    }

    private clearDismissTimer(): void {
        if (this.dismissTimer === null) return;
        clearTimeout(this.dismissTimer);
        this.dismissTimer = null;
    }
}
