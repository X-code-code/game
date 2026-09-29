import { AssetManager, Color, Graphics, JsonAsset, Label, Node, UITransform, Vec3, warn } from 'cc';
import { CelAnimationPlayer } from '../character/CelAnimationPlayer';
import type { CelClipName } from '../character/CelAnimationPlayer';
import { paintAmbientChicken } from '../character/AmbientChickenPainter';
import type { AmbientChickenHeading } from '../character/AmbientChickenPainter';
import { loadSceneArtSlot } from './SceneArtSlot';
import type { SceneDepthLayer } from './SceneDepthLayer';
import type { TapTarget, TargetClicked } from '../gameplay/TargetInput';

type Point = { x: number; y: number };
type ArtSlot = { id: string; layer: string; center: Point; size: { width: number; height: number };
    footY?: number };
type NpcPlan = { id: string; role: string; actorHeight: number; footRadius: number; route: Point[];
    speedWorldUnitsPerSecond?: number; pauseSecondsAtWaypoints?: Record<string, number>; loop?: boolean };
type Blueprint = {
    id: string;
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
type NpcRuntime = { plan: NpcPlan; node: Node; graphic: Graphics; nextIndex: number;
    paused: number; motionSeconds: number; moving: boolean; eventDone: boolean; facing: number;
    heading: AmbientChickenHeading; cels: CelAnimationPlayer | null; walkClip: CelClipName;
    turnSeconds: number };

const COLOR = {
    outline: new Color(83, 66, 55, 255),
    paving: new Color(226, 213, 187, 255),
    lane: new Color(238, 227, 203, 255),
    private: new Color(204, 190, 159, 255),
    route: new Color(60, 115, 97, 205),
    block: new Color(138, 67, 60, 140),
};
const SLOT_COLOR: Record<string, Color> = {
    building_back: new Color(118, 143, 151, 255),
    street_back: new Color(181, 130, 96, 255),
    depth: new Color(139, 104, 74, 255),
    overhead: new Color(176, 91, 76, 230),
    effects: new Color(105, 165, 174, 155),
    target_foreground: new Color(139, 104, 74, 180),
};
const NPC_CLUES: Record<string, string> = {
    tea_vendor: '茶香里有只不会飞的小鸟，\n可别把它当茶杯。',
    flower_buyer: '裁缝铺的针线盘里，\n有件东西正好套在指尖。',
    lantern_watcher: '抬头看看街上的布幅，\n系布的人留下了个小结。',
    chestnut_seller: '栗子纸包旁少了一把铁器，\n烫手时我总靠它。',
};

function addGraphics(parent: Node, name: string): { node: Node; graphic: Graphics } {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform);
    return { node, graphic: node.addComponent(Graphics) };
}

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

function polygon(graphic: Graphics, vertices: number[][]): void {
    graphic.moveTo(vertices[0][0], vertices[0][1]);
    for (const vertex of vertices.slice(1)) graphic.lineTo(vertex[0], vertex[1]);
    graphic.close();
}

/** Flat diagnostic geometry for the isolated traditional-2D level blockout. */
export class LivingCityGreybox {
    private disposed = false;
    private backRoot: Node | null = null;
    private frontRoot: Node | null = null;
    private npcs: NpcRuntime[] = [];
    private eventSeconds = -1;
    private eventCompleted = false;
    private cupMarker: Node | null = null;
    private ambientFx: Graphics | null = null;
    private ambientSeconds = 0;
    private clueBubble: Node | null = null;
    private clueText: Label | null = null;
    private clueNpcId: string | null = null;
    private clueSeconds = 0;
    private debugLabel: Node | null = null;
    private artGroundLoaded = false;
    private blueprint: Blueprint | null = null;

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
        private readonly onReady: (focus: Point) => void) {
        this.bundle.load('street_block_01', JsonAsset, (loadError, asset) => {
            if (this.disposed || !this.map.isValid) return;
            if (loadError || !asset) {
                warn('Living city greybox blueprint unavailable', loadError);
                return;
            }
            const data = asset.json as Blueprint;
            if (data?.id !== 'living_city_street_block_01' ||
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
        const back = addGraphics(this.map, 'LivingCityGreyboxBack');
        this.map.insertChild(back.node, 0);
        back.node.getComponent(UITransform)?.setContentSize(data.map.width, data.map.height);
        this.backRoot = back.node;
        const g = back.graphic;
        g.fillColor = COLOR.paving;
        g.rect(-data.map.width / 2, -data.map.height / 2, data.map.width, data.map.height);
        g.fill();
        for (const region of data.walkableRegions) {
            g.fillColor = region.access === 'public' ? COLOR.lane : COLOR.private;
            g.strokeColor = new Color(171, 148, 112, 255);
            g.lineWidth = 3;
            polygon(g, region.polygon);
            g.fill();
            g.stroke();
        }
        g.strokeColor = new Color(196, 179, 145, 180);
        g.lineWidth = 2;
        for (let y = -850; y <= 850; y += 90) {
            g.moveTo(-280, y);
            g.lineTo(310, y);
        }
        g.stroke();

        for (const slot of data.artSlots) {
            if (slot.layer === 'ground' || slot.layer === 'depth' ||
                slot.layer === 'overhead' || slot.layer === 'effects' ||
                slot.layer === 'target_foreground') continue;
            this.drawSlot(back.node, slot);
        }
        g.strokeColor = COLOR.route;
        g.lineWidth = 6;
        for (const plan of data.npcPlans) {
            if (plan.route.length < 2) continue;
            g.moveTo(plan.route[0].x, plan.route[0].y);
            for (const waypoint of plan.route.slice(1)) g.lineTo(waypoint.x, waypoint.y);
            g.stroke();
        }
        for (const spot of data.standingSpots) {
            const { x, y } = spot.at;
            g.lineWidth = 3;
            g.strokeColor = spot.access === 'counter_surface'
                ? new Color(68, 129, 156, 255) : new Color(55, 113, 113, 255);
            g.circle(x, y, Math.max(8, spot.clearRadius));
            g.stroke();
        }

        // The continuous ground art occupies the same blueprint rectangle. Its
        // successful load also removes the route and standing-spot diagnostics.
        const groundSlot = data.artSlots.find(slot => slot.layer === 'ground');
        if (groundSlot) loadSceneArtSlot(this.bundle, groundSlot.id, back.node, back.graphic,
            groundSlot.size, () => {
                this.artGroundLoaded = true;
                if (this.debugLabel?.isValid) this.debugLabel.active = false;
            });

        for (const slot of data.artSlots.filter(slot => slot.layer === 'depth')) {
            const entry = addGraphics(this.depth.node, slot.id);
            entry.node.setPosition(slot.center.x, slot.center.y, 0);
            entry.node.getComponent(UITransform)?.setContentSize(slot.size.width, slot.size.height);
            this.drawSlotShape(entry.graphic, slot);
            loadSceneArtSlot(this.bundle, slot.id, entry.node, entry.graphic, slot.size);
            this.depth.addActor(entry.node, () => slot.footY ?? slot.center.y);
        }
        for (const plan of data.npcPlans) this.addNpc(plan);

        const front = addGraphics(this.map, 'LivingCityGreyboxOverhead');
        front.node.getComponent(UITransform)?.setContentSize(data.map.width, data.map.height);
        this.frontRoot = front.node;
        for (const slot of data.artSlots.filter(slot => slot.layer === 'overhead' || slot.layer === 'effects')) {
            this.drawSlot(front.node, slot);
        }
        for (const target of data.hiddenObjectSlots) {
            const slot = data.artSlots.find(item => item.id === target.supportArtSlotId);
            if (slot?.layer !== 'overhead') continue;
            const targetNode = this.targetNodes.find(node => node.name === target.id);
            if (targetNode?.isValid) front.node.addChild(targetNode);
        }
        // Tiny authored foreground fragments (cup lip, fabric fold, tray edge)
        // sit above target art. They have no hit area, so a partly covered item
        // remains tappable through its separate HiddenObject node.
        for (const slot of data.artSlots.filter(slot => slot.layer === 'target_foreground')) {
            this.drawSlot(front.node, slot);
        }
        // These curves are redrawn over time, independent of the static PNG
        // layers: steam rises from two working stalls and water ripples in the
        // roadside basin. The effect node has no touch handler or hit area.
        this.ambientFx = addGraphics(front.node, 'LivingStreetAmbientFx').graphic;
        this.paintAmbientFx();
        const cup = addGraphics(front.node, 'TeaCupHandoffMarker');
        cup.node.setPosition(-340, 382, 0);
        cup.graphic.fillColor = new Color(243, 230, 198, 255);
        cup.graphic.strokeColor = COLOR.outline;
        cup.graphic.lineWidth = 2.5;
        cup.graphic.moveTo(-8, 4);
        cup.graphic.lineTo(8, 4);
        cup.graphic.lineTo(6, -5);
        cup.graphic.lineTo(-6, -5);
        cup.graphic.close();
        cup.graphic.fill();
        cup.graphic.stroke();
        cup.graphic.strokeColor = new Color(185, 104, 77, 255);
        cup.graphic.moveTo(-5, 1);
        cup.graphic.lineTo(5, 1);
        cup.graphic.stroke();
        cup.node.active = false;
        this.cupMarker = cup.node;
        this.debugLabel = label(front.node, 'GREYBOX / GEOMETRY ONLY', 0, 940, 22);
        this.debugLabel.active = !this.artGroundLoaded;
        this.createClueBubble(front.node);
        this.depth.sort();
    }

    private clueNpcAt(uiX: number, uiY: number): NpcRuntime | null {
        if (this.disposed || !this.blueprint) return null;
        const point = new Vec3(uiX, uiY, 0);
        for (const npc of this.npcs) {
            if (!NPC_CLUES[npc.plan.id] || !npc.node.isValid) continue;
            const local = npc.node.getComponent(UITransform)?.convertToNodeSpaceAR(point);
            if (local && Math.abs(local.x) <= 42 && local.y >= 0 &&
                local.y <= npc.plan.actorHeight + 10) return npc;
        }
        return null;
    }

    private createClueBubble(parent: Node): void {
        const { node, graphic } = addGraphics(parent, 'LivingCityNpcClue');
        node.getComponent(UITransform)?.setContentSize(330, 112);
        graphic.fillColor = new Color(255, 247, 224, 250);
        graphic.strokeColor = COLOR.outline;
        graphic.lineWidth = 3;
        graphic.roundRect(-165, -48, 330, 96, 15);
        graphic.fill();
        graphic.stroke();
        graphic.moveTo(-15, -48);
        graphic.lineTo(-5, -61);
        graphic.lineTo(4, -48);
        graphic.fill();
        graphic.stroke();
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
        const text = NPC_CLUES[npcId];
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

    private drawSlot(parent: Node, slot: ArtSlot): void {
        const entry = addGraphics(parent, slot.id);
        entry.node.setPosition(slot.center.x, slot.center.y, 0);
        entry.node.getComponent(UITransform)?.setContentSize(slot.size.width, slot.size.height);
        this.drawSlotShape(entry.graphic, slot);
        loadSceneArtSlot(this.bundle, slot.id, entry.node, entry.graphic, slot.size);
    }

    private drawSlotShape(g: Graphics, slot: ArtSlot): void {
        const { width, height } = slot.size;
        g.fillColor = SLOT_COLOR[slot.layer] ?? COLOR.paving;
        g.strokeColor = COLOR.outline;
        g.lineWidth = 3;
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();
        g.stroke();
        const text = slot.id.replace('lc_', '').replace('_back', '').replace('_front', '');
        if (width >= 90 && height >= 90) label(g.node, text, 0, 0, 14);
    }

    private addNpc(plan: NpcPlan): void {
        const node = new Node(plan.id);
        const start = plan.route[0];
        node.setPosition(start.x, start.y, 0);
        node.addComponent(UITransform).setContentSize(100, plan.actorHeight);
        const graphic = node.addComponent(Graphics);
        this.depth.addActor(node, () => node.position.y);
        const nameLabel = label(node, plan.id.replace('_customer', '').replace('_seller', ''), 60,
            plan.actorHeight * 0.65, 14);
        nameLabel.active = plan.id === 'messenger_customer';
        // Only the messenger is in the current character-production batch. A missing
        // cel manifest keeps the existing route marker and diagnostic drawing.
        const cels = plan.id === 'messenger_customer'
            ? new CelAnimationPlayer(node, graphic, nameLabel, this.bundle, plan.id,
                `cels/${plan.id}`, plan.actorHeight) : null;
        const firstDestination = plan.route[1];
        const initialDx = firstDestination ? firstDestination.x - start.x : 0;
        const initialDy = firstDestination ? firstDestination.y - start.y : 0;
        const initialHeading: AmbientChickenHeading = Math.abs(initialDy) > Math.abs(initialDx)
            ? initialDy > 0 ? 'north' : 'south' : 'side';
        const runtime: NpcRuntime = { plan, node, graphic, nextIndex: 1, paused: 0,
            motionSeconds: 0, moving: false, eventDone: false, facing: 1,
            heading: initialHeading, cels,
            walkClip: 'walk_nw', turnSeconds: 0 };
        this.npcs.push(runtime);
        this.drawNpc(runtime, 0);
    }

    private drawNpc(npc: NpcRuntime, time: number): void {
        const g = npc.graphic;
        const role = npc.plan.role;
        if (role === 'vendor' || role === 'ambient_shopper' ||
            role === 'ambient_vendor' || role === 'ambient_watcher' ||
            role === 'tea_regular' || role === 'flower_buyer' || role === 'lane_child') {
            paintAmbientChicken(g, {
                role,
                height: npc.plan.actorHeight,
                facing: role === 'ambient_vendor' ? -1 : npc.facing,
                heading: npc.heading,
                time,
                motionSeconds: npc.motionSeconds,
                moving: npc.moving,
                eventSeconds: this.eventSeconds,
            });
            return;
        }
        const h = npc.plan.actorHeight;
        const step = npc.moving ? Math.sin(npc.motionSeconds * 12) * 11 : 0;
        const vendorActive = role === 'vendor' && this.eventSeconds >= 0 && this.eventSeconds < 1.9;
        const customerActive = role === 'tea_customer' && this.eventSeconds >= 0 && this.eventSeconds < 1.9;
        const watcherWave = role === 'ambient_watcher' && Math.sin(time * 1.9) > 0.1;
        g.clear();
        g.strokeColor = COLOR.outline;
        g.lineWidth = 4;
        g.moveTo(-14 + step, 23); g.lineTo(-14 + step, 0);
        g.moveTo(14 - step, 23); g.lineTo(14 - step, 0);
        g.stroke();
        g.fillColor = role === 'tea_customer' ? new Color(238, 211, 119, 255)
            : role === 'vendor' ? new Color(213, 181, 122, 255)
                : role === 'ambient_watcher' ? new Color(236, 209, 142, 255)
                    : new Color(204, 209, 167, 255);
        g.circle(0, h * 0.42, 30);
        g.fill(); g.stroke();
        g.circle(8 * npc.facing, h * 0.72, 22);
        g.fill(); g.stroke();
        g.fillColor = new Color(208, 126, 65, 255);
        g.moveTo(26 * npc.facing, h * 0.7);
        g.lineTo(40 * npc.facing, h * 0.66);
        g.lineTo(25 * npc.facing, h * 0.62);
        g.close(); g.fill();
        g.strokeColor = new Color(65, 62, 53, 255);
        g.lineWidth = 3;
        const wingX = vendorActive || customerActive ? -24 : watcherWave ? 24 : 20;
        const wingY = vendorActive || customerActive ? h * 0.60 : watcherWave ? h * 0.76 : h * 0.42;
        g.moveTo(0, h * 0.45); g.lineTo(wingX, wingY); g.stroke();
        g.strokeColor = new Color(48, 133, 144, 255);
        g.lineWidth = 2;
        g.circle(0, 0, npc.plan.footRadius);
        g.stroke();
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
        const now = performance.now() / 1000;
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
                    if (npc.plan.id === 'messenger_customer' && arrived === 4 && !npc.eventDone) {
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
            npc.cels?.setState(clip);
            npc.cels?.update(delta);
            if (!npc.cels?.isReady) this.drawNpc(npc, now);
        }
    }

    private paintAmbientFx(): void {
        const g = this.ambientFx;
        if (!g?.node.isValid) return;
        g.clear();
        const t = this.ambientSeconds;
        const sources = [
            { x: -397, y: 438, spacing: 11, count: 3 },
            { x: 10, y: 605, spacing: 13, count: 2 },
        ];
        for (const source of sources) {
            for (let i = 0; i < source.count; i++) {
                const phase = (t * 0.43 + i * 0.32) % 1;
                const x = source.x + i * source.spacing + Math.sin(t * 2.1 + i) * 2.5;
                const y = source.y + phase * 18;
                g.strokeColor = new Color(255, 250, 229, Math.round((1 - phase) * 110));
                g.lineWidth = 2.7 - phase * 0.8;
                g.moveTo(x, y);
                g.bezierCurveTo(x - 5, y + 7, x + 6, y + 14, x + 2, y + 24);
                g.stroke();
            }
        }
        for (let i = 0; i < 2; i++) {
            const phase = (t * 0.58 + i * 0.5) % 1;
            const radius = 4 + phase * 20;
            const cy = -261 + i * 2;
            g.strokeColor = new Color(246, 244, 223, Math.round((1 - phase) * 110));
            g.lineWidth = 1.8;
            g.moveTo(5 - radius, cy);
            g.bezierCurveTo(5 - radius * 0.5, cy + radius * 0.32,
                5 + radius * 0.5, cy + radius * 0.32, 5 + radius, cy);
            g.stroke();
        }
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
