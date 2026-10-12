import { _decorator, AssetManager, Color, Component, EventMouse, EventTouch, Graphics, Input, input, Label, Node, Sprite, SpriteFrame, tween, Tween, UIOpacity, UITransform, Vec3, warn } from 'cc';
import type { ChickenConfig, CityConfig, HiddenObjectConfig, Size } from '../config/CityTypes';
import { ChickenCharacter } from '../character/ChickenCharacter';
import { TargetInput } from '../gameplay/TargetInput';
import { HiddenObject } from '../hidden_object/HiddenObject';
import { TaskManager } from '../task/TaskManager';
import type { TaskProgress } from '../task/TaskManager';
import { HintManager } from '../hint/HintManager';
import { HintTargetRegistry } from '../hint/HintTargetRegistry';
import { HintPanel } from '../ui/HintPanel';
import { generatedUi } from '../ui/GeneratedUi';
import { CityViewController } from './CityViewController';
import { CityAmbientLife } from './CityAmbientLife';
import { populateWinterMarketCrowd } from './WinterMarketCrowd';
import { WinterMarketConversations } from './WinterMarketConversations';
import { SceneDepthLayer } from './SceneDepthLayer';
import { WinterMarketTeaEvent } from './WinterMarketTeaEvent';
import { LivingCityGreybox } from './LivingCityGreybox';
import { SceneInteraction } from '../interaction/SceneInteraction';

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
const LIVING_CITY_TARGET_SIZE: Record<string, { width: number; height: number }> = {
    tea_clay_whistle: { width: 30, height: 28 },
    tailor_thimble: { width: 26, height: 27 },
    banner_knot: { width: 27, height: 33 },
    chestnut_tongs: { width: 36, height: 32 },
};
const LIVING_CITY_STICKERS = [
    { id: 'tea_clay_whistle', name: '陶哨', clue: '茶摊的杯盏附近' },
    { id: 'tailor_thimble', name: '顶针', clue: '裁缝铺摆货的地方' },
    { id: 'banner_knot', name: '绳结', clue: '街口悬挂的横幅旁' },
    { id: 'chestnut_tongs', name: '栗子夹', clue: '卖栗子的推车附近' },
] as const;

interface StickerCard {
    node: Node;
    background: Sprite;
    icon: Sprite;
    name: Label;
    check: Label;
    collected: boolean;
    iconSize: number;
}

interface StickerPress {
    x: number;
    y: number;
    targetId: string | null;
    eligible: boolean;
    pagingEligible: boolean;
    pageDirection: number;
}

const STICKERS_PER_PAGE = 12;

/** Plain data persisted per city; IDs are scoped to the city whose config is mounted. */
export interface CityProgressSnapshot {
    completedTaskIds: string[];
    foundHiddenObjectIds: string[];
    discoveredChickenIds: string[];
    interactiveStates?: Record<string, string>;
    sceneDiscoveryIds?: string[];
}

/** Displays validated city content and its generated PNG target tray. */
@ccclass('MapBrowserDemo')
export class MapBrowserDemo extends Component {
    private readonly interactions = new Map<string, SceneInteraction>();
    private get stickers(): Array<{ id: string; name: string; clue: string }> {
        return (this.cityConfig?.hiddenObjects ?? []).map(item => ({ id: item.id,
            name: item.displayName ?? LIVING_CITY_STICKERS.find(sticker => sticker.id === item.id)?.name ?? item.id,
            clue: item.clue ?? LIVING_CITY_STICKERS.find(sticker => sticker.id === item.id)?.clue ?? '仔细看看街边的陈列' }));
    }
    private targetSize(id: string): Size {
        return this.cityConfig?.hiddenObjects.find(item => item.id === id)?.visualSize ??
            LIVING_CITY_TARGET_SIZE[id] ?? { width: 32, height: 32 };
    }
    private cityConfig: CityConfig | null = null;
    private get isLivingCity(): boolean {
        return !!this.cityConfig?.sceneBlueprint || this.cityConfig?.cityId === 'living_city_street_block_01';
    }
    private controller: CityViewController | null = null;
    private targetInput: TargetInput | null = null;
    private taskManager: TaskManager | null = null;
    private taskPanel: Node | null = null;
    private taskPanelGraphics: Graphics | Sprite | null = null;
    private viewportBackground: Sprite | null = null;
    private taskTitleLabel: Label | null = null;
    private journalProgressLabel: Label | null = null;
    private journalCluePaper: Node | null = null;
    private taskItemsLabel: Label | null = null;
    private stickerClueLabel: Label | null = null;
    private stickerPageLabel: Label | null = null;
    private stickerPage = 0;
    private selectedStickerId: string | null = null;
    private welcomePrompt: Node | null = null;
    private welcomeSeconds = 0;
    private missedTapFeedback: Node | null = null;
    private blocksExternalInput: ((x: number, y: number) => boolean) | null = null;
    private readonly stickerCards = new Map<string, StickerCard>();
    private readonly collectionFlights = new Map<string, Node>();
    private readonly collectionCompletionCallbacks: Array<() => void> = [];
    private collectionLandingAnimations = 0;
    private readonly stickerTouches = new Map<number, StickerPress>();
    private stickerMousePress: StickerPress | null = null;
    private stickerInputAttached = false;
    private foundCount = 0;
    private lastChickenClickedId: string | null = null;
    private lastWidth = 0;
    private lastHeight = 0;
    private readonly foundHiddenObjectIds = new Set<string>();
    private readonly discoveredChickens = new Set<string>();
    private readonly sceneDiscoveryIds = new Set<string>();
    private onProgress: ((progress: TaskProgress) => void) | null = null;
    private disposed = false;
    private hintManager: HintManager | null = null;
    private hintPanel: HintPanel | null = null;
    private conversations: WinterMarketConversations | null = null;
    private sceneDepth: SceneDepthLayer | null = null;
    private teaEvent: WinterMarketTeaEvent | null = null;
    private livingGreybox: LivingCityGreybox | null = null;
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
        this.blocksExternalInput = blocksInput ?? null;
        const mapSize = config.mapSize;
        if (this.isLivingCity) {
            const background = new Node('MapViewportBackground');
            this.node.addChild(background);
            background.addComponent(UITransform);
            this.viewportBackground = generatedUi(background, 'ui_backdrop', artBundle, false);
        }
        const map = new Node('TestMap');
        this.node.addChild(map);
        const transform = map.addComponent(UITransform);
        transform.setContentSize(mapSize.width, mapSize.height);
        transform.setAnchorPoint(0.5, 0.5);
        const graphics = map.addComponent(Graphics);
        if (!this.isLivingCity) this.drawGrid(graphics, mapSize);
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
        if (this.isLivingCity) {
            this.livingGreybox = new LivingCityGreybox(map, sceneDepth, artBundle,
                objects.map(object => object.node), focus => {
                    this.controller?.focusAt(focus.x, focus.y);
                    this.offerFirstFind();
                },
                config.sceneBlueprint, config.cityId, {
                    hasFoundTarget: id => this.foundHiddenObjectIds.has(id),
                    hasDiscovery: id => this.sceneDiscoveryIds.has(id),
                    recordDiscovery: id => {
                        if (this.sceneDiscoveryIds.has(id)) return;
                        this.sceneDiscoveryIds.add(id);
                        if (this.taskManager) this.onProgress?.(this.taskManager.getProgress());
                    },
                });
            graphics.enabled = false;
        }
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
        for (const item of config.interactiveObjects) {
            const interaction = new SceneInteraction(item, mapSize, artBundle, sceneDepth,
                snapshot?.interactiveStates?.[item.id]);
            this.interactions.set(item.id, interaction);
            this.hintTargets.register({ id: item.id, kind: 'interactiveObject', tags: item.tags, displayName: item.label,
                radius: Math.max(item.visualSize?.width ?? 100, item.visualSize?.height ?? 100) / 2 + 12,
                isAvailable: () => !this.disposed && interaction.available,
                getPosition: () => interaction.node.isValid ? { x: interaction.node.position.x, y: interaction.node.position.y } : null });
        }
        this.applyInteractionVisibility(objects);
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
        this.hintPanel = new HintPanel(this.node, map, () => this.requestHint(),
            config.cityId === 'demo_city' || this.isLivingCity,
            this.isLivingCity, artBundle);
        if (winterCrowd) this.conversations = new WinterMarketConversations(this.node, winterCrowd);

        const isBlocked = (uiX: number, uiY: number): boolean =>
            !this.node.activeInHierarchy || !!blocksInput?.(uiX, uiY) ||
            !!this.hintPanel?.blocksInput(uiX, uiY) || !!this.conversations?.blocksInput(uiX, uiY) ||
            this.isOverTaskPanel(uiX, uiY);
        const view = config.view;
        this.controller = new CityViewController(this.node, map, view.minZoom, view.maxZoom,
            view.initialZoom ?? view.minZoom, isBlocked);
        this.targetInput = new TargetInput([
            ...(this.livingGreybox?.discoveryTarget ? [this.livingGreybox.discoveryTarget] : []),
            ...(this.livingGreybox?.clueTarget ? [this.livingGreybox.clueTarget] : []),
            ...objects, ...Array.from(this.interactions.values()),
            ...(this.conversations?.targets ?? []), ...chickens], hit => {
            if (hit.type === 'scene') {
                const interaction = this.interactions.get(hit.id);
                if (interaction) {
                    for (const action of interaction.config.actions) this.interactions.get(action.objectId)?.setState(action.state);
                    this.applyInteractionVisibility(objects);
                    this.hintManager?.clear();
                    const revealed = config.hiddenObjects.find(item => item.visibleCondition?.objectId === hit.id &&
                        !this.foundHiddenObjectIds.has(item.id));
                    if (revealed) this.showStickerClue(revealed.id);
                    if (this.stickerClueLabel) this.stickerClueLabel.string = revealed
                        ? `${revealed.displayName ?? revealed.id}露出来了，点一下收进手账。`
                        : '打开了，再仔细看看里面。';
                    this.onProgress?.(this.taskManager!.getProgress());
                    return;
                }
                this.livingGreybox?.showSceneClue(hit.id);
                return;
            }
            let newlyDiscovered: boolean;
            if (hit.type === 'hiddenObject') {
                newlyDiscovered = !this.foundHiddenObjectIds.has(hit.id);
                this.foundHiddenObjectIds.add(hit.id);
                this.foundCount = this.foundHiddenObjectIds.size;
                if (newlyDiscovered && this.isLivingCity) {
                    const object = objects.find(item => item.node.name === hit.id);
                    if (object) this.startCollectionFlight(hit.id, object);
                }
            }
            else {
                this.lastChickenClickedId = hit.id;
                newlyDiscovered = !this.discoveredChickens.has(hit.id);
                this.discoveredChickens.add(hit.id);
                if (newlyDiscovered) this.markChickenDiscovered(chickens.find(chicken => chicken.node.name === hit.id));
            }
            const update = this.taskManager?.handleTargetClicked(hit);
            if (update?.completedTaskIds.length) this.renderTaskPanel();
            if (newlyDiscovered && hit.type === 'hiddenObject') this.hideWelcomePrompt();
            if (update?.completedTaskIds.length) this.conversations?.dismiss();
            if (update && (newlyDiscovered || update.completedTaskIds.length)) this.onProgress?.(update.progress);
        }, (x, y) => isBlocked(x, y) || this.isOverWelcomePrompt(x, y) || (this.stickers.length > STICKERS_PER_PAGE &&
            (this.collectionFlights.size > 0 || this.collectionLandingAnimations > 0)),
        (x, y) => this.showMissedTapFeedback(x, y));
        this.createWelcomePrompt();
        this.resizeDisplay();
    }

    protected update(): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        if (!size || (size.width === this.lastWidth && size.height === this.lastHeight)) return;
        this.resizeDisplay();
    }

    protected lateUpdate(deltaTime: number): void {
        if (this.welcomePrompt?.active) {
            this.welcomeSeconds += Math.max(0, deltaTime);
            if (this.welcomeSeconds >= 16) this.hideWelcomePrompt();
        }
        this.livingGreybox?.update(deltaTime);
        this.teaEvent?.update(deltaTime);
        this.sceneDepth?.sort();
        this.conversations?.update(deltaTime);
        this.hintManager?.update(deltaTime);
        const hint = this.hintManager?.active ?? null;
        this.hintPanel?.update(hint, deltaTime);
        // Keep edge targets reachable while the hint is visible; restore the list afterward.
        if (this.taskPanel) this.taskPanel.active = !hint;
        this.updateMapBottomInset();
        if (!hint) this.positionStreetHintButton();
    }

    public requestHint(): void {
        if (!this.hintsEnabled || this.disposed || !this.node.activeInHierarchy) return;
        if (this.collectionFlights.size > 0 || this.collectionLandingAnimations > 0) return;
        this.cancelGestures();
        this.livingGreybox?.dismissClue();
        this.conversations?.dismiss();
        const result = this.hintManager?.requestHint(this.selectedStickerId);
        if (!result) return;
        if (result.status === 'shown') this.controller?.focusAt(result.hint.position.x, result.hint.position.y);
        this.hintPanel?.showResult(result);
        if (this.taskPanel) this.taskPanel.active = result.status !== 'shown';
        this.positionStreetHintButton();
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
        const interactiveStates: Record<string, string> = {};
        this.interactions.forEach((item, id) => { interactiveStates[id] = item.state; });
        return {
            completedTaskIds: this.taskManager.getCompletedTaskIds(),
            foundHiddenObjectIds: this.cityConfig.hiddenObjects
                .filter(item => this.foundHiddenObjectIds.has(item.id)).map(item => item.id),
            discoveredChickenIds: this.cityConfig.chickens
                .filter(item => this.discoveredChickens.has(item.id)).map(item => item.id),
            interactiveStates,
            sceneDiscoveryIds: Array.from(this.sceneDiscoveryIds),
        };
    }

    private applyInteractionVisibility(objects: readonly HiddenObject[]): void {
        for (const item of this.cityConfig?.hiddenObjects ?? []) {
            if (!item.visibleCondition) continue;
            const visible = this.interactions.get(item.visibleCondition.objectId)?.state === item.visibleCondition.state;
            objects.find(object => object.node.name === item.id)?.setVisible(visible);
        }
    }

    /** Defer end-of-city overlays until collected objects finish entering the tray. */
    public afterCollectionFlight(callback: () => void): void {
        if (this.disposed) return;
        if (this.collectionFlights.size === 0 && this.collectionLandingAnimations === 0) callback();
        else this.collectionCompletionCallbacks.push(callback);
    }

    public cancelGestures(): void {
        this.targetInput?.cancelGestures();
        this.controller?.cancelGestures();
        this.stickerTouches.clear();
        this.stickerMousePress = null;
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
        this.detachStickerInput();
        for (const flight of this.collectionFlights.values()) {
            Tween.stopAllByTarget(flight);
            if (flight.isValid) flight.destroy();
        }
        this.collectionFlights.clear();
        this.collectionLandingAnimations = 0;
        this.collectionCompletionCallbacks.length = 0;
        this.stickerCards.clear();
        if (this.welcomePrompt?.isValid) this.welcomePrompt.destroy();
        this.welcomePrompt = null;
        this.stickerPageLabel = null;
        if (this.missedTapFeedback?.isValid) {
            const opacity = this.missedTapFeedback.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            this.missedTapFeedback.destroy();
        }
        this.missedTapFeedback = null;
        this.blocksExternalInput = null;
        this.interactions.clear();
        this.stickerClueLabel = null;
        this.conversations?.dispose();
        this.conversations = null;
        this.teaEvent?.dispose();
        this.teaEvent = null;
        this.livingGreybox?.dispose();
        this.livingGreybox = null;
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
        this.sceneDiscoveryIds.clear();
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
        if (this.viewportBackground) {
            this.viewportBackground.node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        }
        this.controller?.resizeIfNeeded();
        this.hintPanel?.resize();
        this.conversations?.resize();
        this.layoutWelcomePrompt(size);
        const panel = this.taskPanel;
        const graphics = this.taskPanelGraphics;
        if (!panel || !graphics) return;
        const portrait = size.height > size.width;
        const greybox = this.isLivingCity;
        const trial = this.cityConfig?.cityId === 'winter_market_block_trial_001';
        const compact = this.cityConfig?.cityId === 'demo_city';
        const margin = portrait ? 18 : 12;
        const width = portrait ? Math.max(280, size.width - margin * 2) : Math.min(400, Math.max(280, size.width - 24));
        const height = greybox ? (portrait ? width * 0.51 : 264) : trial ? (portrait ? 200 : 116)
            : compact ? (portrait ? 390 : 182) : (portrait ? 590 : 268);
        panel.setPosition(-size.width / 2 + width / 2 + margin,
            ((trial || greybox) ? -size.height / 2 + height / 2 + margin : size.height / 2 - height / 2 - margin), 0);
        panel.getComponent(UITransform)?.setContentSize(width, height);
        if (graphics instanceof Graphics) {
        graphics.clear();
        graphics.fillColor = greybox ? new Color(255, 246, 221, 255)
            : new Color(255, 250, 235, trial ? 225 : compact ? 218 : 238);
        if (greybox) graphics.roundRect(-width / 2, -height / 2, width, height, 18);
        else graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(87, 73, 84, 255);
        if (greybox) graphics.roundRect(-width / 2, -height / 2, width, height, 18);
        else graphics.rect(-width / 2, -height / 2, width, height);
        graphics.stroke();
        }
        const padding = greybox ? width * 0.045 : portrait ? 30 : 16;
        if (this.taskTitleLabel) {
            this.taskTitleLabel.fontSize = greybox ? (portrait ? width * 0.038 : 20) : trial ? (portrait ? 34 : 24)
                : compact ? (portrait ? 62 : 28) : (portrait ? 70 : 32);
            this.taskTitleLabel.lineHeight = greybox ? (portrait ? width * 0.05 : 28) : trial ? (portrait ? 42 : 29)
                : compact ? (portrait ? 72 : 34) : (portrait ? 82 : 38);
            this.taskTitleLabel.node.setPosition(-width / 2 + padding,
                height / 2 - (greybox ? (portrait ? width * 0.025 : 15) : trial ? 14 : portrait ? 27 : 14), 0);
            this.taskTitleLabel.node.getComponent(UITransform)?.setContentSize(width - padding * 2,
                greybox ? (portrait ? width * 0.06 : 29) : trial ? (portrait ? 48 : 30) : portrait ? 90 : 46);
            if (greybox) this.taskTitleLabel.node.getComponent(UITransform)?.setContentSize(
                width * 0.48, portrait ? width * 0.06 : 29);
        }
        if (this.taskItemsLabel) {
            this.taskItemsLabel.fontSize = greybox ? (portrait ? 44 : 25) : trial ? (portrait ? 28 : 19)
                : compact ? (portrait ? 52 : 24) : (portrait ? 58 : 28);
            this.taskItemsLabel.lineHeight = greybox ? (portrait ? 52 : 31) : trial ? (portrait ? 39 : 24)
                : compact ? (portrait ? 68 : 32) : (portrait ? 80 : 37);
            this.taskItemsLabel.node.setPosition(-width / 2 + padding, height / 2 -
                (greybox ? (portrait ? 90 : 55) : trial ? (portrait ? 66 : 43) : portrait ? 119 : 61), 0);
            this.taskItemsLabel.node.getComponent(UITransform)?.setContentSize(width - padding * 2,
                height - (greybox ? (portrait ? 96 : 59) : trial ? (portrait ? 72 : 48) : portrait ? 135 : 70));
        }
        if (greybox) {
            this.layoutStickerCards(width, height, portrait);
            this.positionStreetHintButton();
            this.updateMapBottomInset();
        }
    }

    private updateMapBottomInset(): void {
        const view = this.node.getComponent(UITransform);
        const panel = this.taskPanel;
        const reserve = this.isLivingCity &&
            view && view.height > view.width && panel?.activeInHierarchy
            ? (panel.getComponent(UITransform)?.height ?? 0) + 18 : 0;
        this.controller?.setBottomInset(reserve);
    }

    private createTaskPanel(): void {
        const panel = new Node('TaskPanel');
        this.node.addChild(panel);
        panel.addComponent(UITransform);
        this.taskPanelGraphics = this.isLivingCity
            ? generatedUi(panel, 'ui_journal_panel_v17', this.artBundle!, false) : panel.addComponent(Graphics);
        this.taskPanel = panel;

        const title = new Node('TaskTitle');
        panel.addChild(title);
        title.addComponent(UITransform).setAnchorPoint(0, 1);
        const titleLabel = title.addComponent(Label);
        titleLabel.fontSize = 32;
        titleLabel.isBold = this.isLivingCity;
        titleLabel.lineHeight = 38;
        titleLabel.color = new Color(75, 54, 39, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.TOP;
        this.taskTitleLabel = titleLabel;

        if (this.isLivingCity) {
            const badge = new Node('JournalProgress');
            panel.addChild(badge);
            badge.addComponent(UITransform);
            generatedUi(badge, 'ui_journal_card_v17', this.artBundle!).color = new Color(219, 233, 209, 255);
            const count = new Node('Count');
            badge.addChild(count);
            count.addComponent(UITransform);
            const label = count.addComponent(Label);
            label.color = new Color(67, 91, 57, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.SHRINK;
            this.journalProgressLabel = label;
            this.createStickerCards(panel);
            this.attachStickerInput();
        } else {
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
        }
        this.renderTaskPanel();
    }

    private renderTaskPanel(): void {
        const manager = this.taskManager;
        if (!manager || !this.taskTitleLabel) return;
        const progress = manager.getProgress();
        if (this.isLivingCity) {
            this.taskTitleLabel.string = '寻物手账';
            if (this.journalProgressLabel) this.journalProgressLabel.string = `已找到 ${Math.max(0, progress.requiredCompleted - this.collectionFlights.size)}/${progress.requiredTotal}`;
            this.taskTitleLabel.overflow = Label.Overflow.SHRINK;
            const states = manager.getTaskStates();
            for (const sticker of this.stickers) {
                const completed = states.some(state => state.config.type === 'hiddenObject' &&
                    state.config.targetId === sticker.id && state.completed);
                const card = this.stickerCards.get(sticker.id);
                if (card) this.drawStickerCard(card, completed && !this.collectionFlights.has(sticker.id),
                    sticker.id === this.selectedStickerId);
                if (completed && sticker.id === this.selectedStickerId && !this.collectionFlights.has(sticker.id)) {
                    this.selectedStickerId = null;
                    if (this.stickerClueLabel) this.stickerClueLabel.string = `${sticker.name}已收进手账，接着慢慢找。`;
                }
            }
            if (progress.allRequiredComplete && this.stickerClueLabel) {
                this.stickerClueLabel.string = '小东西都找齐了，可以再逛一会儿。';
            }
            return;
        }
        if (!this.taskItemsLabel) return;
        this.taskTitleLabel.string = this.cityConfig?.cityId === 'demo_city'
            ? `雪灯街市 · ${progress.requiredCompleted}/${progress.requiredTotal}`
            : this.cityConfig?.cityId === 'winter_market_block_trial_001'
                ? `街区试样 · ${progress.requiredCompleted}/${progress.requiredTotal}`
                : `探索目标 ${progress.requiredCompleted} / ${progress.requiredTotal}`;
        this.taskItemsLabel.string = manager.getTaskStates()
            .map(state => `${state.completed ? '✓' : '○'} ${state.config.label}${state.config.required ? '' : '（隐藏）'}`)
            .join('\n');
    }

    private createStickerCards(panel: Node): void {
        const cluePaper = new Node('CluePaper');
        panel.addChild(cluePaper);
        cluePaper.addComponent(UITransform);
        generatedUi(cluePaper, 'ui_journal_card_v17', this.artBundle!).color = new Color(245, 238, 215, 255);
        this.journalCluePaper = cluePaper;
        const clueNode = new Node('StickerClue');
        panel.addChild(clueNode);
        clueNode.addComponent(UITransform).setAnchorPoint(0, 1);
        const clue = clueNode.addComponent(Label);
        clue.color = new Color(112, 78, 53, 255);
        clue.horizontalAlign = Label.HorizontalAlign.LEFT;
        clue.verticalAlign = Label.VerticalAlign.CENTER;
        clue.overflow = Label.Overflow.SHRINK;
        clue.string = '点卡片看线索，卡住时点「帮我找」。';
        this.stickerClueLabel = clue;

        const pageNode = new Node('StickerPages');
        panel.addChild(pageNode);
        pageNode.addComponent(UITransform);
        const page = pageNode.addComponent(Label);
        page.color = new Color(117, 103, 79, 255);
        page.horizontalAlign = Label.HorizontalAlign.CENTER;
        page.verticalAlign = Label.VerticalAlign.CENTER;
        page.overflow = Label.Overflow.SHRINK;
        this.stickerPageLabel = page;

        for (const sticker of this.stickers) {
            const cardNode = new Node(`Sticker_${sticker.id}`);
            panel.addChild(cardNode);
            cardNode.addComponent(UITransform);
            const background = generatedUi(cardNode, 'ui_journal_card_v17', this.artBundle!, false);

            const artNode = new Node('ItemArt');
            cardNode.addChild(artNode);
            artNode.addComponent(UITransform);
            const icon = artNode.addComponent(Sprite);
            icon.sizeMode = Sprite.SizeMode.CUSTOM;
            icon.trim = false;

            const nameNode = new Node('ItemName');
            cardNode.addChild(nameNode);
            nameNode.addComponent(UITransform);
            const name = nameNode.addComponent(Label);
            const shortNames: Record<string, string> = { reading_glasses: '眼镜', postcard: '明信片',
                tiny_camera: '相机', garden_glove: '手套', picnic_cookie: '曲奇' };
            name.string = shortNames[sticker.id] ?? sticker.name;
            name.color = new Color(72, 54, 41, 255);
            name.horizontalAlign = Label.HorizontalAlign.CENTER;
            name.verticalAlign = Label.VerticalAlign.CENTER;
            name.overflow = Label.Overflow.SHRINK;

            const checkNode = new Node('CollectedMark');
            cardNode.addChild(checkNode);
            checkNode.addComponent(UITransform);
            const check = checkNode.addComponent(Label);
            check.string = '✓';
            check.color = new Color(89, 140, 87, 255);
            check.horizontalAlign = Label.HorizontalAlign.CENTER;
            check.verticalAlign = Label.VerticalAlign.CENTER;
            checkNode.active = false;

            const card: StickerCard = { node: cardNode, background, icon, name, check, collected: false, iconSize: 0 };
            this.stickerCards.set(sticker.id, card);
            this.loadPrototypeFrame(`targets/${sticker.id}/spriteFrame`, frame => {
                if (cardNode.isValid) {
                    icon.spriteFrame = frame;
                    this.fitStickerIcon(card);
                }
            });
        }
    }

    private layoutStickerCards(width: number, height: number, portrait: boolean): void {
        const inset = portrait ? width * 0.035 : 14;
        const gap = portrait ? width * 0.012 : 6;
        const columns = 6;
        const cardWidth = (width - inset * 2 - gap * (columns - 1)) / columns;
        const cardHeight = portrait ? width * 0.14 : 70;
        const pageCount = Math.max(1, Math.ceil(this.stickers.length / STICKERS_PER_PAGE));
        this.stickerPage = Math.min(this.stickerPage, pageCount - 1);
        const progress = this.journalProgressLabel;
        if (progress) {
            const badge = progress.node.parent!;
            const badgeWidth = width * (pageCount > 1 ? 0.28 : 0.31);
            const badgeHeight = portrait ? width * 0.063 : 30;
            badge.setPosition(width * (pageCount > 1 ? 0.07 : 0.30), height / 2 - (portrait ? width * 0.052 : 29), 0);
            badge.getComponent(UITransform)?.setContentSize(badgeWidth, badgeHeight);
            progress.node.getComponent(UITransform)?.setContentSize(badgeWidth - 12, badgeHeight - 4);
            progress.fontSize = portrait ? width * 0.031 : 15;
            progress.lineHeight = portrait ? width * 0.043 : 21;
        }
        if (this.stickerPageLabel) {
            const page = this.stickerPageLabel;
            page.node.active = pageCount > 1;
            page.string = `‹  ${this.stickerPage + 1}/${pageCount}  ›`;
            page.fontSize = portrait ? width * 0.034 : 18;
            page.lineHeight = portrait ? width * 0.045 : 24;
            page.node.setPosition(width * 0.36, height / 2 - (portrait ? width * 0.039 : 25), 0);
            page.node.getComponent(UITransform)?.setContentSize(width * 0.25, portrait ? width * 0.075 : 40);
        }
        const clue = this.stickerClueLabel;
        this.journalCluePaper?.setPosition(0, -height / 2 + (portrait ? width * 0.063 : 31), 0);
        this.journalCluePaper?.getComponent(UITransform)?.setContentSize(width - inset * 2, portrait ? width * 0.098 : 49);
        if (clue) {
            clue.fontSize = portrait ? width * 0.035 : 16;
            clue.lineHeight = portrait ? width * 0.043 : 20;
            clue.node.setPosition(-width / 2 + width * 0.052, -height / 2 + (portrait ? width * 0.108 : 53), 0);
            clue.node.getComponent(UITransform)?.setContentSize(width * 0.896, portrait ? width * 0.09 : 44);
        }
        this.stickers.forEach((sticker, index) => {
            const card = this.stickerCards.get(sticker.id);
            if (!card) return;
            card.node.active = Math.floor(index / STICKERS_PER_PAGE) === this.stickerPage;
            const pageIndex = index % STICKERS_PER_PAGE;
            const column = pageIndex % columns;
            const x = -width / 2 + inset + cardWidth / 2 + column * (cardWidth + gap);
            const y = height / 2 - (portrait ? width * 0.16 : 84) - Math.floor(pageIndex / columns) * (cardHeight + gap);
            card.node.setPosition(x, y, 0);
            card.node.getComponent(UITransform)?.setContentSize(cardWidth, cardHeight);
            const artSize = portrait ? Math.min(width * 0.087, cardWidth - 18) : Math.min(42, cardWidth - 12);
            card.iconSize = artSize;
            this.fitStickerIcon(card);
            if (portrait) {
                card.icon.node.setPosition(0, width * 0.02, 0);
                card.name.node.setPosition(0, -width * 0.041, 0);
                card.name.node.getComponent(UITransform)?.setContentSize(cardWidth - 6, width * 0.044);
                card.name.fontSize = width * 0.032;
                card.name.lineHeight = width * 0.041;
            } else {
                card.icon.node.setPosition(0, 8, 0);
                card.name.node.setPosition(0, -21, 0);
                card.name.node.getComponent(UITransform)?.setContentSize(cardWidth - 8, 25);
                card.name.fontSize = 17;
                card.name.lineHeight = 21;
            }
            const markSize = portrait ? width * 0.04 : 20;
            card.check.node.setPosition(cardWidth / 2 - markSize * 0.6, cardHeight / 2 - markSize * 0.6, 0);
            card.check.node.getComponent(UITransform)?.setContentSize(markSize, markSize);
            card.check.fontSize = markSize * 0.85;
            card.check.lineHeight = markSize;
        });
        this.renderTaskPanel();
    }

    private fitStickerIcon(card: StickerCard): void {
        if (card.iconSize <= 0) return;
        const size = card.icon.spriteFrame?.originalSize;
        const width = size?.width || 1;
        const height = size?.height || 1;
        const fit = card.iconSize / Math.max(width, height);
        card.icon.node.getComponent(UITransform)?.setContentSize(width * fit, height * fit);
    }

    private drawStickerCard(card: StickerCard, completed: boolean, selected = false): void {
        const size = card.node.getComponent(UITransform)?.contentSize;
        if (!size || size.width <= 0 || size.height <= 0) return;
        // Searching depends on recognizing the object, so keep its actual colors
        // visible before collection. State belongs to the soft card and check mark.
        card.background.enabled = true;
        card.background.color = completed ? new Color(215, 235, 200, 255)
            : selected ? new Color(255, 218, 144, 255) : Color.WHITE;
        card.icon.color = Color.WHITE;
        card.name.color = completed ? new Color(87, 112, 72, 255) : new Color(72, 54, 41, 255);
        card.check.node.active = completed;
        card.collected = completed;
    }

    private startCollectionFlight(id: string, object: HiddenObject): void {
        this.showStickerPageFor(id);
        const card = this.stickerCards.get(id);
        const rootTransform = this.node.getComponent(UITransform);
        const destination = card?.icon.node.getComponent(UITransform);
        const artNode = object.node.getChildByName('PropArt') ?? object.node;
        const source = artNode.getComponent(UITransform);
        const frame = artNode.getComponent(Sprite)?.spriteFrame ?? card?.icon.spriteFrame;
        if (!card || !rootTransform || !destination || !source || !frame || this.collectionFlights.has(id)) return;
        this.hintManager?.clear();
        this.hintPanel?.update(null);
        if (this.taskPanel) this.taskPanel.active = true;

        // Capture both ends in the common UI root's coordinates. The new sprite
        // is outside TestMap, so further map panning or zooming cannot pull it
        // away from the tray while it flies.
        const start = rootTransform.convertToNodeSpaceAR(source.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
        const end = rootTransform.convertToNodeSpaceAR(destination.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
        const visualWidth = source.width || this.targetSize(id).width;
        const visualHeight = source.height || this.targetSize(id).height;
        const startScale = new Vec3(Math.abs(artNode.worldScale.x) / (Math.abs(this.node.worldScale.x) || 1),
            Math.abs(artNode.worldScale.y) / (Math.abs(this.node.worldScale.y) || 1), 1);
        const flight = new Node(`CollectionFly_${id}`);
        this.node.addChild(flight);
        flight.addComponent(UITransform).setContentSize(visualWidth, visualHeight);
        const sprite = flight.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;
        flight.setPosition(start);
        flight.setScale(startScale);
        this.collectionFlights.set(id, flight);

        tween(flight).to(0.60, {
            position: end,
        }, {
            easing: 'sineInOut',
            onUpdate: (_target, ratio) => {
                if (!flight.isValid) return;
                const t = Math.min(1, Math.max(0, ratio ?? 0));
                const u = 1 - t;
                // A resized viewport can move the tray while this sprite is airborne.
                const currentEnd = rootTransform.convertToNodeSpaceAR(destination.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
                const controlX = start.x + (currentEnd.x - start.x) * 0.34;
                const controlY = Math.max(start.y, currentEnd.y) +
                    Math.min(105, Math.max(45, Math.abs(currentEnd.y - start.y) * 0.15));
                flight.setPosition(u * u * start.x + 2 * u * t * controlX + t * t * currentEnd.x,
                    u * u * start.y + 2 * u * t * controlY + t * t * currentEnd.y, 0);
                const endScaleX = Math.abs(card.icon.node.worldScale.x) /
                    (Math.abs(this.node.worldScale.x) || 1) * destination.width / visualWidth;
                const endScaleY = Math.abs(card.icon.node.worldScale.y) /
                    (Math.abs(this.node.worldScale.y) || 1) * destination.height / visualHeight;
                flight.setScale(startScale.x + (endScaleX - startScale.x) * t,
                    startScale.y + (endScaleY - startScale.y) * t, 1);
            },
        }).call(() => {
            if (flight.isValid) flight.destroy();
            this.collectionFlights.delete(id);
            if (this.disposed) return;
            this.renderTaskPanel();
            if (card.icon.node.isValid) {
                Tween.stopAllByTarget(card.icon.node);
                this.collectionLandingAnimations += 1;
                card.icon.node.setScale(0.84, 0.84, 1);
                tween(card.icon.node).to(0.12, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' })
                    .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
                    .call(() => {
                        this.collectionLandingAnimations -= 1;
                        this.flushCollectionCompletionCallbacks();
                    }).start();
            }
            this.flushCollectionCompletionCallbacks();
        }).start();
    }

    private flushCollectionCompletionCallbacks(): void {
        if (this.disposed || this.collectionFlights.size > 0 || this.collectionLandingAnimations > 0) return;
        const callbacks = this.collectionCompletionCallbacks.splice(0);
        callbacks.forEach(callback => callback());
    }

    private positionStreetHintButton(): void {
        if (!this.isLivingCity || this.hintManager?.active) return;
        const viewport = this.node.getComponent(UITransform)?.contentSize;
        const panel = this.taskPanel;
        const hint = this.hintPanel?.root;
        if (!viewport || !panel || !hint || viewport.height <= viewport.width) return;
        const height = panel.getComponent(UITransform)?.height ?? 0;
        const scale = hint.scale.x;
        const feedback = this.hintPanel?.hasTransientFeedback;
        hint.setPosition(feedback ? 0 : viewport.width / 2 - 18 - 80 * scale,
            panel.position.y + height / 2 + 8 + (feedback ? 37 : 31) * scale, 0);
    }

    private showMissedTapFeedback(uiX: number, uiY: number): void {
        if (!this.isLivingCity || this.disposed) return;
        const root = this.node.getComponent(UITransform);
        if (!root) return;
        let feedback = this.missedTapFeedback;
        if (!feedback) {
            feedback = new Node('MissedTapFeedback');
            this.node.addChild(feedback);
            feedback.addComponent(UITransform).setContentSize(260, 52);
            feedback.addComponent(UIOpacity);
            const label = feedback.addComponent(Label);
            label.string = '不急，慢慢找。';
            label.fontSize = 30;
            label.lineHeight = 40;
            label.color = new Color(117, 91, 71, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            this.missedTapFeedback = feedback;
        }
        const point = root.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const trayTop = this.taskPanel?.activeInHierarchy
            ? this.taskPanel.position.y + (this.taskPanel.getComponent(UITransform)?.height ?? 0) / 2 + 32
            : -root.height / 2 + 32;
        feedback.setPosition(Math.min(root.width / 2 - 130, Math.max(-root.width / 2 + 130, point.x)),
            Math.min(root.height / 2 - 36, Math.max(trayTop, point.y + 36)), 0);
        feedback.active = true;
        const opacity = feedback.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity).to(0.08, { opacity: 210 }).delay(0.42).to(0.20, { opacity: 0 })
            .call(() => { if (feedback?.isValid) feedback.active = false; }).start();
    }

    private relayoutStickerPage(): void {
        const size = this.taskPanel?.getComponent(UITransform)?.contentSize;
        const viewport = this.node.getComponent(UITransform)?.contentSize;
        if (size && viewport) this.layoutStickerCards(size.width, size.height, viewport.height > viewport.width);
    }

    private showStickerPageFor(id: string): void {
        const index = this.stickers.findIndex(sticker => sticker.id === id);
        if (index < 0) return;
        const page = Math.floor(index / STICKERS_PER_PAGE);
        if (this.stickerPage === page) return;
        this.stickerPage = page;
        this.relayoutStickerPage();
    }

    private changeStickerPage(direction: number): void {
        // Keep the destination stable until every sprite has landed in the tray.
        if (this.collectionFlights.size > 0 || this.collectionLandingAnimations > 0) return;
        const pages = Math.max(1, Math.ceil(this.stickers.length / STICKERS_PER_PAGE));
        const page = Math.max(0, Math.min(pages - 1, this.stickerPage + direction));
        if (page === this.stickerPage) return;
        this.stickerPage = page;
        this.relayoutStickerPage();
    }

    private stickerPageDirectionAt(uiX: number, uiY: number): number {
        if (!this.isOverTaskPanel(uiX, uiY) || this.blocksExternalInput?.(uiX, uiY) ||
            this.hintPanel?.blocksInput(uiX, uiY)) return 0;
        const page = this.stickerPageLabel?.node;
        const transform = page?.getComponent(UITransform);
        if (!page?.activeInHierarchy || !transform) return 0;
        const point = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        if (Math.abs(point.x) > transform.width / 2 || Math.abs(point.y) > transform.height / 2) return 0;
        return point.x < 0 ? -1 : 1;
    }

    private stickerAt(uiX: number, uiY: number): string | null {
        if (!this.isOverTaskPanel(uiX, uiY) || this.blocksExternalInput?.(uiX, uiY) ||
            this.hintPanel?.blocksInput(uiX, uiY)) return null;
        for (const [id, card] of this.stickerCards) {
            const transform = card.node.getComponent(UITransform);
            if (!card.node.activeInHierarchy || !transform) continue;
            const point = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
            if (Math.abs(point.x) <= transform.width / 2 && Math.abs(point.y) <= transform.height / 2) return id;
        }
        return null;
    }

    private showStickerClue(id: string): void {
        const sticker = this.stickers.find(item => item.id === id);
        if (!sticker || !this.stickerClueLabel) return;
        const found = this.taskManager?.getTaskStates().some(state => state.config.type === 'hiddenObject' &&
            state.config.targetId === id && state.completed);
        this.selectedStickerId = found ? null : id;
        this.renderTaskPanel();
        this.stickerClueLabel.string = found ? this.taskManager?.getProgress().allRequiredComplete
            ? '小东西都找齐了，可以再逛一会儿。' : `${sticker.name}已收进手账，接着慢慢找。`
            : `${sticker.name}：${sticker.clue}`;
    }

    /** A short, optional introduction. Found IDs already distinguish returning players. */
    private createWelcomePrompt(): void {
        if (this.cityConfig?.cityId !== 'living_city_street_block_01' || this.foundCount > 0) return;
        const prompt = new Node('ExplorationWelcome');
        this.node.addChild(prompt);
        prompt.addComponent(UITransform);
        generatedUi(prompt, 'ui_journal_card_v17', this.artBundle!).color = new Color(249, 243, 226, 245);
        const titleNode = new Node('WelcomeTitle');
        prompt.addChild(titleNode);
        titleNode.addComponent(UITransform);
        const title = titleNode.addComponent(Label);
        title.string = `${this.cityConfig.cityName} · 找回 ${this.stickers.length} 件小东西`;
        title.isBold = true;
        title.color = new Color(75, 54, 39, 255);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        title.overflow = Label.Overflow.SHRINK;
        const bodyNode = new Node('WelcomeBody');
        prompt.addChild(bodyNode);
        bodyNode.addComponent(UITransform);
        const body = bodyNode.addComponent(Label);
        body.string = '拖动逛街，双指缩放；点物品收集。\n不计时，点手账卡片看线索。';
        body.color = new Color(105, 83, 62, 255);
        body.horizontalAlign = Label.HorizontalAlign.CENTER;
        body.verticalAlign = Label.VerticalAlign.CENTER;
        body.overflow = Label.Overflow.SHRINK;
        this.welcomePrompt = prompt;
        this.welcomeSeconds = 0;
    }

    private layoutWelcomePrompt(size: Size): void {
        const prompt = this.welcomePrompt;
        if (!prompt) return;
        const portrait = size.height > size.width;
        const width = portrait ? size.width - 36 : Math.min(540, size.width - 36);
        const height = portrait ? width * 0.22 : 108;
        prompt.getComponent(UITransform)?.setContentSize(width, height);
        prompt.setPosition(portrait ? 0 : size.width / 2 - width / 2 - 18,
            size.height / 2 - (portrait ? size.width * 0.14 : 18) - height / 2, 0);
        const title = prompt.getChildByName('WelcomeTitle')!;
        title.setPosition(0, height * 0.27, 0);
        title.getComponent(UITransform)?.setContentSize(width * 0.91, height * 0.29);
        const titleLabel = title.getComponent(Label)!;
        titleLabel.fontSize = portrait ? width * 0.042 : 24;
        titleLabel.lineHeight = portrait ? width * 0.05 : 30;
        const body = prompt.getChildByName('WelcomeBody')!;
        body.setPosition(0, -height * 0.16, 0);
        body.getComponent(UITransform)?.setContentSize(width * 0.91, height * 0.54);
        const bodyLabel = body.getComponent(Label)!;
        bodyLabel.fontSize = portrait ? width * 0.038 : 19;
        bodyLabel.lineHeight = portrait ? width * 0.046 : 25;
    }

    private hideWelcomePrompt(): void {
        if (this.welcomePrompt) this.welcomePrompt.active = false;
    }

    /** The paper can be dragged across, but taps must not collect art hidden behind it. */
    private isOverWelcomePrompt(uiX: number, uiY: number): boolean {
        const prompt = this.welcomePrompt;
        const transform = prompt?.getComponent(UITransform);
        if (!prompt?.activeInHierarchy || !transform) return false;
        const point = transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        return Math.abs(point.x) <= transform.width / 2 && Math.abs(point.y) <= transform.height / 2;
    }

    /** Offer one existing, uncovered object, without changing its ID, placement or task. */
    private offerFirstFind(): void {
        if (this.disposed || this.cityConfig?.cityId !== 'living_city_street_block_01' ||
            this.foundCount > 0 || this.selectedStickerId) return;
        const item = this.cityConfig.hiddenObjects.find(target => target.targetable && !target.visibleCondition);
        if (!item) return;
        this.showStickerClue(item.id);
        this.controller?.focusAt((item.x - 0.5) * this.cityConfig.mapSize.width,
            (item.y - 0.5) * this.cityConfig.mapSize.height);
    }

    private attachStickerInput(): void {
        if (this.stickerInputAttached) return;
        this.stickerInputAttached = true;
        input.on(Input.EventType.TOUCH_START, this.onStickerTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onStickerTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onStickerTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onStickerTouchCancel, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onStickerMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onStickerMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onStickerMouseUp, this);
    }

    private detachStickerInput(): void {
        if (!this.stickerInputAttached) return;
        this.stickerInputAttached = false;
        input.off(Input.EventType.TOUCH_START, this.onStickerTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onStickerTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onStickerTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onStickerTouchCancel, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onStickerMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onStickerMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onStickerMouseUp, this);
        this.stickerTouches.clear();
        this.stickerMousePress = null;
    }

    private onStickerTouchStart(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const point = event.getUILocation();
        this.stickerTouches.set(id, { x: point.x, y: point.y, targetId: this.stickerAt(point.x, point.y),
            eligible: this.stickerTouches.size === 0,
            pagingEligible: this.stickerTouches.size === 0 && this.isOverTaskPanel(point.x, point.y) &&
                !this.blocksExternalInput?.(point.x, point.y) && !this.hintPanel?.blocksInput(point.x, point.y),
            pageDirection: this.stickerPageDirectionAt(point.x, point.y) });
        if (this.stickerTouches.size > 1) this.stickerTouches.forEach(press => {
            press.eligible = false;
            press.pagingEligible = false;
        });
        this.stickerMousePress = null;
    }

    private onStickerTouchMove(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const press = this.stickerTouches.get(id);
        if (press) this.checkStickerMovement(press, event.getUILocation());
    }

    private onStickerTouchEnd(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const press = this.stickerTouches.get(id);
        this.stickerTouches.delete(id);
        if (!press || this.stickerTouches.size > 0) return;
        const point = event.getUILocation();
        this.finishStickerPress(press, point);
    }

    private onStickerTouchCancel(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id !== null) this.stickerTouches.delete(id);
    }

    private onStickerMouseDown(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT || this.stickerTouches.size > 0) return;
        const point = event.getUILocation();
        this.stickerMousePress = { x: point.x, y: point.y, targetId: this.stickerAt(point.x, point.y), eligible: true,
            pagingEligible: this.isOverTaskPanel(point.x, point.y) && !this.blocksExternalInput?.(point.x, point.y) &&
                !this.hintPanel?.blocksInput(point.x, point.y), pageDirection: this.stickerPageDirectionAt(point.x, point.y) };
    }

    private onStickerMouseMove(event: EventMouse): void {
        if (this.stickerMousePress) this.checkStickerMovement(this.stickerMousePress, event.getUILocation());
    }

    private onStickerMouseUp(event: EventMouse): void {
        const press = this.stickerMousePress;
        this.stickerMousePress = null;
        if (!press || event.getButton() !== EventMouse.BUTTON_LEFT || this.stickerTouches.size > 0) return;
        const point = event.getUILocation();
        this.finishStickerPress(press, point);
    }

    private finishStickerPress(press: StickerPress, point: { x: number; y: number }): void {
        if (this.blocksExternalInput?.(point.x, point.y) || this.hintPanel?.blocksInput(point.x, point.y)) return;
        const dx = point.x - press.x;
        const dy = point.y - press.y;
        if (press.pagingEligible && Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            this.changeStickerPage(dx < 0 ? 1 : -1);
            return;
        }
        if (!this.checkStickerMovement(press, point)) return;
        if (press.targetId && press.targetId === this.stickerAt(point.x, point.y)) this.showStickerClue(press.targetId);
        else if (press.pageDirection && press.pageDirection === this.stickerPageDirectionAt(point.x, point.y)) {
            this.changeStickerPage(press.pageDirection);
        }
    }

    private checkStickerMovement(press: StickerPress, point: { x: number; y: number }): boolean {
        if (Math.hypot(point.x - press.x, point.y - press.y) > 12) press.eligible = false;
        return press.eligible;
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
        // Found entities are authoritative. Cached task IDs can refer to an old
        // task definition or reuse a task ID for a different target after an update.
        this.taskManager?.restoreCompletedTaskIds([]);
        for (const id of snapshot.sceneDiscoveryIds ?? []) {
            if (typeof id === 'string' && id.trim()) this.sceneDiscoveryIds.add(id);
        }
        const savedObjects = new Set(Array.isArray(snapshot.foundHiddenObjectIds)
            ? snapshot.foundHiddenObjectIds.filter((id): id is string => typeof id === 'string') : []);
        for (const object of objects) {
            const id = object.node.name;
            if (!savedObjects.has(id) || !this.cityConfig?.hiddenObjects.some(item => item.id === id && item.targetable)) continue;
            object.restoreFound();
            this.foundHiddenObjectIds.add(id);
            this.taskManager?.handleTargetClicked({ type: 'hiddenObject', id,
                tags: this.cityConfig.hiddenObjects.find(item => item.id === id)?.tags ?? [] });
        }
        this.foundCount = this.foundHiddenObjectIds.size;
        const savedChickens = new Set(Array.isArray(snapshot.discoveredChickenIds)
            ? snapshot.discoveredChickenIds.filter((id): id is string => typeof id === 'string') : []);
        for (const chicken of chickens) {
            const id = chicken.node.name;
            if (!savedChickens.has(id) || !this.cityConfig?.chickens.some(item => item.id === id && item.targetable)) continue;
            this.discoveredChickens.add(id);
            this.markChickenDiscovered(chicken);
            this.taskManager?.handleTargetClicked({ type: 'chicken', id,
                tags: this.cityConfig.chickens.find(item => item.id === id)?.tags ?? [] });
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
        const greybox = config.asset.startsWith('greybox_');
        const livingTarget = this.isLivingCity;
        const graphic = livingTarget ? null : node.addComponent(Graphics);
        if (graphic) this.drawTemporaryProp(graphic, config.asset);
        const object = node.addComponent(HiddenObject);
        object.configure(config, mapSize, undefined, livingTarget);
        if (greybox && !livingTarget) return object;
        const artPath = livingTarget ? `targets/${config.id}/spriteFrame`
            : PROTOTYPE_PROPS[config.asset] ?? `${config.asset}/spriteFrame`;
        if (artPath) this.loadPrototypeFrame(artPath, frame => {
            if (!node.isValid) return;
            const visual = new Node('PropArt');
            node.insertChild(visual, 0);
            const hitSize = node.getComponent(UITransform)?.contentSize;
            // The target keeps a finger-sized hit area while market trinkets stay small in the scene.
            const artScale = config.asset.startsWith('winter_item_') ? 0.60
                : config.asset === 'winter_slice_whistle' ? 0.75 : 1;
            const gameSize = livingTarget ? this.targetSize(config.id) : null;
            visual.addComponent(UITransform).setContentSize(gameSize?.width ?? (hitSize?.width ?? 128) * artScale,
                gameSize?.height ?? (hitSize?.height ?? 128) * artScale);
            const sprite = visual.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.trim = false;
            sprite.spriteFrame = frame;
            if (graphic) graphic.enabled = false;
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
