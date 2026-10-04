import { AssetManager, Color, JsonAsset, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, warn } from 'cc';
import { CelAnimationPlayer } from '../character/CelAnimationPlayer';
import type { CelClipName } from '../character/CelAnimationPlayer';
type AmbientChickenHeading = 'side' | 'north' | 'south';
import { loadSceneArtSlot } from './SceneArtSlot';
import { generatedUi } from '../ui/GeneratedUi';
import type { SceneDepthLayer } from './SceneDepthLayer';
import type { TapTarget, TargetClicked } from '../gameplay/TargetInput';
import { nextResidentWaypoint, residentConversationLine, ResidentEventDirector, ResidentIdleRoutine, resolveResidentRequest } from './ResidentLife';
import type { ResidentConversation, ResidentDiscoveryHooks, ResidentEventProp, ResidentRequest, ResidentRouteMode,
    ResidentSceneEvent, SceneDiscoveryPoint } from './ResidentLife';

type Point = { x: number; y: number };
type ArtSlot = { id: string; layer: string; center: Point; size: { width: number; height: number };
    footY?: number; textureScale?: number };
type NpcPlan = { id: string; role: string; actorHeight: number; footRadius: number; route: Point[];
    speedWorldUnitsPerSecond?: number; pauseSecondsAtWaypoints?: Record<string, number>; loop?: boolean;
    idleActions?: string[]; routeMode?: ResidentRouteMode; initialPauseSeconds?: number };
type Blueprint = {
    id: string;
    npcClues?: Record<string, ResidentConversation>;
    map: { width: number; height: number };
    camera: { initialFocus: Point };
    artSlots: ArtSlot[];
    walkableRegions: { id: string; access: string; polygon: number[][] }[];
    physicalFootprints: { id: string; polygon: number[][] }[];
    standingSpots: { id: string; at: Point; access: string; clearRadius: number }[];
    npcPlans: NpcPlan[];
    sceneEvents: ResidentSceneEvent[];
    hiddenObjectSlots: { id: string; supportArtSlotId: string; at: Point }[];
    sceneDiscoveries?: SceneDiscoveryPoint[];
    residentRequests?: ResidentRequest[];
};
type NpcRuntime = { plan: NpcPlan; node: Node; nextIndex: number;
    paused: number; motionSeconds: number; moving: boolean; facing: number; routeDirection: number;
    heading: AmbientChickenHeading; cels: CelAnimationPlayer | null; walkClip: CelClipName;
    turnSeconds: number; idle: ResidentIdleRoutine };

const NPC_CLUES: Record<string, string> = {
    tea_vendor: '这壶茶还温着。\n坐一会儿再走吧。',
    flower_buyer: '我挑了好久，\n还是最喜欢这束花。',
    lantern_watcher: '傍晚灯一亮，\n这里就像另一个小镇。',
    chestnut_seller: '刚出炉的栗子最香，\n小心烫着翅膀。',
};

function label(parent: Node, value: string, x: number, y: number, size = 18): Node {
    const node = new Node(`Label_${value}`);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(Math.max(100, value.length * size), size + 8);
    const text = node.addComponent(Label);
    text.string = value;
    text.fontSize = size;
    text.lineHeight = size + 4;
    text.color = new Color(48, 43, 37, 255);
    return node;
}

/** Generated PNG scene placement, depth, NPC routes and interaction state. */
export class LivingCityGreybox {
    private disposed = false;
    private backRoot: Node | null = null;
    private frontRoot: Node | null = null;
    private npcs: NpcRuntime[] = [];
    private eventSeconds = -1;
    private eventCompleted = false;
    private cupMarker: Node | null = null;
    private eventDirector: ResidentEventDirector | null = null;
    private eventProps: { eventId: string; node: Node; spec: ResidentEventProp }[] = [];
    private ambientFx: Node | null = null;
    private ambientSeconds = 0;
    private clueBubble: Node | null = null;
    private clueText: Label | null = null;
    private clueNpcId: string | null = null;
    private cluePoint: Point | null = null;
    private clueSeconds = 0;
    private debugLabel: Node | null = null;
    private artGroundLoaded = false;
    private blueprint: Blueprint | null = null;
    private readonly conversationTurns = new Map<string, number>();
    private get clues(): Record<string, ResidentConversation> { return this.blueprint?.npcClues ?? NPC_CLUES; }

    /** Same gesture router as the hidden objects, with lower hit priority. */
    public readonly clueTarget: TapTarget = {
        hitTest: (uiX, uiY) => this.clueNpcAt(uiX, uiY) !== null,
        activate: (uiX, uiY): TargetClicked | null => {
            const npc = this.clueNpcAt(uiX, uiY);
            return npc ? { type: 'scene', id: npc.plan.id, tags: ['npc_clue'] } : null;
        },
    };

    /** Facility points share the drag-safe router and sit below collectible/reveal hits. */
    public readonly discoveryTarget: TapTarget = {
        hitTest: (uiX, uiY) => this.discoveryAt(uiX, uiY) !== null,
        activate: (uiX, uiY): TargetClicked | null => {
            const discovery = this.discoveryAt(uiX, uiY);
            return discovery ? { type: 'scene', id: discovery.id, tags: ['scene_discovery'] } : null;
        },
    };

    public constructor(private readonly map: Node, private readonly depth: SceneDepthLayer,
        private readonly bundle: AssetManager.Bundle, private readonly targetNodes: readonly Node[],
        private readonly onReady: (focus: Point) => void,
        blueprintPath = 'street_block_01', cityId = 'living_city_street_block_01',
        private readonly discoveryHooks?: ResidentDiscoveryHooks) {
        this.bundle.load(blueprintPath, JsonAsset, (loadError, asset) => {
            if (this.disposed || !this.map.isValid) return;
            if (loadError || !asset) {
                warn('Living city greybox blueprint unavailable', loadError);
                return;
            }
            const data = asset.json as Blueprint;
            const mapSize = this.map.getComponent(UITransform)?.contentSize;
            if (data?.id !== cityId ||
                !mapSize || data.map?.width !== mapSize.width || data.map?.height !== mapSize.height) {
                warn('Living city greybox blueprint has an unexpected identity or map size');
                return;
            }
            this.blueprint = data;
            this.eventDirector = new ResidentEventDirector(data.sceneEvents ?? []);
            this.draw(data);
            this.onReady(data.camera.initialFocus);
        });
    }

    private draw(data: Blueprint): void {
        const back = new Node('LivingCityGreyboxBack');
        this.map.insertChild(back, 0);
        back.addComponent(UITransform).setContentSize(data.map.width, data.map.height);
        this.backRoot = back;
        const grounds = data.artSlots.filter(slot => slot.layer === 'ground');
        let groundLoadsRemaining = grounds.length;
        // Separate registered PNG nodes retain blueprint order, placement and size.
        // A complete map image can sit beneath transparent district/path overlays.
        for (const ground of grounds) this.drawSlot(back, ground, () => {
            groundLoadsRemaining--;
            this.artGroundLoaded = groundLoadsRemaining === 0;
        });
        for (const slot of data.artSlots.filter(slot => slot.layer === 'building_back' || slot.layer === 'street_back')) {
            this.drawSlot(back, slot);
        }
        for (const slot of data.artSlots.filter(slot => slot.layer === 'depth')) {
            const node = this.drawSlot(this.depth.node, slot);
            this.depth.addActor(node, () => slot.footY ?? slot.center.y, true);
        }
        for (const plan of data.npcPlans) this.addNpc(plan);
        const front = new Node('LivingCityGreyboxOverhead');
        this.map.addChild(front);
        front.addComponent(UITransform).setContentSize(data.map.width, data.map.height);
        this.frontRoot = front;
        for (const slot of data.artSlots.filter(slot => slot.layer === 'overhead' || slot.layer === 'effects')) {
            const node = this.drawSlot(front, slot);
            if (slot.layer === 'effects') { node.addComponent(UIOpacity); this.ambientFx = node; }
        }
        for (const target of data.hiddenObjectSlots) {
            const slot = data.artSlots.find(item => item.id === target.supportArtSlotId);
            if (slot?.layer !== 'overhead') continue;
            const node = this.targetNodes.find(node => node.name === target.id);
            if (node?.isValid) front.addChild(node);
        }
        for (const slot of data.artSlots.filter(slot => slot.layer === 'target_foreground')) this.drawSlot(front, slot);
        this.createEventProps(data, front);
        this.createClueBubble(front);
        this.depth.sort();
    }

    private createEventProps(data: Blueprint, parent: Node): void {
        for (const event of data.sceneEvents ?? []) {
            const teaPoint = data.standingSpots.find(spot => spot.id === 'tea_cup_handoff')?.at;
            const spec: ResidentEventProp | undefined = event.prop ?? (event.id === 'tea_exchange' && teaPoint
                ? { asset: 'event_cup', at: teaPoint, size: { width: 19, height: 19 },
                    visibleFromSeconds: 0.8, visibleUntilSeconds: event.resumeRouteAfterSeconds }
                : undefined);
            if (!spec) continue;
            const path = `${spec.asset}/spriteFrame`;
            if (!this.bundle.getInfoWithPath(path, SpriteFrame)) continue;
            const node = new Node(`EventProp_${event.id}`);
            parent.addChild(node);
            node.setPosition(spec.at.x, spec.at.y, 0);
            node.addComponent(UITransform).setContentSize(spec.size.width, spec.size.height);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.bundle.load(path, SpriteFrame, (_error, frame) => {
                if (!this.disposed && node.isValid && frame) sprite.spriteFrame = frame;
            });
            node.active = false;
            this.eventProps.push({ eventId: event.id, node, spec });
            if (event.id === 'tea_exchange') this.cupMarker = node;
        }
    }

    private clueNpcAt(uiX: number, uiY: number): NpcRuntime | null {
        if (this.disposed || !this.blueprint || !this.map.activeInHierarchy) return null;
        const point = new Vec3(uiX, uiY, 0);
        let nearest: NpcRuntime | null = null;
        let nearestScore = Infinity;
        for (const npc of this.npcs) {
            const hasRequest = this.blueprint.residentRequests?.some(request => request.npcId === npc.plan.id);
            if ((!residentConversationLine(this.clues[npc.plan.id]) && !hasRequest) || !npc.node.isValid) continue;
            const local = npc.node.getComponent(UITransform)?.convertToNodeSpaceAR(point);
            if (local && Math.abs(local.x) <= 42 && local.y >= 0 &&
                local.y <= npc.plan.actorHeight + 10) {
                const halfHeight = npc.plan.actorHeight / 2;
                const score = (local.x / 42) ** 2 + ((local.y - halfHeight) / halfHeight) ** 2;
                // Nearby residents can share a finger-sized bounding edge. Pick
                // the body closest to the tap, rather than the oldest plan ID.
                if (score < nearestScore) { nearest = npc; nearestScore = score; }
            }
        }
        return nearest;
    }

    private discoveryAt(uiX: number, uiY: number): SceneDiscoveryPoint | null {
        if (this.disposed || !this.blueprint || !this.map.activeInHierarchy) return null;
        const local = this.map.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        if (!local) return null;
        return this.blueprint.sceneDiscoveries?.find(point =>
            this.blueprint!.artSlots.some(slot => slot.id === point.supportArtSlotId) &&
            Math.hypot(local.x - point.at.x, local.y - point.at.y) <= point.clickRadiusWorld) ?? null;
    }

    private createClueBubble(parent: Node): void {
        const node = new Node('LivingCityNpcClue');
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(330, 112);
        generatedUi(node, 'ui_panel', this.bundle);
        const textNode = new Node('ClueText');
        node.addChild(textNode);
        textNode.addComponent(UITransform).setContentSize(310, 82);
        const text = textNode.addComponent(Label);
        text.fontSize = 25;
        text.lineHeight = 32;
        text.color = new Color(76, 56, 41, 255);
        text.horizontalAlign = Label.HorizontalAlign.CENTER;
        text.verticalAlign = Label.VerticalAlign.CENTER;
        text.overflow = Label.Overflow.SHRINK;
        this.clueBubble = node;
        this.clueText = text;
        node.active = false;
    }

    public showNpcClue(npcId: string): void {
        const npc = this.npcs.find(item => item.plan.id === npcId);
        if (this.disposed || !npc?.node.isValid || !this.clueBubble?.isValid || !this.clueText) return;
        const request = this.blueprint?.residentRequests?.find(request => request.npcId === npcId);
        const turn = this.conversationTurns.get(npcId) ?? 0;
        let text = residentConversationLine(this.clues[npcId], turn);
        const completedRequest = request ? this.discoveryHooks?.hasDiscovery(request.id) ?? false : false;
        if (request && !completedRequest) {
            const result = resolveResidentRequest(request,
                this.discoveryHooks?.hasFoundTarget(request.requiredTargetId) ?? false,
                this.discoveryHooks?.hasDiscovery(request.id) ?? false);
            text = result.message;
            if (result.discoveryId) this.discoveryHooks?.recordDiscovery(result.discoveryId);
        }
        // Once a delivery is saved, this resident goes back to ordinary chat.
        // Older blueprints without chat lines still retain their thank-you text.
        else if (request && !text) text = request.completionMessage;
        if (!text) return;
        const tapEvent = this.blueprint?.sceneEvents.find(event => event.tapTriggerNpcId === npcId);
        // A chat can appear while art streams in, but a saved activity requires its
        // real generated poses to be available rather than an unseen placeholder.
        if (tapEvent?.actorBeats?.length && tapEvent.actorBeats.every(beat => {
            const actor = this.npcs.find(item => item.plan.id === beat.npcId);
            return actor?.cels?.isReady && actor.cels.supportsClip(beat.clip);
        }) && this.eventDirector?.tryStartByTap(npcId)) {
            // A tap can arrive during the same actor's idle job. Restart its real
            // one-shot cels, while leaving every unrelated active event untouched.
            const actors = new Set(tapEvent.actorBeats.map(beat => beat.npcId));
            for (const id of Array.from(actors)) {
                const actor = this.npcs.find(item => item.plan.id === id);
                const beat = this.eventDirector.actorBeat(id);
                actor?.cels?.setState('idle_w');
                if (beat) {
                    actor?.cels?.setState(beat.clip);
                    if (beat.facing !== undefined) actor?.cels?.setFacing(beat.facing);
                }
            }
        }
        if (!request || completedRequest) this.conversationTurns.set(npcId, turn + 1);
        this.clueNpcId = npcId;
        this.cluePoint = null;
        this.clueSeconds = 4;
        this.clueText.string = text;
        this.clueBubble.active = true;
        this.positionClueBubble(npc);
    }

    public showSceneClue(id: string): void {
        if (this.disposed) return;
        const point = this.blueprint?.sceneDiscoveries?.find(point => point.id === id);
        if (!point) { this.showNpcClue(id); return; }
        if (!this.blueprint?.artSlots.some(slot => slot.id === point.supportArtSlotId) ||
            !this.clueBubble?.isValid || !this.clueText) return;
        this.clueNpcId = null;
        this.cluePoint = { x: point.at.x, y: point.at.y + 95 };
        this.clueSeconds = 4;
        this.clueText.string = point.message;
        this.clueBubble.active = true;
        this.positionBubbleAt(this.cluePoint.x, this.cluePoint.y);
        if (!this.discoveryHooks?.hasDiscovery(point.id)) this.discoveryHooks?.recordDiscovery(point.id);
    }

    /** Close transient dialogue without changing the resident or discovery state. */
    public dismissClue(): void {
        this.clueSeconds = 0;
        this.clueNpcId = null;
        this.cluePoint = null;
        if (this.clueBubble?.isValid) this.clueBubble.active = false;
    }

    private positionBubbleAt(x: number, y: number): void {
        const bubble = this.clueBubble;
        if (!bubble?.isValid) return;
        const view = this.map.parent;
        const viewport = view?.getComponent(UITransform);
        const mapScale = this.map.scale;
        const bubbleSize = bubble.getComponent(UITransform)?.contentSize;
        if (viewport && bubbleSize && viewport.width > 0 && viewport.height > 0 &&
            Math.abs(mapScale.x) > 0.001 && Math.abs(mapScale.y) > 0.001) {
            const margin = Math.max(12, Math.min(24, Math.min(viewport.width, viewport.height) * 0.025));
            const anchor = viewport.anchorPoint;
            const left = -viewport.width * anchor.x + margin;
            const right = viewport.width * (1 - anchor.x) - margin;
            const top = viewport.height * (1 - anchor.y) - margin;
            let bottom = -viewport.height * anchor.y + margin;
            const tray = view?.getChildByName('TaskPanel');
            const trayTransform = tray?.getComponent(UITransform);
            if (tray?.activeInHierarchy && trayTransform) {
                const trayTop = viewport.convertToNodeSpaceAR(trayTransform.convertToWorldSpaceAR(
                    new Vec3(0, trayTransform.height * (1 - trayTransform.anchorPoint.y), 0))).y;
                bottom = Math.max(bottom, Math.min(top - margin, trayTop + margin));
            }
            const fit = Math.min(viewport.width * 0.7 / bubbleSize.width,
                viewport.height * 0.24 / bubbleSize.height,
                (right - left) / bubbleSize.width, (top - bottom) / bubbleSize.height);
            const halfWidth = bubbleSize.width * fit / 2;
            const halfHeight = bubbleSize.height * fit / 2;
            // Counter map zoom so existing panel art and text stay the same readable
            // viewport size. Pan/zoom still selects the resident's preferred position.
            bubble.setScale(fit / Math.abs(mapScale.x), fit / Math.abs(mapScale.y), 1);
            bubble.setPosition(x, y, 0);
            const preferred = viewport.convertToNodeSpaceAR(bubble.worldPosition);
            const clampedX = Math.max(left + halfWidth, Math.min(right - halfWidth, preferred.x));
            const clampedY = Math.max(bottom + halfHeight, Math.min(top - halfHeight, preferred.y));
            bubble.setPosition(x + (clampedX - preferred.x) / mapScale.x,
                y + (clampedY - preferred.y) / mapScale.y, 0);
            return;
        }
        const width = this.blueprint?.map.width ?? 1536;
        const height = this.blueprint?.map.height ?? 2048;
        bubble.setScale(1, 1, 1);
        bubble.setPosition(Math.max(-width / 2 + 175, Math.min(width / 2 - 175, x)),
            Math.min(height / 2 - 90, Math.max(-height / 2 + 65, y)), 0);
    }

    private positionClueBubble(npc: NpcRuntime): void {
        const x = npc.node.position.x;
        const sideOffset = x < -300 ? 125 : x > 300 ? -125 : 0;
        this.positionBubbleAt(x + sideOffset, npc.node.position.y + npc.plan.actorHeight + 105);
    }

    private drawSlot(parent: Node, slot: ArtSlot, onReady?: () => void): Node {
        const node = new Node(slot.id);
        parent.addChild(node);
        node.setPosition(slot.center.x, slot.center.y, 0);
        node.addComponent(UITransform).setContentSize(slot.size.width, slot.size.height);
        loadSceneArtSlot(this.bundle, slot.id, node, null, slot.size, onReady, slot.textureScale ?? 1);
        return node;
    }

    private addNpc(plan: NpcPlan): void {
        const node = new Node(plan.id);
        const start = plan.route[0];
        node.setPosition(start.x, start.y, 0);
        node.addComponent(UITransform).setContentSize(100, plan.actorHeight);
        this.depth.addActor(node, () => node.position.y);
        const cels = new CelAnimationPlayer(node, null, null, this.bundle, plan.id,
            `cels/${plan.id}`, plan.actorHeight);
        const firstDestination = plan.route[1];
        const dx = firstDestination ? firstDestination.x - start.x : 0;
        const dy = firstDestination ? firstDestination.y - start.y : 0;
        const heading: AmbientChickenHeading = Math.abs(dy) > Math.abs(dx)
            ? dy > 0 ? 'north' : 'south' : 'side';
        this.npcs.push({plan, node, nextIndex: 1, paused: Math.max(0, plan.initialPauseSeconds ?? 0),
            motionSeconds: 0, moving: false, facing: dx < 0 ? -1 : 1, routeDirection: 1,
            heading, cels, walkClip: 'walk_nw', turnSeconds: 0,
            idle: new ResidentIdleRoutine(plan.id, plan.idleActions)});
    }

    public update(dt: number): void {
        if (this.disposed || !this.blueprint || !Number.isFinite(dt) || dt <= 0) return;
        const delta = Math.min(dt, 0.08);
        this.ambientSeconds += delta;
        this.paintAmbientFx();
        if (this.clueSeconds > 0) {
            this.clueSeconds = Math.max(0, this.clueSeconds - delta);
            const speaker = this.npcs.find(npc => npc.plan.id === this.clueNpcId);
            if (speaker) this.positionClueBubble(speaker);
            else if (this.cluePoint) this.positionBubbleAt(this.cluePoint.x, this.cluePoint.y);
            if (this.clueSeconds === 0 && this.clueBubble?.isValid) this.clueBubble.active = false;
        }
        for (const completed of this.eventDirector?.tick(delta) ?? []) {
            if (completed.eventId === 'tea_exchange') this.eventCompleted = true;
            if (completed.discoveryId && !this.discoveryHooks?.hasDiscovery(completed.discoveryId)) {
                this.discoveryHooks?.recordDiscovery(completed.discoveryId);
            }
            const messenger = this.npcs.find(npc => npc.plan.id === completed.triggerNpcId);
            if (messenger?.plan.id === 'messenger_customer' && messenger.cels?.supportsClip('turn_w_ne')) {
                messenger.turnSeconds = 0.35;
                messenger.paused = Math.max(messenger.paused, messenger.turnSeconds);
            }
        }
        for (const npc of this.npcs) {
            if (!npc.node.isValid) continue;
            npc.motionSeconds += delta;
            npc.moving = false;
            const turningToLeave = npc.turnSeconds > 0;
            npc.turnSeconds = Math.max(0, npc.turnSeconds - delta);
            if (this.eventDirector?.isParticipant(npc.plan.id)) {
                // Events reserve their own participants at the authored footpoints.
            } else if (npc.paused > 0) {
                npc.paused = Math.max(0, npc.paused - delta);
            } else if (npc.plan.route.length > 1 && npc.nextIndex < npc.plan.route.length) {
                const destination = npc.plan.route[npc.nextIndex];
                const dx = destination.x - npc.node.position.x;
                const dy = destination.y - npc.node.position.y;
                const distance = Math.hypot(dx, dy);
                const step = (npc.plan.speedWorldUnitsPerSecond ?? 80) * delta;
                npc.facing = dx < -1 ? -1 : dx > 1 ? 1 : npc.facing;
                if (distance > 0.001) npc.heading = Math.abs(dy) > Math.abs(dx)
                    ? dy > 0 ? 'north' : 'south' : 'side';
                // Legacy messenger sheets contain three painted north-facing
                // directions. New residents instead use their true body heading.
                npc.walkClip = Math.abs(dx) <= Math.abs(dy) * 0.12 ? 'walk_n'
                    : dx < 0 ? 'walk_nw' : 'walk_ne';
                if (distance <= step) {
                    npc.node.setPosition(destination.x, destination.y, 0);
                    const arrived = npc.nextIndex;
                    this.eventDirector?.tryStart(npc.plan.id, arrived, npc.routeDirection > 0);
                    npc.paused = npc.plan.pauseSecondsAtWaypoints?.[String(arrived)] ?? 0;
                    const next = nextResidentWaypoint(arrived, npc.plan.route.length,
                        npc.plan.loop ?? false, npc.plan.routeMode ?? 'forward', npc.routeDirection);
                    npc.nextIndex = next.nextIndex;
                    npc.routeDirection = next.direction;
                } else {
                    npc.node.setPosition(npc.node.position.x + dx / distance * step,
                        npc.node.position.y + dy / distance * step, 0);
                    npc.moving = true;
                }
            }
            const eventBeat = this.eventDirector?.actorBeat(npc.plan.id);
            const participating = this.eventDirector?.isParticipant(npc.plan.id) ?? false;
            const idlePose = npc.idle.tick(delta, npc.moving || participating);
            const messenger = npc.plan.id === 'messenger_customer';
            const legacyMessenger = messenger && npc.cels?.supportsClip('turn_w_ne') &&
                npc.cels.supportsClip('idle_ne');
            let clip: CelClipName = idlePose.clip;
            if (eventBeat) clip = eventBeat.clip;
            else if (participating) clip = 'idle_w';
            else if (turningToLeave && legacyMessenger) clip = 'turn_w_ne';
            else if (npc.moving) clip = legacyMessenger ? npc.walkClip
                : npc.heading === 'north' ? 'walk_n' : npc.heading === 'south' ? 'walk_ne' : 'walk_nw';
            else if (legacyMessenger && !npc.plan.loop && npc.nextIndex >= npc.plan.route.length) clip = 'idle_ne';
            npc.cels?.setState(clip);
            if (eventBeat?.facing !== undefined) npc.cels?.setFacing(eventBeat.facing);
            else npc.cels?.setFacing(legacyMessenger ? 1 : npc.heading === 'side' ? npc.facing : 1);
            npc.cels?.update(delta);
        }
        this.eventSeconds = this.eventDirector?.eventSeconds('tea_exchange') ?? -1;
        for (const prop of this.eventProps) {
            const seconds = this.eventDirector?.eventSeconds(prop.eventId);
            if (prop.node.isValid) prop.node.active = seconds !== null && seconds !== undefined &&
                seconds >= prop.spec.visibleFromSeconds && seconds < prop.spec.visibleUntilSeconds;
        }
    }

    private paintAmbientFx(): void {
        const node = this.ambientFx;
        if (!node?.isValid || !this.blueprint) return;
        const slot = this.blueprint.artSlots.find(slot => slot.layer === 'effects');
        if (!slot) return;
        const phase = (this.ambientSeconds * 0.45) % 1;
        node.setPosition(slot.center.x, slot.center.y + phase * 12, 0);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = Math.round(190 * (1 - phase));
    }

    public dispose(): void {
        this.disposed = true;
        for (const npc of this.npcs) npc.cels?.dispose();
        this.npcs.length = 0;
        this.blueprint = null;
        this.conversationTurns.clear();
        this.backRoot = null;
        this.frontRoot = null;
        this.cupMarker = null;
        this.eventDirector = null;
        this.eventProps.length = 0;
        this.ambientFx = null;
        this.clueBubble = null;
        this.clueText = null;
        this.clueNpcId = null;
        this.cluePoint = null;
        this.clueSeconds = 0;
        this.debugLabel = null;
        this.artGroundLoaded = false;
    }
}
