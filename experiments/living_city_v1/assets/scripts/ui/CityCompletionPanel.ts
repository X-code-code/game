import { AssetManager, Button, Color, Label, Node, UITransform, Vec3 } from 'cc';
import { generatedUi } from './GeneratedUi';
import type { TaskProgress } from '../task/TaskManager';

export interface CompletionSummary {
    cityName: string;
    hasNext: boolean;
    progress: TaskProgress;
    chickens: number;
    objects: number;
    chapterIndex?: number;
    chapterCount?: number;
}

/** City-specific presentation; no task mutation or asset loading lives in this UI. */
export class CityCompletionPanel {
    public readonly root = new Node('CityCompletionUI');
    public readonly modal = new Node('CompletionModal');
    private readonly card = new Node('CompletionCard');
    private readonly entry: Node;
    private readonly title: Label;
    private readonly summary: Label;
    private readonly message: Label;
    private readonly continueButton: Node;
    private readonly nextButton: Node;
    private width = 0;
    private height = 0;

    public constructor(parent: Node, onContinue: () => void, onNext: () => void, onOpen: () => void,
        private readonly artBundle?: AssetManager.Bundle) {
        parent.addChild(this.root);
        this.root.addComponent(UITransform);
        this.root.addChild(this.modal);
        this.modal.addComponent(UITransform);
        const dimmer = new Node('CompletionDimmer');
        this.modal.addChild(dimmer);
        dimmer.addComponent(UITransform);
        generatedUi(dimmer, 'ui_backdrop', this.artBundle, false).color = new Color(50, 46, 35, 155);
        this.modal.addChild(this.card);
        this.card.addComponent(UITransform).setContentSize(660, 480);
        generatedUi(this.card, 'ui_panel', this.artBundle);
        this.title = this.label(this.card, 'CompletionTitle', 37, 166, 580, 64);
        this.summary = this.label(this.card, 'CompletionSummary', 27, 73, 580, 106);
        this.message = this.label(this.card, 'CompletionMessage', 23, -15, 580, 58);
        this.continueButton = this.button(this.card, 'ContinueExploring', '再逛一会儿', 540, onContinue);
        this.continueButton.setPosition(0, -100, 0);
        this.nextButton = this.button(this.card, 'NextCity', '去下一站', 540, onNext);
        this.nextButton.setPosition(0, -184, 0);
        this.entry = this.button(this.root, 'OpenCompletion', '寻物完成 · 查看旅程', 340, onOpen);
        this.modal.active = false;
        this.entry.active = false;
        this.resize();
    }

    public get isOpen(): boolean { return this.modal.active; }

    public show(data: CompletionSummary, loading = false, failed = false): void {
        this.modal.active = true;
        this.entry.active = false;
        this.title.string = `${data.cityName} · 寻物完成`;
        const p = data.progress;
        this.summary.string = data.chapterIndex && data.chapterCount
            ? `${p.requiredCompleted} 件物品已找到\n` +
                `第 ${data.chapterIndex} 站 · 共 ${data.chapterCount} 站`
            : `主要目标：${p.requiredCompleted} / ${p.requiredTotal}\n` +
                `发现小鸡：${data.chickens}    隐藏物：${data.objects}\n` +
                `隐藏目标：${p.optionalCompleted} / ${p.optionalTotal}`;
        this.message.string = loading ? '正在准备下一站…\n也可以留在这里，再逛一会儿' : failed
            ? '下一站暂时未能加载\n可以再试一次，或留在这里逛逛' : data.hasNext
                ? '今天的寻找完成啦\n可以再逛一会儿，也可以去下一站' : '这里的物品都找到啦\n可以留在这里，慢慢逛逛';
        this.nextButton.active = data.hasNext;
        this.nextButton.getComponent(Button)!.interactable = !loading;
        this.nextButton.getChildByName('Text')!.getComponent(Label)!.string = loading
            ? '正在准备…' : failed ? '重试去下一站' : '去下一站';
        this.continueButton.getChildByName('Text')!.getComponent(Label)!.string = '再逛一会儿';
        this.resize();
    }

    public close(): void {
        this.modal.active = false;
        this.entry.active = true;
    }

    public reset(): void {
        this.modal.active = false;
        this.entry.active = false;
    }

    public blocksInput(x: number, y: number): boolean {
        if (this.isOpen) return true;
        if (!this.entry.activeInHierarchy) return false;
        const t = this.entry.getComponent(UITransform)!;
        const p = t.convertToNodeSpaceAR(new Vec3(x, y, 0));
        return Math.abs(p.x) <= t.width / 2 && Math.abs(p.y) <= t.height / 2;
    }

    public resize(): void {
        const size = this.root.parent?.getComponent(UITransform)?.contentSize;
        if (!size || (size.width === this.width && size.height === this.height)) return;
        this.width = size.width;
        this.height = size.height;
        this.root.getComponent(UITransform)!.setContentSize(size);
        this.modal.getComponent(UITransform)!.setContentSize(size);
        this.modal.getChildByName('CompletionDimmer')?.getComponent(UITransform)?.setContentSize(size);
        const scale = Math.min(size.width * 0.92 / 660, size.height * 0.85 / 480);
        this.card.setScale(scale, scale, 1);
        const entryScale = size.height > size.width ? size.width * 0.7 / 340 : 1;
        this.entry.setScale(entryScale, entryScale, 1);
        const portrait = size.height > size.width;
        this.entry.setPosition(portrait ? 0 : size.width / 2 - 170 * entryScale - 18,
            size.height / 2 - (portrait ? size.width * 0.14 : 18) - 32 * entryScale, 0);
    }

    public dispose(): void {
        if (!this.root.isValid) return;
        this.root.active = false;
        this.root.destroy();
    }

    private label(parent: Node, name: string, font: number, y: number, width: number, height: number): Label {
        const node = new Node(name);
        parent.addChild(node);
        node.setPosition(0, y, 0);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.fontSize = font;
        label.lineHeight = font + 8;
        label.color = new Color(75, 54, 39, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private button(parent: Node, name: string, text: string, width: number, click: () => void): Node {
        const node = new Node(name);
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, 64);
        generatedUi(node, 'ui_button', this.artBundle);
        node.addComponent(Button);
        this.label(node, 'Text', 27, 0, width - 16, 60).string = text;
        node.on(Button.EventType.CLICK, click);
        return node;
    }
}
