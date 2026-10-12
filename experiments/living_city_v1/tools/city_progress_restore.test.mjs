import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { TaskManager } from '../assets/scripts/task/TaskManager.ts';
import { HintManager } from '../assets/scripts/hint/HintManager.ts';
import { HintTargetRegistry } from '../assets/scripts/hint/HintTargetRegistry.ts';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
class Vec3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class UITransform {
    setContentSize(width, height) { Object.assign(this, { width, height }); }
    setAnchorPoint() {}
    get contentSize() { return { width: this.width, height: this.height }; }
}
class Component {}
class Node {
    constructor(name) { Object.assign(this, { name, active: true, isValid: true,
        children: [], components: new Map(), position: new Vec3() }); }
    addChild(child) { child.parent = this; this.children.push(child); }
    addComponent(Type) { const result = new Type(); result.node = this; this.components.set(Type, result); return result; }
    getComponent(Type) { return this.components.get(Type) ?? null; }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    setPosition(x, y, z = 0) { this.position = new Vec3(x, y, z); }
}
class Graphics {}
class Sprite {}
class Label {}
class Color { constructor(...values) { this.values = values; } }
class CityAmbientLife { configure() {} }
class SceneDepthLayer {
    constructor(map) { this.node = new Node('Depth'); map.addChild(this.node); }
    sort() {}
    addForeground() {}
}
class HintPanel { blocksInput() { return false; } }
class CityViewController { focusAt() {} }
class SceneInteraction {
    constructor(config, _mapSize, _bundle, _depth, restored) {
        this.config = config; this.state = restored === 'opened' ? restored : config.initialState;
        this.node = new Node(config.id);
    }
    get available() { return this.state !== 'opened'; }
    hitTest() { return false; }
    setState(state) { this.state = state; }
}
class LivingCityGreybox {
    constructor(_map, _depth, _bundle, _targets, _ready, _blueprint, _cityId, hooks) {
        this.hooks = hooks; this.shown = [];
        this.discoveryTarget = { hitTest: x => x === 10,
            activate: () => ({ type: 'scene', id: 'fountain_rest', tags: ['scene_discovery'] }) };
        this.clueTarget = { hitTest: x => x === 20,
            activate: () => ({ type: 'scene', id: 'messenger_customer', tags: ['npc_clue'] }) };
    }
    showSceneClue(id) {
        this.shown.push(id);
        if (id === 'fountain_rest') this.hooks.recordDiscovery(id);
        if (id === 'messenger_customer' && this.hooks.hasFoundTarget('item_13')) {
            this.hooks.recordDiscovery('postcard_delivery');
        }
    }
}
const cc = { _decorator: { ccclass: () => Type => Type }, Component, Node, Vec3, UITransform,
    Graphics, Sprite, Label, Color, input: { on() {}, off() {} }, Input: { EventType: {} },
    EventMouse: { BUTTON_LEFT: 0 } };
function loadSource(relative, dependencies = {}) {
    const filename = path.resolve(relative);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015, experimentalDecorators: true },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(output, { module, exports: module.exports,
        require: name => name === 'cc' ? cc : dependencies[name] ?? {} }, { filename });
    return module.exports;
}
const { TargetInput } = loadSource('assets/scripts/gameplay/TargetInput.ts');
const { MapBrowserDemo } = loadSource('assets/scripts/map/MapBrowserDemo.ts', {
    '../task/TaskManager': { TaskManager }, '../gameplay/TargetInput': { TargetInput },
    '../hint/HintManager': { HintManager }, '../hint/HintTargetRegistry': { HintTargetRegistry },
    '../ui/HintPanel': { HintPanel }, '../ui/GeneratedUi': { generatedUi: node => node.addComponent(Sprite) },
    './CityViewController': { CityViewController }, './CityAmbientLife': { CityAmbientLife },
    './SceneDepthLayer': { SceneDepthLayer }, './LivingCityGreybox': { LivingCityGreybox },
    '../interaction/SceneInteraction': { SceneInteraction },
});
const pairs = [['bookmark', 'book_satchel'], ['seedling_spade', 'garden_toolbox'], ['picnic_cookie', 'picnic_basket']];
function fixture(snapshot, blocked = () => false, suppliedConfig = null) {
    const view = new MapBrowserDemo(), entities = [];
    view.node = new Node('CityRoot'); view.node.addComponent(UITransform).setContentSize(1080, 2335);
    const hiddenObjects = Array.from({ length: 24 }, (_, i) => ({ id: `item_${i}`, targetable: true,
        tags: ['street'], clickArea: { shape: 'circle', radius: 30 }, scale: 1 }));
    pairs.forEach(([id, reveal], index) => Object.assign(hiddenObjects[21 + index], {
        id, visibleCondition: { objectId: reveal, state: 'opened' },
    }));
    const config = suppliedConfig ?? { cityId: 'living_city_street_block_01', sceneBlueprint: 'street_block_01',
        mapSize: { width: 2304, height: 2048 }, view: { minZoom: 0.5, maxZoom: 1.4 },
        hiddenObjects, chickens: [],
        tasks: hiddenObjects.map(object => ({ id: `find_${object.id}`, type: 'hiddenObject',
            targetId: object.id, required: true })),
        interactiveObjects: pairs.map(([, id]) => ({ id, initialState: 'closed', tags: [],
            actions: [{ objectId: id, state: 'opened' }] })) };
    let reports = 0, misses = 0;
    Object.assign(view, { createTaskPanel() {}, createWelcomePrompt() {}, resizeDisplay() {}, renderTaskPanel() {},
        startCollectionFlight() {}, showMissedTapFeedback() { misses++; },
        createObject(_depth, item) {
            const index = entities.length, entity = { node: new Node(item.id), isValid: true,
                found: false, visible: true, get hintAvailable() { return !this.found && this.visible; },
                restoreFound() { this.found = true; }, setVisible(visible) { this.visible = visible; },
                hitTest(x) { return !this.found && this.visible && x === (index === 13 ? 10 : 100 + index * 10); },
                activate(x) { if (!this.hitTest(x)) return null; this.found = true;
                    return { type: 'hiddenObject', id: item.id, tags: item.tags }; } };
            entities.push(entity); return entity;
        } });
    view.mount(config, {}, () => reports++, blocked, snapshot);
    return { view, config, entities, reports: () => reports, misses: () => misses };
}
const eventAt = (x, y = 0, id = 1) => ({ simulate: false, getID: () => id,
    getButton: () => 0, getUILocation: () => ({ x, y }) });
const tap = (view, x) => { view.targetInput.onMouseDown(eventAt(x)); view.targetInput.onMouseUp(eventAt(x)); };

test('current twelve-target chapter restores full and partial old32 saves without counting retired objects', () => {
    const config=JSON.parse(fs.readFileSync('assets/bundles/city_living_city_street_block_01/city.json'));
    const previous=JSON.parse(fs.readFileSync('art/production/target_reduction_v16/baseline_blueprint_v15.json'));
    const oldIds=previous.hiddenObjectSlots.map(t=>t.id),kept=config.hiddenObjects.map(t=>t.id);
    const retired=oldIds.filter(id=>!kept.includes(id));
    assert.equal(kept.length,12);assert.equal(retired.length,20);
    for(const found of [oldIds,[...kept.slice(0,3),...retired]]){
        const state={completedTaskIds:oldIds.map(id=>`find_${id}`),foundHiddenObjectIds:found,
            discoveredChickenIds:[],interactiveStates:Object.fromEntries(previous.interactiveSlots.map(i=>[i.id,'opened'])),sceneDiscoveryIds:['postcard_delivery']};
        const mounted=fixture(state,()=>false,config),expected=found.filter(id=>kept.includes(id)).length;
        assert.equal(mounted.view.progress.requiredTotal,12);
        assert.equal(mounted.view.progress.requiredCompleted,expected);
        assert.equal(mounted.view.progress.allRequiredComplete,expected===12);
        const saved=JSON.parse(JSON.stringify(mounted.view.getProgressSnapshot()));
        assert.equal(saved.foundHiddenObjectIds.length,expected);
        assert.equal(Object.keys(saved.interactiveStates).length,4);
        assert.deepEqual(saved.sceneDiscoveryIds,['postcard_delivery']);
        assert.equal(fixture(saved,()=>false,config).view.progress.requiredCompleted,expected);
    }
});

test('mounted 24-target city restores old12 from found objects and ignores stale cached task completions', () => {
    const oldIds = Array.from({ length: 12 }, (_, i) => `item_${i}`);
    const f = fixture({ completedTaskIds: [...oldIds.map(id => `find_${id}`), 'find_item_13', 'removed_task'],
        foundHiddenObjectIds: [...oldIds, 'removed_object'], discoveredChickenIds: [],
        interactiveStates: { book_satchel: 'opened' }, sceneDiscoveryIds: ['fountain_rest'] });
    assert.equal(f.view.progress.requiredCompleted, 12);
    assert.equal(f.view.progress.requiredTotal, 24);
    assert.equal(f.view.progress.allRequiredComplete, false);
    assert.equal(f.view.taskManager.isCompleted('find_item_13'), false);
    assert.equal(f.entities.slice(0, 12).every(entity => entity.found), true);
    assert.equal(f.reports(), 0, 'hydration does not report taps or emit a completion callback');
    const saved = JSON.parse(JSON.stringify(f.view.getProgressSnapshot()));
    assert.deepEqual(saved.foundHiddenObjectIds, oldIds);
    assert.deepEqual(saved.sceneDiscoveryIds, ['fountain_rest']);
    assert.equal(saved.interactiveStates.book_satchel, 'opened');
});

test('objects win over facilities at the same point, facilities win over misses and optional clues do not complete tasks', () => {
    const f = fixture();
    tap(f.view, 10);
    assert.equal(f.view.progress.requiredCompleted, 1);
    assert.equal(f.view.foundHiddenObjectIds.has('item_13'), true);
    assert.equal(f.view.livingGreybox.shown.length, 0, 'the facility cannot swallow a collectible');
    tap(f.view, 10); tap(f.view, 10); tap(f.view, 20);
    assert.equal(f.view.progress.requiredCompleted, 1);
    assert.equal(f.reports(), 3, 'one collectible, one facility, and one delivery each report once');
    assert.equal(f.misses(), 0);
    const saved = JSON.parse(JSON.stringify(f.view.getProgressSnapshot()));
    assert.deepEqual(saved.sceneDiscoveryIds, ['fountain_rest', 'postcard_delivery']);
    assert.deepEqual(saved.foundHiddenObjectIds, ['item_13']);
    const refreshed = fixture(saved);
    tap(refreshed.view, 10); tap(refreshed.view, 20);
    assert.equal(refreshed.reports(), 0, 'saved optional discoveries cannot be awarded twice');
    assert.equal(refreshed.view.progress.requiredCompleted, 1);
});

test('facility interactions remain drag-safe, pinch-safe, and recover after an external UI overlay closes', () => {
    let blocked = true;
    const f = fixture({ completedTaskIds: ['find_item_13'], foundHiddenObjectIds: ['item_13'], discoveredChickenIds: [] }, () => blocked);
    tap(f.view, 10); assert.equal(f.reports(), 0);
    blocked = false;
    f.view.targetInput.onMouseDown(eventAt(10)); f.view.targetInput.onMouseMove(eventAt(35));
    f.view.targetInput.onMouseUp(eventAt(10));
    f.view.targetInput.onTouchStart(eventAt(10, 0, 1)); f.view.targetInput.onTouchStart(eventAt(10, 0, 2));
    f.view.targetInput.onTouchEnd(eventAt(10, 0, 2)); f.view.targetInput.onTouchEnd(eventAt(10, 0, 1));
    assert.equal(f.reports(), 0); assert.equal(f.misses(), 0);
    tap(f.view, 10); assert.equal(f.reports(), 1);
    assert.equal(f.view.sceneDiscoveryIds.has('fountain_rest'), true);
});

test('all three new reveal IDs use config state for visibility and hint prerequisites', () => {
    const f = fixture();
    for (const [id, reveal] of pairs) {
        const entity = f.entities.find(entity => entity.node.name === id);
        const task = f.config.tasks.find(task => task.targetId === id);
        assert.equal(entity.visible, false);
        assert.equal(f.view.hintTargets.resolve(task)[0].id, reveal);
        f.view.interactions.get(reveal).setState('opened'); f.view.applyInteractionVisibility(f.entities);
        assert.equal(entity.visible, true);
        assert.equal(f.view.hintTargets.resolve(task)[0].id, id);
    }
    assert.equal(f.view.progress.requiredCompleted, 0, 'opening a container is not finding its object');
});

test('brief no-result feedback centers above the visible tray and returns to the compact corner button', () => {
    const f = fixture(), panel = new Node('Tray'), hint = new Node('Hint');
    panel.addComponent(UITransform).setContentSize(900, 320); panel.setPosition(0, -900);
    hint.scale = new Vec3(0.8, 0.8, 1);
    f.view.taskPanel = panel;
    f.view.hintPanel = { root: hint, hasTransientFeedback: true };
    f.view.positionStreetHintButton();
    assert.equal(hint.position.x, 0);
    assert.ok(hint.position.y - 37 * hint.scale.x > panel.position.y + 160);
    f.view.hintPanel.hasTransientFeedback = false; f.view.positionStreetHintButton();
    assert.equal(hint.position.x, 540 - 18 - 80 * hint.scale.x);
});

test('explicit hints dismiss existing dialogue before camera focus and preserve saved progress', () => {
    for (const status of ['shown', 'complete', 'unavailable']) {
        const f = fixture(), calls = [];
        const before = JSON.stringify(f.view.getProgressSnapshot());
        let sceneBubbleVisible = true, legacyBubbleVisible = true;
        f.view.livingGreybox.dismissClue = () => { sceneBubbleVisible = false; calls.push('scene-dismiss'); };
        f.view.conversations = { dismiss() { legacyBubbleVisible = false; calls.push('legacy-dismiss'); } };
        f.view.controller = { cancelGestures() {}, focusAt() {
            assert.equal(sceneBubbleVisible, false); assert.equal(legacyBubbleVisible, false);
            calls.push('focus');
        } };
        f.view.hintPanel = { showResult(result) { assert.equal(result.status, status); calls.push('hint-result'); } };
        f.view.positionStreetHintButton = () => {};
        if (status !== 'shown') f.view.hintManager = { requestHint: () => ({ status }) };
        f.view.requestHint();
        assert.deepEqual(calls, status === 'shown'
            ? ['scene-dismiss', 'legacy-dismiss', 'focus', 'hint-result']
            : ['scene-dismiss', 'legacy-dismiss', 'hint-result']);
        assert.equal(JSON.stringify(f.view.getProgressSnapshot()), before);
        assert.equal(f.reports(), 0, 'closing a transient bubble must not save or award a discovery');
    }
});

test('unavailable explicit-hint input leaves existing dialogue unchanged', () => {
    for (const guard of ['disabled', 'disposed', 'inactive', 'flight', 'landing']) {
        const f = fixture(); let dismissals = 0;
        f.view.livingGreybox.dismissClue = () => dismissals++;
        f.view.conversations = { dismiss() { dismissals++; } };
        f.view.hintManager = { requestHint() { assert.fail(`hint must stay blocked during ${guard}`); } };
        if (guard === 'disabled') f.view.hintsEnabled = false;
        if (guard === 'disposed') f.view.disposed = true;
        if (guard === 'inactive') f.view.node.active = false;
        if (guard === 'flight') f.view.collectionFlights.set('item_0', new Node('Flight'));
        if (guard === 'landing') f.view.collectionLandingAnimations = 1;
        f.view.requestHint();
        assert.equal(dismissals, 0, guard);
    }
});
