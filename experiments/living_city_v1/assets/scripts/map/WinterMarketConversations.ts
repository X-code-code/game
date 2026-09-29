import { Color, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import type { TapTarget, TargetClicked } from '../gameplay/TargetInput';

interface Speaker {
    npcId: string;
    name: string;
    line: string;
}

const SPEAKERS: readonly Speaker[] = [
    { npcId: 'winter_arch_vendor', name: '灯摊老板',
        line: '系灯笼的铜铃不见了。它也许还挂在红灯旁。' },
    { npcId: 'winter_lantern_courier', name: '街市邮差',
        line: '我的蓝手套被风吹向布摊，混进布匹里了。' },
    { npcId: 'winter_lower_lane_potter', name: '陶匠阿姨',
        line: '小陶哨混进陶罐堆，公鸡的尾巴应该还露着。' },
    { npcId: 'winter_bridge_courier', name: '过桥邮差', line: '桥上风大，我得抱紧这些年货。' },
    { npcId: 'winter_bridge_visitor', name: '赏灯旅人', line: '从桥上看，整条街都亮起来了。' },
    { npcId: 'winter_bridge_child', name: '小栗', line: '你看，雪花落进河里就不见啦！' },
    { npcId: 'winter_bridge_elder', name: '桥头爷爷', line: '慢些走，今晚的摊子可多着呢。' },
    { npcId: 'winter_upper_lane_porter', name: '挑担师傅', line: '借过借过，刚出炉的点心送来了。' },
    { npcId: 'winter_upper_lane_child', name: '小豆', line: '我在数红灯笼，已经数乱啦。' },
    { npcId: 'winter_arch_customer', name: '逛街阿姨', line: '这匹红布做冬衣正合适。' },
    { npcId: 'winter_lantern_child', name: '看灯的小鸡', line: '最大的灯笼在前面！' },
    { npcId: 'winter_lantern_elder', name: '街坊爷爷', line: '灯光一亮，街市就暖和了。' },
    { npcId: 'winter_flower_customer', name: '买花阿姨', line: '梅花还带着一点雪香。' },
    { npcId: 'winter_pottery_shopper', name: '挑陶器的客人', line: '这些小罐子真有趣，得仔细挑。' },
    { npcId: 'winter_right_lane_courier', name: '赶路邮差', line: '送完这封信，我也去喝碗热茶。' },
    { npcId: 'winter_right_lane_child', name: '小团', line: '我刚学会吹陶哨，只会吹一声。' },
    { npcId: 'winter_right_lane_porter', name: '搬货师傅', line: '帮我留条路，这担货可沉啦。' },
    { npcId: 'winter_tea_stall_vendor', name: '茶摊老板', line: '热茶刚好，先暖暖手吧。' },
    { npcId: 'winter_basket_customer', name: '买年货阿姨', line: '篮子快装满了，还想再逛一圈。' },
    { npcId: 'winter_lower_lane_elder', name: '老街坊', line: '从前这里还没这么多灯呢。' },
];

class NpcTalkTarget implements TapTarget {
    public constructor(private readonly art: Node, private readonly speaker: Speaker,
        private readonly show: (speaker: Speaker) => void) {}

    public hitTest(uiX: number, uiY: number): boolean {
        if (!this.art.isValid || !this.art.activeInHierarchy) return false;
        const transform = this.art.getComponent(UITransform);
        if (!transform) return false;
        const point = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const halfWidth = Math.max(20, transform.width * .24);
        const halfHeight = Math.max(20, transform.height * .24);
        return Math.abs(point.x) <= halfWidth && Math.abs(point.y) <= halfHeight;
    }

    // A conversation is a street interaction, not a search-task completion.
    public activate(uiX: number, uiY: number): TargetClicked | null {
        if (this.hitTest(uiX, uiY)) this.show(this.speaker);
        return null;
    }
}

/** Market residents offer short lines; three also point toward their lost possessions. */
export class WinterMarketConversations {
    public readonly targets: readonly TapTarget[];
    public readonly root = new Node('WinterMarketDialogue');
    private readonly graphics: Graphics;
    private readonly nameLabel: Label;
    private readonly lineLabel: Label;
    private remaining = 0;

    public constructor(view: Node, crowdLayer: Node) {
        view.addChild(this.root);
        this.root.addComponent(UITransform);
        this.graphics = this.root.addComponent(Graphics);
        const name = new Node('SpeakerName');
        this.root.addChild(name);
        name.addComponent(UITransform).setAnchorPoint(0, 1);
        this.nameLabel = name.addComponent(Label);
        this.nameLabel.color = new Color(112, 63, 44, 255);
        this.nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        const line = new Node('DialogueLine');
        this.root.addChild(line);
        line.addComponent(UITransform).setAnchorPoint(0, 1);
        this.lineLabel = line.addComponent(Label);
        this.lineLabel.color = new Color(70, 55, 47, 255);
        this.lineLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.lineLabel.overflow = Label.Overflow.SHRINK;
        const targets: TapTarget[] = [];
        for (const speaker of SPEAKERS) {
            const art = crowdLayer.getChildByName(speaker.npcId)?.getChildByName('NpcArt');
            if (art) targets.push(new NpcTalkTarget(art, speaker, item => this.show(item)));
        }
        this.targets = targets;
        this.resize();
        this.root.active = false;
    }

    public update(deltaTime: number): void {
        if (!this.root.active || !Number.isFinite(deltaTime) || deltaTime <= 0) return;
        this.remaining -= Math.min(deltaTime, .1);
        if (this.remaining <= 0) this.dismiss();
    }

    public dismiss(): void {
        this.remaining = 0;
        this.root.active = false;
    }

    public blocksInput(uiX: number, uiY: number): boolean {
        if (!this.root.activeInHierarchy) return false;
        const transform = this.root.getComponent(UITransform)!;
        const point = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        return Math.abs(point.x) <= transform.width / 2 && Math.abs(point.y) <= transform.height / 2;
    }

    public resize(): void {
        const viewport = this.root.parent?.getComponent(UITransform)?.contentSize;
        const transform = this.root.getComponent(UITransform);
        if (!viewport || !transform) return;
        const portrait = viewport.height > viewport.width;
        const width = portrait ? Math.max(280, viewport.width - 36) : Math.min(580, viewport.width - 32);
        const height = portrait ? 176 : 112;
        transform.setContentSize(width, height);
        this.root.setPosition(0, -viewport.height / 2 + (portrait ? 270 : 148), 0);
        this.graphics.clear();
        this.graphics.fillColor = new Color(255, 248, 229, 236);
        this.graphics.roundRect(-width / 2, -height / 2, width, height, 15);
        this.graphics.fill();
        this.graphics.strokeColor = new Color(146, 93, 61, 240);
        this.graphics.lineWidth = 2;
        this.graphics.roundRect(-width / 2, -height / 2, width, height, 15);
        this.graphics.stroke();
        const inset = portrait ? 22 : 20;
        const nameNode = this.nameLabel.node;
        nameNode.setPosition(-width / 2 + inset, height / 2 - (portrait ? 14 : 8), 0);
        nameNode.getComponent(UITransform)?.setContentSize(width - inset * 2, portrait ? 58 : 38);
        this.nameLabel.fontSize = portrait ? 48 : 27;
        this.nameLabel.lineHeight = portrait ? 56 : 32;
        const lineNode = this.lineLabel.node;
        lineNode.setPosition(-width / 2 + inset, height / 2 - (portrait ? 75 : 43), 0);
        lineNode.getComponent(UITransform)?.setContentSize(width - inset * 2, portrait ? 85 : 62);
        this.lineLabel.fontSize = portrait ? 42 : 24;
        this.lineLabel.lineHeight = portrait ? 49 : 29;
    }

    public dispose(): void {
        if (this.root.isValid) this.root.destroy();
    }

    private show(speaker: Speaker): void {
        this.nameLabel.string = speaker.name;
        this.lineLabel.string = speaker.line;
        this.remaining = 5.5;
        this.root.active = true;
    }
}
