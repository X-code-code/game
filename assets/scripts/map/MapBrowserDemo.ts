import { _decorator, AssetManager, Color, Component, Graphics, Label, Node, Sprite, SpriteFrame, Tween, UITransform, Vec3, warn } from 'cc';
import type { ChickenConfig, CityConfig, HiddenObjectConfig, Size } from '../config/CityTypes';
import { ChickenCharacter } from '../character/ChickenCharacter';
import { TargetInput } from '../gameplay/TargetInput';
import { HiddenObject } from '../hidden_object/HiddenObject';
import { TaskManager } from '../task/TaskManager';
import type { TaskProgress } from '../task/TaskManager';
import { HintManager } from '../hint/HintManager';
import { HintTargetRegistry } from '../hint/HintTargetRegistry';
import { HintPanel } from '../ui/HintPanel';
import { CityViewController } from './CityViewController';
import { CityAmbientLife } from './CityAmbientLife';
import { populateWinterMarketCrowd } from './WinterMarketCrowd';
import { WinterMarketConversations } from './WinterMarketConversations';
import { SceneDepthLayer } from './SceneDepthLayer';
import { WinterMarketTeaEvent } from './WinterMarketTeaEvent';

const { ccclass } = _decorator;
const PROTOTYPE_BACKGROUNDS: Record<string, string> = {
    demo_city: 'winter_market_background/spriteFrame',
    harbor_test: 'city_harbor_background/spriteFrame',
    winter_market_block_trial_001: 'winter_slice_background/spriteFrame',
};
const PROTOTYPE_PROPS: Record<string, string> = {
    demo_parcel: 'prop_parcel/spriteFrame',
    demo_key: 'prop_key/spriteFrame',
    winter_item_bell: 'winter_item_bell/spriteFrame',
    winter_item_mitten: 'winter_item_mitten/spriteFrame',
    winter_item_whistle: 'winter_item_whistle/spriteFrame',
};
const PROTOTYPE_CHICKENS: Record<string, string> = {
    demo_blue: 'chicken_blue_v2/spriteFrame',
};
const PROTOTYPE_CHICKEN_ACTIONS: Record<string, string> = {
    demo_blue: 'chicken_blue_walk_v2/spriteFrame',
};

/** Plain data persisted per city; IDs are scoped to the city whose config is mounted. */
export interface CityProgressSnapshot {
    completedTaskIds: string[];
    foundHiddenObjectIds: string[];
    discoveredChickenIds: string[];
}

/** Displays a validated CityConfig with temporary code-drawn demo art. */
@ccclass('MapBrowserDemo')
export class MapBrowserDemo extends Component {
    private cityConfig: CityConfig | null = null;
    private controller: CityViewController | null = null;
    private targetInput: TargetInput | null = null;
    private taskManager: TaskManager | null = null;
    private taskPanel: Node | null = null;
    private taskPanelGraphics: Graphics | null = null;
    private taskTitleLabel: Label | null = null;
    private taskItemsLabel: Label | null = null;
    private foundCount = 0;
    private lastChickenClickedId: string | null = null;
    private lastWidth = 0;
    private lastHeight = 0;
    private readonly foundHiddenObjectIds = new Set<string>();
    private readonly discoveredChickens = new Set<string>();
    private onProgress: ((progress: TaskProgress) => void) | null = null;
    private disposed = false;
    private hintManager: HintManager | null = null;
    private hintPanel: HintPanel | null = null;
    private conversations: WinterMarketConversations | null = null;
    private sceneDepth: SceneDepthLayer | null = null;
    private teaEvent: WinterMarketTeaEvent | null = null;
    private artBundle: AssetManager.Bundle | null = null;
    private readonly hintTargets = new HintTargetRegistry();
    private hintsEnabled = true;

    /** Called by CityManager only after the city JSON has loaded and passed validation. */
    public mount(config: CityConfig, artBundle: AssetManager.Bundle, onProgress?: (progress: TaskProgress) => void,
        blocksInput?: (x: number, y: number) => boolean, snapshot?: CityProgressSnapshot): void {
        if (this.controller || this.taskManager) throw new Error('City demo is already mounted');
        this.cityConfig = config;
        this.artBundle = artBundle;
        this.onProgress = onProgress ?? null;
        const mapSize = config.mapSize;
        const map = new Node('TestMap');
        this.node.addChild(map);
        const transform = map.addComponent(UITransform);
        transform.setContentSize(mapSize.width, mapSize.height);
        transform.setAnchorPoint(0.5, 0.5);
        const graphics = map.addComponent(Graphics);
        this.drawGrid(graphics, mapSize);
        const ambient = new Node('CityAmbientLife');
        map.addChild(ambient);
        ambient.addComponent(UITransform).setContentSize(mapSize.width, mapSize.height);
        ambient.addComponent(CityAmbientLife).configure(config.cityId, mapSize);
        ambient.active = false;
        const backgroundPath = PROTOTYPE_BACKGROUNDS[config.cityId];
        if (backgroundPath) this.loadPrototypeFrame(backgroundPath, frame => {
            if (!map.isValid) return;
            // A Graphics and a Sprite on the same UI node do not render reliably in Creator 3.8.
            const visual = new Node('MapBackgroundArt');
            map.insertChild(visual, 0);
            visual.addComponent(UITransform).setContentSize(mapSize.width, mapSize.height);
            const sprite = visual.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.trim = false;
            sprite.spriteFrame = frame;
            graphics.enabled = false;
            // The trial street contains no water; the older demo's glints and petals
            // would float across its cobblestones.
            ambient.active = config.cityId !== 'winter_market_block_trial_001';
        });
        const sceneDepth = new SceneDepthLayer(map, mapSize, artBundle,
            config.cityId === 'demo_city' ? 'WinterMarketCrowd' : 'SceneDepthLayer');
        this.sceneDepth = sceneDepth;
        const objects = config.hiddenObjects.map(item => this.createObject(sceneDepth, item, mapSize));
        const chickens = config.chickens.map(chicken => this.createChicken(sceneDepth, chicken, mapSize));
        const winterCrowd = config.cityId === 'demo_city'
            ? populateWinterMarketCrowd(sceneDepth, mapSize, artBundle) : null;
        config.foregroundSprites?.forEach(sprite => sceneDepth.addForeground(sprite));
        if (config.cityId === 'winter_market_block_trial_001') {
            const vendor = chickens.find(chicken => chicken.node.name === 'winter_slice_vendor');
            const messenger = chickens.find(chicken => chicken.node.name === 'winter_slice_messenger');
            if (vendor && messenger) this.teaEvent = new WinterMarketTeaEvent(mapSize, sceneDepth, messenger, vendor);
        }
        sceneDepth.sort();

        this.taskManager = new TaskManager(config.tasks);
        this.restoreProgressSnapshot(snapshot, objects, chickens);
        this.createTaskPanel();

        [...objects, ...chickens].forEach((entity, index) => {
            const targetConfig = index < objects.length ? config.hiddenObjects[index] : config.chickens[index - objects.length];
            const area = targetConfig.clickArea;
            const radius = area.shape === 'circle' ? area.radius : Math.hypot(area.width, area.height) / 2;
            this.hintTargets.register({ id: targetConfig.id, kind: index < objects.length ? 'hiddenObject' : 'chicken',
                tags: targetConfig.tags, radius: radius * targetConfig.scale + 24,
                prerequisiteId: targetConfig.visibleCondition?.objectId,
                isAvailable: () => !this.disposed && entity.isValid && entity.hintAvailable &&
                    (index < objects.length || !this.discoveredChickens.has(targetConfig.id)),
                getPosition: () => entity.node.isValid ? { x: entity.node.position.x, y: entity.node.position.y } : null });
        });
        this.hintManager = new HintManager(() => this.taskManager?.getTaskStates() ?? [], task => this.hintTargets.resolve(task));
        this.hintPanel = new HintPanel(this.node, map, () => this.requestHint(), config.cityId === 'demo_city');
        if (winterCrowd) this.conversations = new WinterMarketConversations(this.node, winterCrowd);

        const isBlocked = (uiX: number, uiY: number): boolean =>
            !this.node.activeInHierarchy || !!blocksInput?.(uiX, uiY) ||
            !!this.hintPanel?.blocksInput(uiX, uiY) || !!this.conversations?.blocksInput(uiX, uiY) ||
            this.isOverTaskPanel(uiX, uiY);
        const view = config.view;
        this.controller = new CityViewController(this.node, map, view.minZoom, view.maxZoom,
            view.initialZoom ?? view.minZoom, isBlocked);
        this.targetInput = new TargetInput([...(this.conversations?.targets ?? []), ...objects, ...chickens], hit => {
            let newlyDiscovered: boolean;
            if (hit.type === 'hiddenObject') {
                newlyDiscovered = !this.foundHiddenObjectIds.has(hit.id);
                this.foundHiddenObjectIds.add(hit.id);
                this.foundCount = this.foundHiddenObjectIds.size;
            }
            else {
                this.lastChickenClickedId = hit.id;
                newlyDiscovered = !this.discoveredChickens.has(hit.id);
                this.discoveredChickens.add(hit.id);
                if (newlyDiscovered) this.markChickenDiscovered(chickens.find(chicken => chicken.node.name === hit.id));
            }
            const update = this.taskManager?.handleTargetClicked(hit);
            if (update?.completedTaskIds.length) this.renderTaskPanel();
            if (update?.completedTaskIds.length) this.conversations?.dismiss();
            if (update && (newlyDiscovered || update.completedTaskIds.length)) this.onProgress?.(update.progress);
        }, isBlocked);
        this.resizeDisplay();
    }

    protected update(): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        if (!size || (size.width === this.lastWidth && size.height === this.lastHeight)) return;
        this.resizeDisplay();
    }

    protected lateUpdate(deltaTime: number): void {
        this.teaEvent?.update(deltaTime);
        this.sceneDepth?.sort();
        this.conversations?.update(deltaTime);
        this.hintManager?.update(deltaTime);
        const hint = this.hintManager?.active ?? null;
        this.hintPanel?.update(hint);
        // Keep edge targets reachable while the hint is visible; restore the list afterward.
        if (this.taskPanel) this.taskPanel.active = !hint;
    }

    public requestHint(): void {
        if (!this.hintsEnabled || this.disposed || !this.node.activeInHierarchy) return;
        this.cancelGestures();
        const result = this.hintManager?.requestHint();
        if (!result) return;
        if (result.status === 'shown') this.controller?.focusAt(result.hint.position.x, result.hint.position.y);
        this.hintPanel?.showResult(result);
        if (this.taskPanel) this.taskPanel.active = result.status !== 'shown';
    }

    public setHintsEnabled(enabled: boolean): void {
        this.hintsEnabled = enabled;
        if (!enabled) this.hintManager?.clear();
        if (this.hintPanel) {
            this.hintPanel.root.active = enabled;
            this.hintPanel.update(this.hintManager?.active ?? null);
        }
        if (!enabled && this.taskPanel) this.taskPanel.active = true;
    }

    protected onDestroy(): void {
        this.dispose();
    }

    public get progress(): TaskProgress {
        if (!this.taskManager) throw new Error('City is not mounted');
        return this.taskManager.getProgress();
    }

    public get discoveries(): { chickens: number; objects: number } {
        return { chickens: this.discoveredChickens.size, objects: this.foundCount };
    }

    /** Returns fresh arrays in city-config order so callers can save without holding view state. */
    public getProgressSnapshot(): CityProgressSnapshot {
        if (!this.cityConfig || !this.taskManager) throw new Error('City is not mounted');
        return {
            completedTaskIds: this.taskManager.getCompletedTaskIds(),
            foundHiddenObjectIds: this.cityConfig.hiddenObjects
                .filter(item => this.foundHiddenObjectIds.has(item.id)).map(item => item.id),
            discoveredChickenIds: this.cityConfig.chickens
                .filter(item => this.discoveredChickens.has(item.id)).map(item => item.id),
        };
    }

    public cancelGestures(): void {
        this.targetInput?.cancelGestures();
        this.controller?.cancelGestures();
    }

    /** Detach global input immediately, before deferred node destruction or resource release. */
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.hintManager?.dispose();
        this.hintManager = null;
        this.hintTargets.clear();
        this.hintPanel?.dispose();
        this.hintPanel = null;
        this.conversations?.dispose();
        this.conversations = null;
        this.teaEvent?.dispose();
        this.teaEvent = null;
        this.sceneDepth = null;
        this.targetInput?.dispose();
        this.targetInput = null;
        this.controller?.dispose();
        this.controller = null;
        this.taskManager = null;
        this.cityConfig = null;
        this.artBundle = null;
        this.onProgress = null;
        this.foundHiddenObjectIds.clear();
        this.discoveredChickens.clear();
        this.foundCount = 0;
        const stopTweens = (node: Node): void => {
            // Cocos destroys children before invoking this component's onDestroy.
            if (!node.isValid) return;
            Tween.stopAllByTarget(node);
            node.children.forEach(stopTweens);
        };
        stopTweens(this.node);
    }

    private resizeDisplay(): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        if (!size) return;
        this.lastWidth = size.width;
        this.lastHeight = size.height;
        this.controller?.resizeIfNeeded();
        this.hintPanel?.resize();
        this.conversations?.resize();
        const panel = this.taskPanel;
        const graphics = this.taskPanelGraphics;
        if (!panel || !graphics) return;
        const portrait = size.height > size.width;
        const trial = this.cityConfig?.cityId === 'winter_market_block_trial_001';
        const compact = this.cityConfig?.cityId === 'demo_city';
        const margin = portrait ? 18 : 12;
        const width = portrait ? Math.max(280, size.width - margin * 2) : Math.min(400, Math.max(280, size.width - 24));
        const height = trial ? (portrait ? 200 : 116)
            : compact ? (portrait ? 390 : 182) : (portrait ? 590 : 268);
        panel.setPosition(-size.width / 2 + width / 2 + margin,
            (trial ? -size.height / 2 + height / 2 + margin : size.height / 2 - height / 2 - margin), 0);
        panel.getComponent(UITransform)?.setContentSize(width, height);
        graphics.clear();
        graphics.fillColor = new Color(255, 250, 235, trial ? 225 : compact ? 218 : 238);
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(132, 99, 68, 255);
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.stroke();
        const padding = portrait ? 30 : 16;
        if (this.taskTitleLabel) {
            this.taskTitleLabel.fontSize = trial ? (portrait ? 34 : 24)
                : compact ? (portrait ? 62 : 28) : (portrait ? 70 : 32);
            this.taskTitleLabel.lineHeight = trial ? (portrait ? 42 : 29)
                : compact ? (portrait ? 72 : 34) : (portrait ? 82 : 38);
            this.taskTitleLabel.node.setPosition(-width / 2 + padding,
                height / 2 - (trial ? 14 : portrait ? 27 : 14), 0);
            this.taskTitleLabel.node.getComponent(UITransform)?.setContentSize(width - padding * 2,
                trial ? (portrait ? 48 : 30) : portrait ? 90 : 46);
        }
        if (this.taskItemsLabel) {
            this.taskItemsLabel.fontSize = trial ? (portrait ? 28 : 19)
                : compact ? (portrait ? 52 : 24) : (portrait ? 58 : 28);
            this.taskItemsLabel.lineHeight = trial ? (portrait ? 39 : 24)
                : compact ? (portrait ? 68 : 32) : (portrait ? 80 : 37);
            this.taskItemsLabel.node.setPosition(-width / 2 + padding, height / 2 -
                (trial ? (portrait ? 66 : 43) : portrait ? 119 : 61), 0);
            this.taskItemsLabel.node.getComponent(UITransform)?.setContentSize(width - padding * 2,
                height - (trial ? (portrait ? 72 : 48) : portrait ? 135 : 70));
        }
    }

    private createTaskPanel(): void {
        const panel = new Node('TaskPanel');
        this.node.addChild(panel);
        panel.addComponent(UITransform);
        this.taskPanelGraphics = panel.addComponent(Graphics);
        this.taskPanel = panel;

        const title = new Node('TaskTitle');
        panel.addChild(title);
        title.addComponent(UITransform).setAnchorPoint(0, 1);
        const titleLabel = title.addComponent(Label);
        titleLabel.fontSize = 32;
        titleLabel.lineHeight = 38;
        titleLabel.color = new Color(75, 54, 39, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.TOP;
        this.taskTitleLabel = titleLabel;

        const items = new Node('TaskItems');
        panel.addChild(items);
        items.addComponent(UITransform).setAnchorPoint(0, 1);
        const itemsLabel = items.addComponent(Label);
        itemsLabel.fontSize = 28;
        itemsLabel.lineHeight = 37;
        itemsLabel.color = new Color(75, 54, 39, 255);
        itemsLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        itemsLabel.verticalAlign = Label.VerticalAlign.TOP;
        this.taskItemsLabel = itemsLabel;
        this.renderTaskPanel();
    }

    private renderTaskPanel(): void {
        const manager = this.taskManager;
        if (!manager || !this.taskTitleLabel || !this.taskItemsLabel) return;
        const progress = manager.getProgress();
        this.taskTitleLabel.string = this.cityConfig?.cityId === 'demo_city'
            ? `雪灯街市 · ${progress.requiredCompleted}/${progress.requiredTotal}`
            : this.cityConfig?.cityId === 'winter_market_block_trial_001'
                ? `街区试样 · ${progress.requiredCompleted}/${progress.requiredTotal}`
                : `探索目标 ${progress.requiredCompleted} / ${progress.requiredTotal}`;
        this.taskItemsLabel.string = manager.getTaskStates()
            .map(state => `${state.completed ? '✓' : '□'} ${state.config.label}${state.config.required ? '' : '（隐藏）'}`)
            .join('\n');
    }

    private isOverTaskPanel(uiX: number, uiY: number): boolean {
        const panel = this.taskPanel;
        const transform = panel?.getComponent(UITransform);
        if (!panel?.activeInHierarchy || !transform) return false;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const size = transform.contentSize;
        return Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2;
    }

    private restoreProgressSnapshot(snapshot: CityProgressSnapshot | undefined,
        objects: readonly HiddenObject[], chickens: readonly ChickenCharacter[]): void {
        if (!snapshot) return;
        this.taskManager?.restoreCompletedTaskIds(snapshot.completedTaskIds);
        const savedObjects = new Set(Array.isArray(snapshot.foundHiddenObjectIds)
            ? snapshot.foundHiddenObjectIds.filter((id): id is string => typeof id === 'string') : []);
        for (const object of objects) {
            const id = object.node.name;
            if (!savedObjects.has(id) || !this.cityConfig?.hiddenObjects.some(item => item.id === id && item.targetable)) continue;
            object.restoreFound();
            this.foundHiddenObjectIds.add(id);
        }
        this.foundCount = this.foundHiddenObjectIds.size;
        const savedChickens = new Set(Array.isArray(snapshot.discoveredChickenIds)
            ? snapshot.discoveredChickenIds.filter((id): id is string => typeof id === 'string') : []);
        for (const chicken of chickens) {
            const id = chicken.node.name;
            if (!savedChickens.has(id) || !this.cityConfig?.chickens.some(item => item.id === id && item.targetable)) continue;
            this.discoveredChickens.add(id);
            this.markChickenDiscovered(chicken);
        }
    }

    private markChickenDiscovered(chicken: ChickenCharacter | undefined): void {
        if (!chicken?.node.isValid || chicken.node.getChildByName('DiscoveryMark')) return;
        const mark = new Node('DiscoveryMark');
        chicken.node.addChild(mark);
        mark.setPosition(-53, 69, 0);
        mark.addComponent(UITransform).setContentSize(40, 40);
        const label = mark.addComponent(Label);
        label.string = '♥';
        label.fontSize = 30;
        label.lineHeight = 36;
        label.color = new Color(183, 80, 93, 255);
    }

    private createObject(depthLayer: SceneDepthLayer, config: HiddenObjectConfig, mapSize: Size): HiddenObject {
        const node = new Node(config.id);
        depthLayer.addActor(node, () => config.depthY ?? node.position.y);
        const graphic = node.addComponent(Graphics);
        this.drawTemporaryProp(graphic, config.asset);
        const object = node.addComponent(HiddenObject);
        object.configure(config, mapSize);
        const artPath = PROTOTYPE_PROPS[config.asset] ?? `${config.asset}/spriteFrame`;
        if (artPath) this.loadPrototypeFrame(artPath, frame => {
            if (!node.isValid) return;
            const visual = new Node('PropArt');
            node.insertChild(visual, 0);
            const hitSize = node.getComponent(UITransform)?.contentSize;
            // The target keeps a finger-sized hit area while market trinkets stay small in the scene.
            const artScale = config.asset.startsWith('winter_item_') ? 0.60
                : config.asset === 'winter_slice_whistle' ? 0.75 : 1;
            visual.addComponent(UITransform).setContentSize(
                (hitSize?.width ?? 128) * artScale, (hitSize?.height ?? 128) * artScale);
            const sprite = visual.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.trim = false;
            sprite.spriteFrame = frame;
            graphic.enabled = false;
        });
        return object;
    }

    private createChicken(depthLayer: SceneDepthLayer, config: ChickenConfig, mapSize: Size): ChickenCharacter {
        const node = new Node(config.id);
        const authoredFootOffset = config.visualSize
            ? config.visualSize.height * (0.5 - 12 / 384) * config.scale : 0;
        depthLayer.addActor(node, () => config.depthY ?? node.position.y - authoredFootOffset);
        const chicken = node.addComponent(ChickenCharacter);
        chicken.configure(config, mapSize);
        const appearance = chicken.appearanceNode;
        if (appearance) this.drawTemporaryChicken(appearance, config);
        const artPath = PROTOTYPE_CHICKENS[config.skin] ?? `${config.skin}/spriteFrame`;
        if (artPath) this.loadPrototypeFrame(artPath, frame => {
            if (!chicken.isValid) return;
            chicken.applyPrototypeSkin(frame, config.visualSize);
            const animation = config.animation;
            if (animation) {
                const loaded = new Map<string, SpriteFrame>([[config.skin, frame]]);
                const assets = Array.from(new Set(animation.frames)).filter(asset => !loaded.has(asset));
                const applyAnimation = (): void => {
                    if (!chicken.isValid || animation.frames.some(asset => !loaded.has(asset))) return;
                    // The tea vendor pours when a visitor reaches the counter,
                    // instead of switching the full body image on an idle timer.
                    const frameBehavior = config.id === 'winter_slice_vendor' ? 'peck' : config.behaviorType;
                    chicken.applyBehaviorFrames(frameBehavior,
                        animation.frames.map(asset => loaded.get(asset)!),
                        animation.frameDurationSeconds);
                };
                assets.forEach(asset => this.loadPrototypeFrame(`${asset}/spriteFrame`, actionFrame => {
                    loaded.set(asset, actionFrame);
                    applyAnimation();
                }));
                applyAnimation();
                return;
            }
            // Cast v2 has its outfit and carried prop painted into the base skin.
            // Keep the config tags for gameplay but do not stack legacy cutouts.
            const actionPath = PROTOTYPE_CHICKEN_ACTIONS[config.skin];
            if (actionPath) this.loadPrototypeFrame(actionPath, actionFrame => {
                if (chicken.isValid) chicken.applyPrototypeActionFrame(actionFrame);
            });
        });
        return chicken;
    }

    private loadPrototypeFrame(path: string, apply: (frame: SpriteFrame) => void): void {
        this.artBundle?.load(path, SpriteFrame, (loadError, frame) => {
            if (this.disposed || !this.node.isValid) return;
            if (loadError || !frame) {
                warn(`Prototype art unavailable at ${path}; keeping drawn fallback`, loadError);
                return;
            }
            apply(frame);
        });
    }

    private drawTemporaryChicken(appearance: Node, config: ChickenConfig): void {
        const bodyNode = appearance.getChildByName('Body');
        const headNode = appearance.getChildByName('Head');
        const eyeOpenNode = headNode?.getChildByName('EyeOpen');
        const eyeClosedNode = headNode?.getChildByName('EyeClosed');
        if (!bodyNode || !headNode || !eyeOpenNode || !eyeClosedNode) {
            throw new Error('ChickenCharacter must provide Body, Head and both eye layers');
        }

        const body = bodyNode.getComponent(Graphics) ?? bodyNode.addComponent(Graphics);
        const head = headNode.getComponent(Graphics) ?? headNode.addComponent(Graphics);
        const eyeOpen = eyeOpenNode.getComponent(Graphics) ?? eyeOpenNode.addComponent(Graphics);
        const eyeClosed = eyeClosedNode.getComponent(Graphics) ?? eyeClosedNode.addComponent(Graphics);
        const outline = new Color(130, 90, 63, 255);
        const palette = config.skin === 'demo_blue'
            ? { body: new Color(152, 205, 228, 255), wing: new Color(112, 170, 211, 255) }
            : config.skin === 'demo_pink'
                ? { body: new Color(249, 190, 208, 255), wing: new Color(226, 150, 177, 255) }
                : config.skin === 'demo_gray'
                    ? { body: new Color(200, 205, 211, 255), wing: new Color(160, 169, 180, 255) }
                    : { body: new Color(255, 216, 92, 255), wing: new Color(244, 181, 65, 255) };

        // Legs, round body, and wing move together while the head can peck separately.
        body.lineWidth = 5;
        body.strokeColor = outline;
        body.moveTo(-20, -41);
        body.lineTo(-20, -64);
        body.moveTo(19, -41);
        body.lineTo(19, -64);
        body.stroke();
        body.fillColor = palette.body;
        body.circle(0, 0, 48);
        body.fill();
        body.stroke();
        body.fillColor = palette.wing;
        body.circle(-22, -4, 21);
        body.fill();
        body.stroke();
        if (config.accessories.indexOf('demo_red_scarf') >= 0) {
            body.strokeColor = new Color(204, 78, 86, 255);
            body.lineWidth = 11;
            body.moveTo(-24, 27);
            body.lineTo(31, 27);
            body.stroke();
            body.moveTo(-17, 23);
            body.lineTo(-28, 0);
            body.stroke();
        }
        if (config.carryItem === 'demo_egg') {
            body.fillColor = new Color(250, 248, 225, 255);
            body.strokeColor = new Color(156, 142, 122, 255);
            body.lineWidth = 4;
            body.circle(-54, -12, 15);
            body.fill();
            body.stroke();
        }

        head.lineWidth = 5;
        head.strokeColor = outline;
        head.fillColor = palette.body;
        head.circle(0, 0, 34);
        head.fill();
        head.stroke();
        head.fillColor = new Color(239, 143, 62, 255);
        head.moveTo(27, -2);
        head.lineTo(55, -10);
        head.lineTo(27, -17);
        head.close();
        head.fill();
        if (config.accessories.indexOf('demo_straw_hat') >= 0) {
            head.fillColor = new Color(193, 142, 64, 255);
            head.rect(-39, 28, 78, 10);
            head.fill();
            head.rect(-23, 36, 46, 18);
            head.fill();
        }

        eyeOpen.fillColor = new Color(40, 48, 55, 255);
        eyeOpen.circle(0, 0, 6);
        eyeOpen.fill();
        eyeClosed.lineWidth = 4;
        eyeClosed.strokeColor = new Color(40, 48, 55, 255);
        eyeClosed.moveTo(-7, 1);
        eyeClosed.lineTo(0, -3);
        eyeClosed.lineTo(7, 1);
        eyeClosed.stroke();
    }

    private drawTemporaryProp(graphic: Graphics, asset: string): void {
        graphic.lineWidth = 8;
        if (asset === 'demo_banana') {
            graphic.strokeColor = new Color(223, 169, 44, 255);
            graphic.fillColor = new Color(255, 220, 85, 255);
            graphic.moveTo(-42, 18);
            graphic.bezierCurveTo(-15, -35, 35, -30, 50, 24);
            graphic.bezierCurveTo(15, -8, -15, 2, -42, 18);
            graphic.fill();
            graphic.stroke();
        } else if (asset === 'demo_parcel') {
            graphic.fillColor = new Color(201, 131, 83, 255);
            graphic.strokeColor = new Color(117, 74, 54, 255);
            graphic.rect(-52, -42, 104, 84);
            graphic.fill();
            graphic.stroke();
            graphic.moveTo(0, -42);
            graphic.lineTo(0, 42);
            graphic.moveTo(-52, 5);
            graphic.lineTo(52, 5);
            graphic.stroke();
        } else {
            graphic.strokeColor = new Color(113, 126, 141, 255);
            graphic.circle(-18, 16, 20);
            graphic.moveTo(-1, 2);
            graphic.lineTo(44, -38);
            graphic.moveTo(26, -22);
            graphic.lineTo(39, -10);
            graphic.stroke();
        }
    }

    private drawGrid(graphics: Graphics, mapSize: Size): void {
        const mapWidth = mapSize.width;
        const mapHeight = mapSize.height;
        graphics.fillColor = new Color(244, 231, 199, 255);
        graphics.rect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight);
        graphics.fill();

        const colors = [
            new Color(143, 196, 171, 255),
            new Color(242, 175, 132, 255),
            new Color(165, 193, 218, 255),
            new Color(224, 190, 215, 255),
        ];
        for (let index = 0; index < colors.length; index++) {
            graphics.fillColor = colors[index];
            const x = -850 + (index % 2) * 950;
            const y = -480 + Math.floor(index / 2) * 750;
            graphics.rect(x, y, 450, 300);
            graphics.fill();
        }

        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(187, 166, 127, 255);
        for (let x = -mapWidth / 2; x <= mapWidth / 2; x += 200) {
            graphics.moveTo(x, -mapHeight / 2);
            graphics.lineTo(x, mapHeight / 2);
        }
        for (let y = -mapHeight / 2; y <= mapHeight / 2; y += 200) {
            graphics.moveTo(-mapWidth / 2, y);
            graphics.lineTo(mapWidth / 2, y);
        }
        graphics.stroke();

        graphics.lineWidth = 14;
        graphics.strokeColor = new Color(179, 94, 86, 255);
        graphics.rect(-mapWidth / 2 + 7, -mapHeight / 2 + 7, mapWidth - 14, mapHeight - 14);
        graphics.stroke();
    }
}
