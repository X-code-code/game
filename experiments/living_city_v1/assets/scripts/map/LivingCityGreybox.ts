import { AssetManager, Color, JsonAsset, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, warn } from 'cc';
import { CelAnimationPlayer } from '../character/CelAnimationPlayer';
import type { CelClipName } from '../character/CelAnimationPlayer';
type AmbientChickenHeading = 'side' | 'north' | 'south';
import { loadSceneArtSlot } from './SceneArtSlot';
import { generatedUi } from '../ui/GeneratedUi';
import type { SceneDepthLayer } from './SceneDepthLayer';
import type { TapTarget, TargetClicked } from '../gameplay/TargetInput';

type Point = { x: number; y: number };
type ArtSlot = { id: string; layer: string; center: Point; size: { width: number; height: number };
    footY?: number };
type NpcPlan = { id: string; role: string; actorHeight: number; footRadius: number; route: Point[];
    speedWorldUnitsPerSecond?: number; pauseSecondsAtWaypoints?: Record<string, number>; loop?: boolean };
type Blueprint = {
    id: string;
    npcClues?: Record<string, string>;
    map: { width: number; height: number };
    camera: { initialFocus: Point };
    artSlots: ArtSlot[];
    walkableRegions: { id: string; access: string; polygon: number[][] }[];
    physicalFootprints: { id: string; polygon: number[][] }[];
    standingSpots: { id: string; at: Point; access: string; clearRadius: number }[];
    npcPlans: NpcPlan[];
    sceneEvents: { id: string; trigger: { npcId: string; waypointIndex: number };
        resumeRouteAfterSeconds: number }[];
    hiddenObjectSlots: { id: string; supportArtSlotId: string; at: Point }[];
};
type NpcRuntime = { plan: NpcPlan; node: Node; nextIndex: number;
    paused: number; motionSeconds: number; moving: boolean; eventDone: boolean; facing: number;
    heading: AmbientChickenHeading; cels: CelAnimationPlayer | null; walkClip: CelClipName;
    turnSeconds: number };

const NPC_CLUES: Record<string, string> = {
    tea_vendor: '茶香里有只不会飞的小鸟，\n可别把它当茶杯。',
    flower_buyer: '裁缝铺的针线盘里，\n有件东西正好套在指尖。',
    lantern_watcher: '抬头看看街上的布幅，\n系布的人留下了个小结。',
    chestnut_seller: '栗子纸包旁少了一把铁器，\n烫手时我总靠它。',
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
    private ambientFx: Node | null = null;
    private ambientSeconds = 0;
    private clueBubble: Node | null = null;
    private clueText: Label | null = null;
    private clueNpcId: string | null = null;
    private clueSeconds = 0;
    private debugLabel: Node | null = null;
    private artGroundLoaded = false;
    private blueprint: Blueprint | null = null;
    private get clues(): Record<string, string> { return this.blueprint?.npcClues ?? NPC_CLUES; }

    /** Same gesture router as the hidden objects, with lower hit priority. */
    public readonly clueTarget: TapTarget = {
        hitTest: (uiX, uiY) => this.clueNpcAt(uiX, uiY) !== null,
        activate: (uiX, uiY): TargetClicked | null => {
            const npc = this.clueNpcAt(uiX, uiY);
            return npc ? { type: 'scene', id: npc.plan.id, tags: ['npc_clue'] } : null;
        },
    };

    public constructor(private readonly map: Node, private readonly depth: SceneDepthLayer,
        private readonly bundle: AssetManager.Bundle, private readonly targetNodes: readonly Node[],
        private readonly onReady: (focus: Point) => void,
        blueprintPath = 'street_block_01', cityId = 'living_city_street_block_01') {
        this.bundle.load(blueprintPath, JsonAsset, (loadError, asset) => {
            if (this.disposed || !this.map.isValid) return;
            if (loadError || !asset) {
                warn('Living city greybox blueprint unavailable', loadError);
                return;
            }
            const data = asset.json as Blueprint;
            if (data?.id !== cityId ||
                data.map?.width !== 1536 || data.map?.height !== 2048) {
                warn('Living city greybox blueprint has an unexpected identity or map size');
                return;
            }
            this.blueprint = data;
            this.draw(data);
            this.onReady(data.camera.initialFocus);
        });
    }

    private draw(data: Blueprint): void {
        const back = new Node('LivingCityGreyboxBack');
        this.map.insertChild(back, 0);
        back.addComponent(UITransform).setContentSize(data.map.width, data.map.height);
        this.backRoot = back;
        const ground = data.artSlots.find(slot => slot.layer === 'ground');
        if (ground) loadSceneArtSlot(this.bundle, ground.id, back, null, ground.size,
            () => { this.artGroundLoaded = true; });
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
        const cup = new Node('TeaCupHandoffMarker');
        front.addChild(cup);
        cup.setPosition(-340, 382, 0);
        cup.addComponent(UITransform).setContentSize(19, 19);
        const sprite = cup.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const cupPath = 'event_cup/spriteFrame';
        if (this.bundle.getInfoWithPath(cupPath, SpriteFrame)) this.bundle.load(cupPath, SpriteFrame,
            (_error, frame) => { if (cup.isValid && frame) sprite.spriteFrame = frame; });
        cup.active = false; this.cupMarker = cup;
        this.createClueBubble(front);
        this.depth.sort();
    }

    private clueNpcAt(uiX: number, uiY: number): NpcRuntime | null {
        if (this.disposed || !this.blueprint) return null;
        const point = new Vec3(uiX, uiY, 0);
        for (const npc of this.npcs) {
            if (!this.clues[npc.plan.id] || !npc.node.isValid) continue;
            const local = npc.node.getComponent(UITransform)?.convertToNodeSpaceAR(point);
            if (local && Math.abs(local.x) <= 42 && local.y >= 0 &&
                local.y <= npc.plan.actorHeight + 10) return npc;
        }
        return null;
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
        this.clueBubble = node;
        this.clueText = text;
        node.active = false;
    }

    public showNpcClue(npcId: string): void {
        const npc = this.npcs.find(item => item.plan.id === npcId);
        const text = this.clues[npcId];
        if (!npc || !text || !this.clueBubble?.isValid || !this.clueText) return;
        this.clueNpcId = npcId;
        this.clueSeconds = 4;
        this.clueText.string = text;
        this.clueBubble.active = true;
        this.positionClueBubble(npc);
    }

    private positionClueBubble(npc: NpcRuntime): void {
        const x = npc.node.position.x;
        const sideOffset = x < -300 ? 125 : x > 300 ? -125 : 0;
        this.clueBubble?.setPosition(Math.max(-590, Math.min(590, x + sideOffset)),
            Math.min(924, npc.node.position.y + npc.plan.actorHeight + 105), 0);
    }

    private drawSlot(parent: Node, slot: ArtSlot): Node {
        const node = new Node(slot.id);
        parent.addChild(node);
        node.setPosition(slot.center.x, slot.center.y, 0);
        node.addComponent(UITransform).setContentSize(slot.size.width, slot.size.height);
        loadSceneArtSlot(this.bundle, slot.id, node, null, slot.size);
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
        this.npcs.push({plan, node, nextIndex: 1, paused: 0, motionSeconds: 0,
            moving: false, eventDone: false, facing: dx < 0 ? -1 : 1,
            heading, cels, walkClip: 'walk_nw', turnSeconds: 0});
    }

    public update(dt: number): void {
        if (this.disposed || !this.blueprint || dt <= 0) return;
        const delta = Math.min(dt, 0.08);
        this.ambientSeconds += delta;
        this.paintAmbientFx();
        if (this.clueSeconds > 0) {
            this.clueSeconds = Math.max(0, this.clueSeconds - delta);
            const speaker = this.npcs.find(npc => npc.plan.id === this.clueNpcId);
            if (speaker) this.positionClueBubble(speaker);
            if (this.clueSeconds === 0 && this.clueBubble?.isValid) this.clueBubble.active = false;
        }
        if (this.eventSeconds >= 0) {
            this.eventSeconds += delta;
            if (this.eventSeconds >= 1.9) {
                this.eventSeconds = -1;
                this.eventCompleted = true;
                const messenger = this.npcs.find(npc => npc.plan.id === 'messenger_customer');
                if (messenger) {
                    messenger.turnSeconds = 0.35;
                    messenger.paused = Math.max(messenger.paused, messenger.turnSeconds);
                }
            }
        }
        if (this.cupMarker?.isValid) this.cupMarker.active = this.eventSeconds >= 0.8 && this.eventSeconds < 1.9;
        for (const npc of this.npcs) {
            if (!npc.node.isValid) continue;
            npc.motionSeconds += delta;
            npc.moving = false;
            const turningToLeave = npc.turnSeconds > 0;
            npc.turnSeconds = Math.max(0, npc.turnSeconds - delta);
            if (npc.paused > 0) {
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
                // The authored messenger route only goes north, north-west and
                // north-east. The motion direction chooses its painted cel set.
                npc.walkClip = Math.abs(dx) <= Math.abs(dy) * 0.12 ? 'walk_n'
                    : dx < 0 ? 'walk_nw' : 'walk_ne';
                if (distance <= step) {
                    npc.node.setPosition(destination.x, destination.y, 0);
                    const arrived = npc.nextIndex;
                    npc.nextIndex++;
                    if (this.blueprint.sceneEvents.some(event => event.trigger.npcId === npc.plan.id &&
                        event.trigger.waypointIndex === arrived) && !npc.eventDone) {
                        npc.eventDone = true;
                        npc.paused = 1.9;
                        this.eventSeconds = 0;
                        npc.facing = -1;
                    } else {
                        npc.paused = npc.plan.pauseSecondsAtWaypoints?.[String(arrived)] ?? 0;
                    }
                    if (npc.nextIndex >= npc.plan.route.length && npc.plan.loop) npc.nextIndex = 0;
                } else {
                    npc.node.setPosition(npc.node.position.x + dx / distance * step,
                        npc.node.position.y + dy / distance * step, 0);
                    npc.moving = true;
                }
            }
            const clip: CelClipName = npc.plan.id === 'messenger_customer' && this.eventSeconds >= 0
                ? this.eventSeconds < 0.35 ? 'turn_nw_w'
                    : this.eventSeconds < 0.8 ? 'idle_w' : 'receive_w'
                : turningToLeave ? 'turn_w_ne'
                    : npc.moving ? npc.walkClip
                        : npc.plan.id === 'messenger_customer' && !npc.plan.loop &&
                            npc.nextIndex >= npc.plan.route.length ? 'idle_ne' : 'idle_w';
            if (npc.plan.id === 'messenger_customer') {
                npc.cels?.setState(clip);
            } else {
                const role = npc.plan.role;
                const activity = role === 'vendor' ? this.eventSeconds >= 0.35 && this.eventSeconds < 1.9
                    : (npc.motionSeconds % 5) >= 3;
                const imageClip: CelClipName = npc.moving
                    ? npc.heading === 'north' ? 'walk_n' : npc.heading === 'south' ? 'walk_ne' : 'walk_nw'
                    : activity ? 'receive_w' : 'idle_w';
                npc.cels?.setState(imageClip);
                npc.cels?.setFacing(npc.heading === 'side' ? npc.facing : 1);
            }
            npc.cels?.update(delta);
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
        this.backRoot = null;
        this.frontRoot = null;
        this.cupMarker = null;
        this.ambientFx = null;
        this.clueBubble = null;
        this.clueText = null;
        this.clueNpcId = null;
        this.clueSeconds = 0;
        this.debugLabel = null;
        this.artGroundLoaded = false;
    }
}
