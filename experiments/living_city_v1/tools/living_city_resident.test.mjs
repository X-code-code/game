import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
function loadSource(file, dependencies) {
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(output, { module, exports: module.exports,
        require: name => dependencies[name] ?? require(name), Map, Set, Number }, { filename: file });
    return module.exports;
}

class UITransform {
    anchorPoint = { x: 0.5, y: 0.5 };
    setContentSize(width, height) { this.width = width; this.height = height; }
    get contentSize() { return { width: this.width, height: this.height }; }
    convertToNodeSpaceAR(point) {
        const world = this.node.worldPosition;
        const scale = this.node.worldScale;
        return new Vec3((point.x - world.x) / scale.x, (point.y - world.y) / scale.y,
            (point.z - world.z) / scale.z);
    }
    convertToWorldSpaceAR(point) {
        const world = this.node.worldPosition;
        const scale = this.node.worldScale;
        return new Vec3(world.x + point.x * scale.x, world.y + point.y * scale.y,
            world.z + point.z * scale.z);
    }
}
class Sprite { static SizeMode = { CUSTOM: 1 }; }
class SpriteFrame {}
class JsonAsset {}
class UIOpacity { opacity = 255; }
class Vec3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class Color {}
class Label {
    static HorizontalAlign = { CENTER: 1 };
    static VerticalAlign = { CENTER: 1 };
    static Overflow = { SHRINK: 1 };
}
class Node {
    constructor(name) {
        this.name = name; this.isValid = true; this.children = [];
        this.position = { x: 0, y: 0, z: 0 }; this.components = new Map(); this.active = true;
        this.scale = new Vec3(1, 1, 1);
    }
    addChild(child) { child.parent = this; this.children.push(child); }
    insertChild(child, index) { child.parent = this; this.children.splice(index, 0, child); }
    setPosition(x, y, z) { this.position = { x, y, z }; }
    setScale(x, y, z) { this.scale = new Vec3(x, y, z); }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.set(Type, component); return component; }
    getComponent(Type) { return this.components.get(Type); }
    getChildByName(name) { return this.children.find(child => child.name === name) ?? null; }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    get worldPosition() {
        const p = this.parent?.worldPosition ?? new Vec3();
        const scale = this.parent?.worldScale ?? new Vec3(1, 1, 1);
        return new Vec3(p.x + this.position.x * scale.x, p.y + this.position.y * scale.y,
            p.z + (this.position.z ?? 0) * scale.z);
    }
    get worldScale() {
        const p = this.parent?.worldScale ?? new Vec3(1, 1, 1);
        return new Vec3(p.x * this.scale.x, p.y * this.scale.y, p.z * this.scale.z);
    }
}
class CelAnimationPlayer {
    isReady = true;
    currentClip = 'idle_w';
    states = [];
    constructor(_node, _fallback, _label, _bundle, actorId, folder) { Object.assign(this, { actorId, folder }); }
    setState(clip) { this.currentClip = clip; this.states.push(clip); }
    supportsClip(clip) { return !this.supportedClips || this.supportedClips.has(clip); }
    setFacing(facing) { this.facing = facing; }
    update() {}
    dispose() { this.isReady = false; }
}

const life = loadSource('assets/scripts/map/ResidentLife.ts', {});
const warnings = [];
const sceneArtLoads = [];
const { LivingCityGreybox } = loadSource('assets/scripts/map/LivingCityGreybox.ts', {
    cc: { Node, UITransform, Sprite, SpriteFrame, JsonAsset, UIOpacity, Vec3, Color, Label,
        warn: (...args) => warnings.push(args.join(' ')) },
    '../character/CelAnimationPlayer': { CelAnimationPlayer },
    './ResidentLife': life,
    './SceneArtSlot': { loadSceneArtSlot: (_bundle, id, parent, _null, size, ready) => {
        sceneArtLoads.push({ id, parent, size }); ready?.();
    } },
    '../ui/GeneratedUi': { generatedUi: () => {} },
});

test('scene integration holds both tea participants, uses prop position and repeats visits along the route', () => {
    const plan = (id, route, extra = {}) => ({ id, role: 'ambient', actorHeight: 90,
        footRadius: 15, route, speedWorldUnitsPerSecond: 100, ...extra });
    const blueprint = { id: 'living_city_street_block_01', map: { width: 1536, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], hiddenObjectSlots: [],
        walkableRegions: [], physicalFootprints: [], standingSpots: [
            { id: 'tea_cup_handoff', at: { x: 123, y: 234 }, access: 'counter_surface', clearRadius: 0 },
        ], npcPlans: [
            plan('tea_regular', [{ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 20 }],
                { routeMode: 'ping_pong', idleActions: ['sip_tea', 'short_pause'] }),
            plan('tea_vendor', [{ x: -40, y: 0 }], { idleActions: ['short_pause'] }),
            plan('lane_child', [{ x: 50, y: -50 }, { x: 60, y: 50 }], { loop: true }),
        ], sceneEvents: [{ id: 'tea_exchange', trigger: { npcId: 'tea_regular', waypointIndex: 1 },
            participants: ['tea_regular', 'tea_vendor'], resumeRouteAfterSeconds: 0.9,
            repeat: true, cooldownSeconds: 0.3, actorBeats: [
                { npcId: 'tea_regular', atSeconds: 0, durationSeconds: 0.2, clip: 'idle_w' },
                { npcId: 'tea_regular', atSeconds: 0.2, durationSeconds: 0.7, clip: 'receive_w' },
                { npcId: 'tea_vendor', atSeconds: 0, durationSeconds: 0.9, clip: 'receive_w', facing: 1 },
            ] }] };
    const map = new Node('Map'), depthNode = new Node('Depth'); map.addChild(depthNode);
    map.addComponent(UITransform).setContentSize(1536, 2048);
    const bundle = { getInfoWithPath: () => ({}), load: (path, _type, callback) =>
        callback(null, path === 'street_block_01' ? { json: blueprint } : new SpriteFrame()) };
    const depth = { node: depthNode, addActor: node => depthNode.addChild(node), sort: () => {} };
    const box = new LivingCityGreybox(map, depth, bundle, [], () => {});
    const customer = box.npcs.find(npc => npc.plan.id === 'tea_regular');
    const vendor = box.npcs.find(npc => npc.plan.id === 'tea_vendor');
    const child = box.npcs.find(npc => npc.plan.id === 'lane_child');
    for (let index = 0; index < 3; index++) box.update(0.08);
    assert.equal(box.eventSeconds, 0);
    assert.equal(customer.node.position.x, 0);
    assert.equal(customer.nextIndex, 2);
    assert.equal(vendor.cels.currentClip, 'receive_w');
    assert.equal(box.cupMarker.position.x, 123);
    assert.equal(box.cupMarker.position.y, 234);
    const childBefore = child.node.position.y;
    for (let index = 0; index < 11; index++) box.update(0.08);
    assert.equal(customer.node.position.x, 0);
    assert.equal(vendor.node.position.x, -40);
    assert.equal(customer.cels.currentClip, 'receive_w');
    assert.equal(box.cupMarker.active, true);
    assert.ok(child.node.position.y !== childBefore);
    box.update(0.08);
    assert.equal(box.eventCompleted, true);
    assert.equal(box.cupMarker.active, false);
    assert.ok(customer.node.position.x > 0);
    let repeated = false;
    for (let index = 0; index < 60; index++) {
        box.update(0.08);
        if (box.eventSeconds === 0) { repeated = true; break; }
    }
    assert.equal(repeated, true);
    assert.equal(customer.node.position.x, 0);
    assert.equal(customer.routeDirection, 1);
    box.dispose();
    assert.equal(box.eventDirector, null);
    assert.equal(box.eventProps.length, 0);
});

test('blueprints accept configured wide maps and reject mismatched dimensions or city identity', () => {
    for (const width of [1536, 2304]) {
        for (const valid of [true, false]) {
            const map = new Node('Map');
            map.addComponent(UITransform).setContentSize(width, 2048);
            const blueprint = { id: 'living_city_street_block_01',
                map: { width: valid ? width : width + 100, height: 2048 },
                camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], hiddenObjectSlots: [],
                standingSpots: [], npcPlans: [], sceneEvents: [] };
            let ready = false;
            const before = warnings.length;
            const bundle = { load: (_path, _type, callback) => callback(null, { json: blueprint }) };
            const box = new LivingCityGreybox(map, { node: new Node('Depth'), sort: () => {} },
                bundle, [], () => { ready = true; });
            assert.equal(ready, valid, `configured ${width} width, valid=${valid}`);
            assert.equal(warnings.length - before, valid ? 0 : 1);
            assert.equal(!!box.blueprint, valid);
            box.dispose();
        }
    }
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const before = warnings.length;
    const box = new LivingCityGreybox(map, { node: new Node('Depth') },
        { load: (_path, _type, callback) => callback(null,
            { json: { id: 'wrong_city', map: { width: 2304, height: 2048 } } }) }, [], () => assert.fail());
    assert.equal(box.blueprint, null);
    assert.equal(warnings.length - before, 1);
});

test('facility taps use map coordinates, persist discoveries once, and disappear on inactive maps', () => {
    const map = new Node('Map'); map.setPosition(300, 200, 0);
    map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, standingSpots: [], npcPlans: [], sceneEvents: [],
        hiddenObjectSlots: [], artSlots: [{ id: 'fountain', layer: 'street_back',
            center: { x: 700, y: 0 }, size: { width: 120, height: 150 } }],
        sceneDiscoveries: [{ id: 'fountain_rest', supportArtSlotId: 'fountain', at: { x: 700, y: 0 },
            clickRadiusWorld: 70, message: '喷泉旁有一张没寄出的明信片。' },
            { id: 'missing_art', supportArtSlotId: 'not_generated', at: { x: 0, y: 0 },
                clickRadiusWorld: 100, message: '不可见设施不应互动。' }] };
    const discovered = new Set(), records = [];
    const hooks = { hasFoundTarget: () => false, hasDiscovery: id => discovered.has(id),
        recordDiscovery: id => { discovered.add(id); records.push(id); } };
    const box = new LivingCityGreybox(map, { node: depthNode, sort: () => {} },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {},
        'street_block_01', blueprint.id, hooks);
    assert.equal(box.discoveryTarget.hitTest(1000, 200), true);
    assert.equal(box.discoveryTarget.hitTest(1071, 200), false);
    assert.equal(box.discoveryTarget.hitTest(300, 200), false);
    const hit = box.discoveryTarget.activate(1000, 200);
    assert.equal(hit.type, 'scene'); assert.equal(hit.id, 'fountain_rest');
    assert.equal(hit.tags[0], 'scene_discovery');
    box.showSceneClue(hit.id); box.showSceneClue(hit.id);
    assert.equal(box.clueText.string, blueprint.sceneDiscoveries[0].message);
    assert.equal(box.clueBubble.active, true);
    assert.equal(box.clueBubble.position.x, 700, 'wide-map bubbles do not clamp to the old narrow width');
    assert.deepEqual(records, ['fountain_rest']);
    box.showSceneClue('missing_art'); assert.deepEqual(records, ['fountain_rest']);
    for (let index = 0; index < 51; index++) box.update(0.08);
    assert.equal(box.clueBubble.active, false);
    map.active = false;
    assert.equal(box.discoveryTarget.hitTest(1000, 200), false);
    assert.equal(box.discoveryTarget.activate(1000, 200), null);
    box.dispose(); box.showSceneClue('fountain_rest');
    assert.deepEqual(records, ['fountain_rest']);
});

test('the mailman request is a saved optional discovery and leaves the postcard and pose intact', () => {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const request = { id: 'postcard_delivery', npcId: 'messenger_customer', requiredTargetId: 'postcard',
        waitingMessage: '请留意邮箱旁落下的明信片。', completionMessage: '收到啦，贴纸也留给你纪念。' };
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], standingSpots: [], sceneEvents: [],
        hiddenObjectSlots: [], npcClues: { messenger_customer: ['街坊都在等着收信。', '我也想早点回家喝茶。'] }, residentRequests: [request,
            { ...request, id: 'absent_delivery', npcId: 'absent_npc' }],
        npcPlans: [{ id: 'messenger_customer', role: 'ambient', actorHeight: 90, footRadius: 15,
            route: [{ x: -500, y: 0 }], idleActions: ['short_pause'] }] };
    const found = new Set(), discovered = new Set(), records = [];
    const box = new LivingCityGreybox(map, { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {},
        'street_block_01', blueprint.id, { hasFoundTarget: id => found.has(id),
            hasDiscovery: id => discovered.has(id), recordDiscovery: id => { records.push(id); discovered.add(id); } });
    const hit = box.clueTarget.activate(-500, 40);
    assert.equal(hit.id, 'messenger_customer');
    box.showSceneClue(hit.id);
    assert.equal(box.clueText.string, request.waitingMessage); assert.equal(records.length, 0);
    found.add('postcard');
    const pose = box.npcs[0].cels.currentClip;
    box.showSceneClue(hit.id);
    assert.equal(box.clueText.string, request.completionMessage);
    box.showSceneClue(hit.id); assert.equal(box.clueText.string, blueprint.npcClues.messenger_customer[0]);
    box.showSceneClue(hit.id); assert.equal(box.clueText.string, blueprint.npcClues.messenger_customer[1]);
    box.showSceneClue('absent_npc');
    assert.deepEqual(records, ['postcard_delivery']);
    assert.equal(found.has('postcard'), true);
    assert.equal(box.npcs[0].cels.currentClip, pose, 'a text request never invents a delivery animation');
    map.active = false; assert.equal(box.clueTarget.hitTest(-500, 40), false);
    box.dispose();
});

test('residents rotate their own short conversations only on taps, without saving or auto-opening hints', () => {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], standingSpots: [], sceneEvents: [], hiddenObjectSlots: [],
        npcClues: { book_shopkeeper: ['风把书翻过一页。', '这本书的结尾，我还舍不得读。'],
            flower_shopkeeper: '今天的花开得正好。' },
        npcPlans: ['book_shopkeeper', 'flower_shopkeeper'].map((id, index) => ({ id, role: 'ambient',
            actorHeight: 88, footRadius: 15, route: [{ x: index * 150, y: 0 }], idleActions: ['short_pause'] })) };
    const records = [];
    const box = new LivingCityGreybox(map, { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {},
        'street_block_01', blueprint.id, { hasFoundTarget: () => false, hasDiscovery: () => false,
            recordDiscovery: id => records.push(id) });
    for (let index = 0; index < 10; index++) box.update(0.08);
    assert.equal(box.clueBubble.active, false, 'normal resident activity does not open dialogue');
    box.showSceneClue('book_shopkeeper'); assert.equal(box.clueText.string, blueprint.npcClues.book_shopkeeper[0]);
    box.showSceneClue('flower_shopkeeper'); assert.equal(box.clueText.string, blueprint.npcClues.flower_shopkeeper);
    box.showSceneClue('book_shopkeeper'); assert.equal(box.clueText.string, blueprint.npcClues.book_shopkeeper[1]);
    box.showSceneClue('book_shopkeeper'); assert.equal(box.clueText.string, blueprint.npcClues.book_shopkeeper[0]);
    assert.equal(box.clueText.overflow, Label.Overflow.SHRINK);
    assert.deepEqual(records, [], 'chat does not award a discovery or change required tasks');
    box.dispose(); assert.equal(box.conversationTurns.size, 0);
});

test('dismissClue clears resident and facility bubbles without resetting conversations or discoveries', () => {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, standingSpots: [], sceneEvents: [], hiddenObjectSlots: [],
        artSlots: [{ id: 'fountain', layer: 'street_back', center: { x: -200, y: 0 }, size: { width: 120, height: 150 } }],
        sceneDiscoveries: [{ id: 'fountain_rest', supportArtSlotId: 'fountain', at: { x: -200, y: 0 },
            clickRadiusWorld: 70, message: '水声落在石边。' }],
        npcClues: { book_shopkeeper: ['风把书翻过一页。', '这本书的结尾，我还舍不得读。'] },
        npcPlans: [{ id: 'book_shopkeeper', actorHeight: 88, footRadius: 15,
            route: [{ x: 200, y: 0 }], idleActions: ['short_pause'] }] };
    const discovered = new Set(), records = [];
    const box = new LivingCityGreybox(map, { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {},
        'street_block_01', blueprint.id, { hasFoundTarget: () => false, hasDiscovery: id => discovered.has(id),
            recordDiscovery: id => { records.push(id); discovered.add(id); } });
    box.showNpcClue('book_shopkeeper');
    assert.equal(box.clueBubble.active, true);
    const pose = box.npcs[0].cels.currentClip;
    box.dismissClue();
    assert.equal(box.clueBubble.active, false);
    assert.equal(box.clueSeconds, 0);
    assert.equal(box.clueNpcId, null);
    box.update(0.08);
    assert.equal(box.clueBubble.active, false, 'the next resident update cannot reopen a dismissed bubble');
    assert.equal(box.npcs[0].cels.currentClip, pose);
    assert.equal(box.npcs[0].node.position.x, 200);
    assert.equal(box.conversationTurns.get('book_shopkeeper'), 1);
    box.showSceneClue('fountain_rest');
    assert.equal(box.clueBubble.active, true);
    box.dismissClue(); box.dismissClue(); box.update(0.08);
    assert.equal(box.clueBubble.active, false);
    assert.deepEqual(records, ['fountain_rest']);
    assert.equal(discovered.has('fountain_rest'), true);
    box.showNpcClue('book_shopkeeper');
    assert.equal(box.clueText.string, blueprint.npcClues.book_shopkeeper[1], 'closing a bubble preserves the next chat line');
    box.dispose(); assert.doesNotThrow(() => box.dismissClue());
});

test('sixteen residents retain separate art identities and every new side-view resident walks, rests and performs its own job', () => {
    const jobs = [['flower_shopkeeper', 'smell_flower'], ['book_shopkeeper', 'read_book'],
        ['sweet_shopkeeper', 'offer_sweet'], ['noodle_shopkeeper', 'stir_bowl'],
        ['garden_neighbor', 'water_flower'], ['laundry_neighbor', 'hang_cloth'],
        ['strolling_reader', 'read_book'], ['visiting_child', 'wave']];
    const originals = ['messenger_customer', 'tea_vendor', 'crossing_shopper', 'chestnut_seller',
        'lantern_watcher', 'tea_regular', 'flower_buyer', 'lane_child'];
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], standingSpots: [], sceneEvents: [], hiddenObjectSlots: [],
        npcPlans: [...originals.map((id, index) => ({ id, role: 'ambient', actorHeight: 86,
            footRadius: 15, route: [{ x: index * 100 - 400, y: 400 }], idleActions: ['short_pause'] })),
            ...jobs.map(([id, action], index) => ({ id, role: 'resident', actorHeight: 88, footRadius: 15,
                route: [{ x: index * 100 - 400, y: -200 }, { x: index * 100 - 360, y: -200 }],
                routeMode: 'ping_pong', initialPauseSeconds: index * 0.13, speedWorldUnitsPerSecond: 60,
                pauseSecondsAtWaypoints: { 0: 3.5, 1: 3.5 }, idleActions: [action, 'short_pause'] }))] };
    const box = new LivingCityGreybox(map, { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {});
    assert.equal(box.npcs.length, 16);
    assert.equal(new Set(box.npcs.map(npc => npc.cels.folder)).size, 16);
    for (const npc of box.npcs) {
        assert.equal(npc.cels.actorId, npc.plan.id); assert.equal(npc.cels.folder, `cels/${npc.plan.id}`);
    }
    const observed = new Map(jobs.map(([id]) => [id, new Set()]));
    let asynchronousJobFrame = false;
    for (let index = 0; index < 500; index++) {
        box.update(0.08);
        let jobsActive = 0;
        for (const npc of box.npcs.filter(npc => observed.has(npc.plan.id))) {
            observed.get(npc.plan.id).add(npc.cels.currentClip);
            assert.equal(npc.node.position.y, -200);
            assert.ok(['idle_w', 'walk_nw', 'receive_w'].includes(npc.cels.currentClip));
            if (npc.cels.currentClip === 'receive_w') jobsActive++;
        }
        if (jobsActive > 0 && jobsActive < 8) asynchronousJobFrame = true;
    }
    for (const [id, clips] of observed) {
        assert.equal(clips.has('walk_nw'), true, `${id} walking`);
        assert.equal(clips.has('idle_w'), true, `${id} resting`);
        assert.equal(clips.has('receive_w'), true, `${id} authored job`);
    }
    assert.equal(asynchronousJobFrame, true, 'resident jobs do not start as a synchronized crowd');
    box.dispose();
});

test('a tap in overlapping resident hit margins chooses the nearest body rather than blueprint order', () => {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], standingSpots: [], sceneEvents: [], hiddenObjectSlots: [],
        npcClues: { tea_regular: '茶还是暖的。', book_shopkeeper: '风翻过一页书。' },
        npcPlans: [{ id: 'tea_regular', role: 'resident', actorHeight: 88, footRadius: 15, route: [{ x: 0, y: 0 }] },
            { id: 'book_shopkeeper', role: 'resident', actorHeight: 88, footRadius: 15, route: [{ x: 0, y: 45 }] }] };
    const box = new LivingCityGreybox(map, { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {});
    assert.equal(box.clueTarget.activate(0, 89).id, 'book_shopkeeper');
    assert.equal(box.clueTarget.activate(0, 44).id, 'tea_regular');
    box.dispose();
});

test('ground overlays each load into their own ordered, positioned node below the facades', () => {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const grounds = [
        { id: 'map_base', layer: 'ground', center: { x: 0, y: 0 }, size: { width: 2304, height: 2048 } },
        { id: 'book_courtyard', layer: 'ground', center: { x: -700, y: 450 }, size: { width: 420, height: 220 } },
        { id: 'flower_path', layer: 'ground', center: { x: -620, y: 180 }, size: { width: 500, height: 180 } },
    ];
    const facade = { id: 'book_facade', layer: 'building_back', center: { x: -820, y: 760 },
        size: { width: 320, height: 320 } };
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [grounds[0], facade, ...grounds.slice(1)],
        standingSpots: [], sceneEvents: [], hiddenObjectSlots: [], npcPlans: [] };
    const loadStart = sceneArtLoads.length;
    const box = new LivingCityGreybox(map, { node: new Node('Depth'), sort: () => {} },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {});
    const back = box.backRoot;
    assert.deepEqual(back.children.map(child => child.name), [...grounds.map(slot => slot.id), facade.id]);
    const loads = sceneArtLoads.slice(loadStart);
    assert.deepEqual(loads.map(load => load.id), [...grounds.map(slot => slot.id), facade.id]);
    for (const [index, slot] of grounds.entries()) {
        const node = back.children[index];
        assert.equal(loads[index].parent, node, 'each overlay has its own Sprite target');
        assert.equal(node.parent, back);
        assert.equal(node.position.x, slot.center.x); assert.equal(node.position.y, slot.center.y);
        assert.equal(node.getComponent(UITransform).width, slot.size.width);
        assert.equal(node.getComponent(UITransform).height, slot.size.height);
    }
    assert.equal(box.artGroundLoaded, true);
    box.dispose();
});

function teaInteractionBox(discovered = new Set()) {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const current = JSON.parse(fs.readFileSync('design/street_block_01.json', 'utf8'));
    const blueprint = { id: current.id, map: current.map, camera: current.camera,
        artSlots: [], standingSpots: current.standingSpots, hiddenObjectSlots: [],
        npcPlans: current.npcPlans.filter(npc => ['tea_vendor', 'tea_regular'].includes(npc.id)),
        npcClues: { tea_vendor: ['刚泡好的，尝一口？', '不急，茶还热着。'] },
        sceneEvents: [current.sceneEvents.find(event => event.id === 'tea_exchange'),
            { id: 'tea_invitation', trigger: { npcId: 'tea_vendor', waypointIndex: 0 },
                tapTriggerNpcId: 'tea_vendor', participants: ['tea_vendor'], repeat: true,
                cooldownSeconds: 8, resumeRouteAfterSeconds: 1.5, discoveryId: 'tea_break',
                actorBeats: [{ npcId: 'tea_vendor', clip: 'receive_w', atSeconds: 0,
                    durationSeconds: 1.5, facing: 1 }] }] };
    const records = []; const targetReads = []; const found = new Set(['postcard']);
    const box = new LivingCityGreybox(map,
        { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { getInfoWithPath: () => ({}), load: (assetPath, _type, callback) =>
            callback(null, assetPath === 'street_block_01' ? { json: blueprint } : new SpriteFrame()) },
        [], () => {}, 'street_block_01', blueprint.id,
        { hasFoundTarget: id => { targetReads.push(id); return found.has(id); },
            hasDiscovery: id => discovered.has(id),
            recordDiscovery: id => { records.push(id); discovered.add(id); } });
    return { box, discovered, records, targetReads, found, blueprint,
        vendor: box.npcs.find(npc => npc.plan.id === 'tea_vendor'),
        regular: box.npcs.find(npc => npc.plan.id === 'tea_regular') };
}

test('a real tea-vendor tap offers a free cup, records only its completed discovery, and leaves the regular moving', () => {
    const { box, vendor, regular, records, discovered, targetReads, found } = teaInteractionBox();
    for (let count = 0; count < 5; count++) box.update(0.08);
    assert.equal(box.clueBubble.active, false);
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), null);
    const hit = box.clueTarget.activate(vendor.node.position.x, vendor.node.position.y + 43);
    assert.equal(hit.id, 'tea_vendor'); assert.equal(hit.tags[0], 'npc_clue');
    const before = { ...regular.node.position };
    box.showSceneClue(hit.id);
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), 0);
    assert.equal(box.clueText.string, '刚泡好的，尝一口？');
    assert.deepEqual(records, [], 'clicking has not yet finished drinking tea');
    for (let count = 0; count < 10; count++) box.update(0.08);
    assert.equal(vendor.cels.currentClip, 'receive_w');
    assert.equal(regular.cels.currentClip, 'walk_n');
    assert.ok(regular.node.position.y > before.y, 'the invitation does not reserve or teleport the wandering regular');
    assert.equal(box.eventDirector.isParticipant('tea_regular'), false);
    assert.deepEqual(records, []);
    for (let count = 0; count < 10; count++) box.update(0.08);
    assert.deepEqual(records, ['tea_break']); assert.equal(discovered.has('tea_break'), true);
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), null);
    box.showSceneClue('tea_vendor');
    assert.equal(box.clueText.string, '不急，茶还热着。', 'cooldown taps still rotate ordinary chat');
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), null);
    assert.deepEqual(targetReads, [], 'tea is not a hint or a required-object request');
    assert.equal(found.has('postcard'), true);
    for (let count = 0; count < 140; count++) box.update(0.08);
    box.showSceneClue('tea_vendor');
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), 0, 'an already earned break can replay for free');
    for (let count = 0; count < 20; count++) box.update(0.08);
    assert.deepEqual(records, ['tea_break'], 'replaying awards no duplicate save record');
    box.dispose();
});

test('tea taps during the regular handoff do not take the vendor, and the single cup changes owner without duplicates', () => {
    const { box, vendor, regular, records } = teaInteractionBox();
    let observed = false; let cupStages = new Set();
    for (let count = 0; count < 180; count++) {
        box.update(0.08);
        const seconds = box.eventDirector.eventSeconds('tea_exchange');
        if (seconds === null) { if (observed) break; continue; }
        observed = true;
        if (seconds < 0.35) {
            cupStages.add('table'); assert.equal(box.cupMarker.active, true);
            assert.equal(vendor.cels.currentClip, 'idle_w'); assert.equal(regular.cels.currentClip, 'idle_w');
        } else if (seconds < 0.8) {
            cupStages.add('vendor'); assert.equal(box.cupMarker.active, false);
            assert.equal(vendor.cels.currentClip, 'receive_w'); assert.equal(regular.cels.currentClip, 'idle_w');
        } else {
            cupStages.add('regular'); assert.equal(box.cupMarker.active, false);
            assert.equal(vendor.cels.currentClip, 'idle_w'); assert.equal(regular.cels.currentClip, 'receive_w');
        }
        box.showSceneClue('tea_vendor');
        assert.equal(box.eventDirector.eventSeconds('tea_invitation'), null, 'a player tap never interrupts a regular handoff');
    }
    assert.equal(observed, true); assert.deepEqual([...cupStages], ['table', 'vendor', 'regular']);
    assert.deepEqual(records, [], 'watching a neighbor drink tea does not award the player\'s optional discovery');
    box.dispose();
});

test('an unseen tea pose cannot grant the optional discovery, and restored discoveries remain idempotent', () => {
    const { box, vendor, records } = teaInteractionBox();
    vendor.cels.isReady = false;
    box.showNpcClue('tea_vendor');
    assert.equal(box.clueBubble.active, true, 'ordinary dialogue stays available while PNGs load');
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), null);
    vendor.cels.isReady = true; vendor.cels.supportsClip = () => false;
    box.showNpcClue('tea_vendor');
    assert.equal(box.eventDirector.eventSeconds('tea_invitation'), null);
    assert.deepEqual(records, []);
    box.dispose();
    const restored = teaInteractionBox(new Set(['tea_break']));
    restored.box.showNpcClue('tea_vendor');
    for (let count = 0; count < 20; count++) restored.box.update(0.08);
    assert.deepEqual(restored.records, [], 'a restored save keeps its earned optional break');
    assert.equal(restored.discovered.has('tea_break'), true);
    restored.box.dispose();
});

function dialogueViewportFixture(width = 444, height = 960) {
    const view = new Node('CityRoot'); view.addComponent(UITransform).setContentSize(width, height);
    // Parent transforms must be removed by coordinate conversion, not mistaken
    // for map zoom or added to viewport bounds.
    view.setPosition(180, 95, 0); view.setScale(1.25, 1.25, 1);
    const tray = new Node('TaskPanel'); view.addChild(tray);
    tray.addComponent(UITransform).setContentSize(width - 36, height > width ? 180 : 120);
    const trayHeight = tray.getComponent(UITransform).height;
    tray.setPosition(0, -height / 2 + trayHeight / 2 + 18, 0);
    const map = new Node('Map'); view.addChild(map);
    map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, standingSpots: [], sceneEvents: [], hiddenObjectSlots: [],
        artSlots: [{ id: 'fountain', layer: 'street_back', center: { x: 0, y: 0 }, size: { width: 120, height: 150 } }],
        sceneDiscoveries: [{ id: 'fountain_rest', supportArtSlotId: 'fountain', at: { x: 0, y: 0 },
            clickRadiusWorld: 70, message: '水声落在石边。' }],
        npcClues: { strolling_reader: ['风翻过一页书。', '今天的街上真热闹。'] },
        npcPlans: [{ id: 'strolling_reader', actorHeight: 88, footRadius: 15,
            route: [{ x: 0, y: 0 }], idleActions: ['short_pause'] }] };
    const records = [], discovered = new Set();
    const box = new LivingCityGreybox(map,
        { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {},
        'street_block_01', blueprint.id, { hasFoundTarget: () => false,
            hasDiscovery: id => discovered.has(id), recordDiscovery: id => { records.push(id); discovered.add(id); } });
    return { view, tray, map, box, npc: box.npcs[0], records };
}

function dialogueBounds(fixture) {
    const { view, box } = fixture;
    const viewport = view.getComponent(UITransform);
    const bubbleTransform = box.clueBubble.getComponent(UITransform);
    const points = [-1, 1].flatMap(sx => [-1, 1].map(sy => viewport.convertToNodeSpaceAR(
        bubbleTransform.convertToWorldSpaceAR(new Vec3(sx * bubbleTransform.width / 2,
            sy * bubbleTransform.height / 2, 0)))));
    const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
    const bottom = Math.min(...points.map(point => point.y)), top = Math.max(...points.map(point => point.y));
    return { left, right, bottom, top, width: right - left, height: top - bottom,
        x: (left + right) / 2, y: (bottom + top) / 2 };
}

function assertDialogueFits(fixture) {
    const viewport = fixture.view.getComponent(UITransform), bounds = dialogueBounds(fixture);
    const margin = Math.max(12, Math.min(24, Math.min(viewport.width, viewport.height) * 0.025));
    const epsilon = 1e-8;
    assert.ok(bounds.left >= -viewport.width / 2 + margin - epsilon, 'entire left edge stays in the viewport');
    assert.ok(bounds.right <= viewport.width / 2 - margin + epsilon, 'entire right edge stays in the viewport');
    assert.ok(bounds.top <= viewport.height / 2 - margin + epsilon, 'entire top edge stays in the viewport');
    assert.ok(bounds.bottom >= -viewport.height / 2 + margin - epsilon);
    if (fixture.tray.activeInHierarchy) {
        const trayTransform = fixture.tray.getComponent(UITransform);
        const trayTop = viewport.convertToNodeSpaceAR(trayTransform.convertToWorldSpaceAR(
            new Vec3(0, trayTransform.height * (1 - trayTransform.anchorPoint.y), 0))).y;
        assert.ok(bounds.bottom >= trayTop + margin - epsilon, 'the panel cannot cover the collection tray');
    }
    return bounds;
}

test('zoomed resident dialogue keeps the complete PNG and text inside both screen edges and the top margin', () => {
    const f = dialogueViewportFixture();
    for (const zoom of [0.7, 1.4, 3.2]) {
        f.map.setScale(zoom, zoom, 1);
        f.map.setPosition(-280, 140, 0);
        for (const x of [-1080, 1080]) {
            f.npc.node.setPosition(x, 950, 0);
            f.box.showNpcClue('strolling_reader');
            const bounds = assertDialogueFits(f);
            assert.ok(Math.abs(bounds.width - 444 * 0.7) < 1e-8,
                'the same dialogue remains about seventy percent of the viewport at every zoom');
            assert.equal(f.box.clueText.fontSize, 25, 'node scaling keeps text and the existing PNG in the same ratio');
        }
    }
    f.box.dispose();
});

test('resident dialogue follows camera pan and zoom while its full bottom edge stays above the actual scaled tray', () => {
    const f = dialogueViewportFixture();
    f.tray.setScale(1, 1.15, 1);
    f.npc.node.setPosition(0, -920, 0);
    f.map.setScale(2.8, 2.8, 1);
    f.box.showNpcClue('strolling_reader');
    const first = assertDialogueFits(f);
    f.map.setPosition(450, -360, 0); f.map.setScale(3.4, 3.4, 1);
    f.box.update(0.08);
    const after = assertDialogueFits(f);
    assert.ok(Math.abs(after.width - first.width) < 1e-8, 'zoom does not enlarge the visible panel');
    f.tray.active = false; f.box.update(0.08);
    const noTray = assertDialogueFits(f);
    assert.ok(noTray.bottom < after.bottom, 'hiding the tray releases its former reserved space');
    assert.equal(f.box.clueNpcId, 'strolling_reader');
    assert.deepEqual(f.records, [], 'layout changes do not award discoveries or change conversations');
    f.box.dispose();
});

test('facility dialogue tracks its stored world point through dragging, zooming and resizing without another tap', () => {
    const f = dialogueViewportFixture();
    f.map.setPosition(0, -150, 0);
    f.box.showSceneClue('fountain_rest');
    const before = assertDialogueFits(f);
    f.map.setPosition(30, 60, 0); f.box.update(0.08);
    const panned = assertDialogueFits(f);
    assert.ok(Math.abs(panned.x - before.x - 30) < 1e-8);
    assert.ok(Math.abs(panned.y - before.y - 210) < 1e-8,
        'facility bubbles now follow a camera drag just like resident bubbles');
    f.map.setScale(2.6, 2.6, 1); f.map.setPosition(-170, -400, 0); f.box.update(0.08);
    assertDialogueFits(f);
    f.view.getComponent(UITransform).setContentSize(360, 780);
    f.tray.getComponent(UITransform).setContentSize(324, 150);
    f.tray.setPosition(0, -297, 0); f.box.update(0.08);
    const resized = assertDialogueFits(f);
    assert.ok(Math.abs(resized.width - 360 * 0.7) < 1e-8);
    assert.equal(f.box.cluePoint.x, 0); assert.equal(f.box.cluePoint.y, 95);
    assert.deepEqual(f.records, ['fountain_rest'], 'resize and pan retain a single facility discovery');
    f.box.dismissClue(); f.box.update(0.08);
    assert.equal(f.box.cluePoint, null); assert.equal(f.box.clueBubble.active, false);
    f.box.dispose();
});

test('landscape dialogue limits its full height while keeping the existing collection tray clear', () => {
    const f = dialogueViewportFixture(844, 390);
    f.map.setScale(3.4, 3.4, 1); f.map.setPosition(390, 240, 0);
    f.npc.node.setPosition(900, 940, 0); f.box.showNpcClue('strolling_reader');
    const bounds = assertDialogueFits(f);
    assert.ok(Math.abs(bounds.height - 390 * 0.24) < 1e-8);
    assert.ok(bounds.width <= 844 * 0.7);
    f.box.dispose();
});

const renewedClips = ['idle_w', 'walk_nw', 'walk_n', 'walk_ne', 'receive_w'];

function renewedResidentsFixture({ plans, sceneEvents = [], discovered = new Set(), clues } = {}) {
    const map = new Node('Map'); map.addComponent(UITransform).setContentSize(2304, 2048);
    const depthNode = new Node('Depth'); map.addChild(depthNode);
    const blueprint = { id: 'living_city_street_block_01', map: { width: 2304, height: 2048 },
        camera: { initialFocus: { x: 0, y: 0 } }, artSlots: [], standingSpots: [], hiddenObjectSlots: [],
        npcClues: clues ?? Object.fromEntries(plans.map(plan => [plan.id, ['今天的风真舒服。', '慢慢走呀。']])),
        npcPlans: plans.map(plan => ({ actorHeight: 88, footRadius: 13, idleActions: ['short_pause'],
            speedWorldUnitsPerSecond: 100, ...plan })), sceneEvents };
    const records = [], targetReads = [];
    const box = new LivingCityGreybox(map,
        { node: depthNode, sort: () => {}, addActor: node => depthNode.addChild(node) },
        { load: (_path, _type, callback) => callback(null, { json: blueprint }) }, [], () => {},
        'street_block_01', blueprint.id, { hasFoundTarget: id => { targetReads.push(id); return false; },
            hasDiscovery: id => discovered.has(id), recordDiscovery: id => { records.push(id); discovered.add(id); } });
    for (const npc of box.npcs) npc.cels.supportedClips = new Set(renewedClips);
    return { box, records, discovered, targetReads };
}

test('renewed messenger chooses true north rear, south front and mirrored side cels from the route heading', () => {
    for (const [dx, dy, clip, facing] of [[60, 300, 'walk_n', 1], [-60, 300, 'walk_n', 1],
        [300, 40, 'walk_nw', 1], [-300, 40, 'walk_nw', -1],
        [50, -300, 'walk_ne', 1], [-50, -300, 'walk_ne', 1]]) {
        const { box } = renewedResidentsFixture({ plans: [{ id: 'messenger_customer',
            route: [{ x: 0, y: 0 }, { x: dx, y: dy }], loop: false }] });
        box.update(0.08);
        const npc = box.npcs[0];
        assert.equal(npc.moving, true);
        assert.equal(npc.cels.currentClip, clip, `heading for (${dx}, ${dy})`);
        assert.equal(npc.cels.facing, facing, 'only side cels mirror; north and south retain their real anatomy');
        assert.ok(npc.cels.states.every(state => renewedClips.includes(state)), 'no ungenerated legacy pose is requested');
        box.dispose();
    }
});

test('renewed messenger resumes directly after events and rests in its real idle cel at the route end', () => {
    const sceneEvents = [{ id: 'mail_pause', trigger: { npcId: 'messenger_customer', waypointIndex: 1 },
        resumeRouteAfterSeconds: 0.16, actorBeats: [{ npcId: 'messenger_customer', clip: 'idle_w',
            atSeconds: 0, durationSeconds: 0.16 }] }];
    const { box } = renewedResidentsFixture({ plans: [{ id: 'messenger_customer',
        route: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 20, y: 150 }], loop: false }], sceneEvents });
    box.update(0.08); box.update(0.08); box.update(0.08);
    const npc = box.npcs[0];
    assert.equal(npc.turnSeconds, 0, 'a sheet without turn cels incurs no legacy turn pause');
    assert.equal(npc.moving, true); assert.equal(npc.cels.currentClip, 'walk_n');
    for (let count = 0; count < 40; count++) box.update(0.08);
    assert.equal(npc.nextIndex, 3); assert.equal(npc.cels.currentClip, 'idle_w');
    assert.ok(npc.cels.states.every(state => renewedClips.includes(state)));
    box.dispose();
});

test('legacy messenger retains its painted diagonal walking, event turn and terminal idle in other chapters', () => {
    for (const [dx, expected] of [[60, 'walk_ne'], [-60, 'walk_nw'], [10, 'walk_n']]) {
        const { box } = renewedResidentsFixture({ plans: [{ id: 'messenger_customer',
            route: [{ x: 0, y: 0 }, { x: dx, y: 300 }] }] });
        const npc = box.npcs[0]; npc.cels.supportedClips = null;
        box.update(0.08); assert.equal(npc.cels.currentClip, expected); assert.equal(npc.cels.facing, 1);
        for (let count = 0; count < 70; count++) box.update(0.08);
        assert.equal(npc.cels.currentClip, 'idle_ne');
        box.dispose();
    }
    const { box } = renewedResidentsFixture({ plans: [{ id: 'messenger_customer',
        route: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 20, y: 150 }] }],
        sceneEvents: [{ id: 'mail_pause', trigger: { npcId: 'messenger_customer', waypointIndex: 1 },
            resumeRouteAfterSeconds: 0.16, actorBeats: [{ npcId: 'messenger_customer', clip: 'idle_w',
                atSeconds: 0, durationSeconds: 0.16 }] }] });
    const npc = box.npcs[0]; npc.cels.supportedClips = null;
    box.update(0.08); box.update(0.08); box.update(0.08);
    assert.ok(Math.abs(npc.turnSeconds - (0.35 - 0.08)) < 1e-9); assert.equal(npc.moving, false);
    assert.equal(npc.cels.currentClip, 'turn_w_ne');
    for (let count = 0; count < 6; count++) box.update(0.08);
    assert.equal(npc.moving, true, 'the legacy authored turn completes before departure');
    box.dispose();
});

function ordinaryResidentActivity(id, actorId) {
    return { id, trigger: { npcId: actorId, waypointIndex: 0 }, tapTriggerNpcId: actorId,
        participants: [actorId], repeat: true, cooldownSeconds: 8, discoveryId: id,
        resumeRouteAfterSeconds: 1.6, actorBeats: [{ npcId: actorId, clip: 'receive_w',
            atSeconds: 0, durationSeconds: 1.6, facing: 1 }] };
}

test('ordinary neighbor taps play their own job, pause locally, persist after completion and replay without duplicate records', () => {
    const { box, records, targetReads } = renewedResidentsFixture({ plans: [
        { id: 'flower_buyer', route: [{ x: -400, y: -100 }, { x: -200, y: -100 }] },
        { id: 'lane_child', route: [{ x: 100, y: 100 }, { x: 100, y: -100 }] },
        { id: 'strolling_reader', route: [{ x: 400, y: -100 }, { x: 600, y: -100 }] }],
        sceneEvents: [ordinaryResidentActivity('flower_scent', 'flower_buyer'),
            ordinaryResidentActivity('child_wave', 'lane_child')] });
    box.update(0.08);
    const [flower, child, reader] = box.npcs;
    const positions = box.npcs.map(npc => ({ ...npc.node.position }));
    for (const npc of [flower, child]) {
        const hit = box.clueTarget.activate(npc.node.position.x, npc.node.position.y + 44);
        assert.equal(hit.id, npc.plan.id); box.showSceneClue(hit.id);
    }
    assert.equal(flower.cels.currentClip, 'receive_w'); assert.equal(child.cels.currentClip, 'receive_w');
    assert.deepEqual(records, []);
    for (let count = 0; count < 19; count++) box.update(0.08);
    assert.deepEqual(flower.node.position, positions[0]); assert.deepEqual(child.node.position, positions[1]);
    assert.ok(reader.node.position.x > positions[2].x, 'unrelated neighbors keep strolling');
    assert.deepEqual(records, [], 'the optional memories require the whole generated action');
    box.update(0.08);
    assert.deepEqual(new Set(records), new Set(['flower_scent', 'child_wave']));
    assert.ok(flower.node.position.x > positions[0].x && child.node.position.y < positions[1].y,
        'each resident resumes the existing route from the actual held footpoint');
    assert.deepEqual(targetReads, [], 'neighbor moments never consume or read required targets');
    box.showNpcClue('flower_buyer'); assert.equal(box.eventDirector.eventSeconds('flower_scent'), null);
    for (let count = 0; count < 100; count++) box.update(0.08);
    box.showNpcClue('flower_buyer'); assert.equal(box.eventDirector.eventSeconds('flower_scent'), 0);
    for (let count = 0; count < 20; count++) box.update(0.08);
    assert.equal(records.length, 2, 'a repeated moment never duplicates a saved discovery');
    box.dispose();
});

test('tapping an already active idle job restarts its real cels once and never restarts on blocked taps', () => {
    const { box } = renewedResidentsFixture({ plans: [{ id: 'flower_buyer', route: [{ x: 0, y: 0 }],
        idleActions: ['look_at_flowers'] }], sceneEvents: [ordinaryResidentActivity('flower_scent', 'flower_buyer')] });
    const npc = box.npcs[0]; npc.cels.setState('receive_w'); npc.cels.states = [];
    box.showNpcClue('flower_buyer');
    assert.deepEqual(npc.cels.states, ['idle_w', 'receive_w'], 'only real existing poses reset the one-shot frame clock');
    assert.equal(npc.cels.currentClip, 'receive_w');
    npc.cels.states = []; box.showNpcClue('flower_buyer');
    assert.deepEqual(npc.cels.states, [], 'rapid repeated taps leave the running action at its current frame');
    for (let count = 0; count < 20; count++) box.update(0.08);
    npc.cels.states = []; box.showNpcClue('flower_buyer');
    assert.deepEqual(npc.cels.states, [], 'cooldown taps keep the finished action clock intact');
    box.dispose();
});

test('ordinary resident activities require real loaded job cels and preserve previously saved memories', () => {
    for (const readiness of ['loading', 'unsupported', 'ready']) {
        const { box, records } = renewedResidentsFixture({ plans: [{ id: 'lane_child', route: [{ x: 0, y: 0 }] }],
            discovered: new Set(['child_wave']), sceneEvents: [ordinaryResidentActivity('child_wave', 'lane_child')] });
        const npc = box.npcs[0];
        if (readiness === 'loading') npc.cels.isReady = false;
        if (readiness === 'unsupported') npc.cels.supportedClips.delete('receive_w');
        box.showNpcClue('lane_child');
        assert.equal(box.clueBubble.active, true, 'chat remains available while art streams in');
        assert.equal(box.eventDirector.eventSeconds('child_wave'), readiness === 'ready' ? 0 : null);
        for (let count = 0; count < 20; count++) box.update(0.08);
        assert.deepEqual(records, [], 'missing or already saved activities never award another memory');
        box.dispose();
    }
});
