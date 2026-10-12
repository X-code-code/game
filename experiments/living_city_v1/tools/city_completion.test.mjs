import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { LIVING_CITY_SAVE_KEY, SaveManager } from '../assets/scripts/save/SaveManager.ts';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
class Vec3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class Color { constructor(r, g, b, a = 255) { Object.assign(this, { r, g, b, a }); } }
class Component { constructor() { this.isValid = true; } }
class UITransform {
    setContentSize(width, height) {
        if (typeof width === 'object') ({ width, height } = width);
        Object.assign(this, { width, height });
    }
    get contentSize() { return { width: this.width, height: this.height }; }
    convertToNodeSpaceAR(point) { return point; }
}
class Node {
    constructor(name) {
        Object.assign(this, { name, children: [], components: new Map(), events: new Map(),
            active: true, isValid: true, position: new Vec3(), scale: new Vec3(1, 1, 1) });
    }
    addChild(node) { node.parent = this; this.children.push(node); }
    addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
    getComponent(Type) { return this.components.get(Type) ?? null; }
    getChildByName(name) { return this.children.find(child => child.name === name) ?? null; }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    setPosition(x, y, z = 0) { this.position = new Vec3(x, y, z); }
    setScale(x, y, z = 1) { this.scale = new Vec3(x, y, z); }
    setSiblingIndex() {}
    on(name, action) { this.events.set(name, action); }
    destroy() { this.active = false; this.isValid = false; }
}
class Sprite {}
class Button { static EventType = { CLICK: 'click' }; constructor() { this.interactable = true; } }
class Label {
    static HorizontalAlign = { CENTER: 1 };
    static VerticalAlign = { CENTER: 1 };
    static Overflow = { SHRINK: 1 };
}
class MapBrowserDemo extends Component {
    mount(config, bundle, report, blocksInput, snapshot) {
        Object.assign(this, { config, report, blocksInput, callbacks: [], hintsEnabled: true, flights: false });
        this.snapshot = { completedTaskIds: [], foundHiddenObjectIds: [], discoveredChickenIds: [],
            interactiveStates: {}, sceneDiscoveryIds: [], ...snapshot };
        const found = new Set(this.snapshot.foundHiddenObjectIds);
        this.snapshot.foundHiddenObjectIds = config.hiddenObjects.filter(item => found.has(item.id)).map(item => item.id);
        this.snapshot.completedTaskIds = config.tasks.filter(task => found.has(task.targetId)).map(task => task.id);
    }
    get progress() {
        const count = this.snapshot.foundHiddenObjectIds.length;
        return { requiredCompleted: count, requiredTotal: this.config.tasks.length,
            allRequiredComplete: count === this.config.tasks.length, optionalCompleted: 0, optionalTotal: 0 };
    }
    get discoveries() { return { chickens: 0, objects: this.snapshot.foundHiddenObjectIds.length }; }
    getProgressSnapshot() { return this.snapshot; }
    afterCollectionFlight(callback) { if (this.flights) this.callbacks.push(callback); else callback(); }
    cancelGestures() { this.cancelled = true; }
    setHintsEnabled(enabled) { this.hintsEnabled = enabled; }
    collectAll() {
        this.snapshot.foundHiddenObjectIds = this.config.hiddenObjects.map(item => item.id);
        this.snapshot.completedTaskIds = this.config.tasks.map(task => task.id);
        this.flights = true;
        this.report(this.progress);
    }
    land() { this.flights = false; this.callbacks.splice(0).forEach(callback => callback()); }
    dispose() { this.disposed = true; this.callbacks.length = 0; }
}
function loadSource(filename, cc, dependencies = {}) {
    const source = path.resolve(filename), module = { exports: {} };
    const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015, experimentalDecorators: true },
    }).outputText;
    vm.runInNewContext(output, { module, exports: module.exports,
        require: name => name === 'cc' ? cc : dependencies[name] ?? {} }, { filename: source });
    return module.exports;
}
function city(id, chapterIndex, nextCityId = null) {
    const hiddenObjects = Array.from({ length: 12 }, (_, i) => ({ id: `${id}_${i}`, targetable: true }));
    return { cityId: id, cityName: id === 'street' ? '茶摊街区' : '花园集市', chapterIndex, chapterCount: 3,
        nextCityId, hiddenObjects, chickens: [],
        tasks: hiddenObjects.map(item => ({ id: `find_${item.id}`, type: 'hiddenObject', targetId: item.id, required: true })) };
}
function fullProgress(config) {
    return { completedTaskIds: config.tasks.map(task => task.id),
        foundHiddenObjectIds: config.hiddenObjects.map(item => item.id), discoveredChickenIds: [],
        interactiveStates: { basket: 'opened' }, sceneDiscoveryIds: ['tea_break'] };
}
function harness() {
    const afterDraw = [], cc = { _decorator: { ccclass: () => Type => Type }, Component, Node,
        Color, Label, Button, UITransform, Vec3, profiler: { hideStats() {} }, warn() {},
        director: { once(_event, callback) { afterDraw.push(callback); } }, Director: { EVENT_AFTER_DRAW: 'after-draw' } };
    const { CityCompletionPanel } = loadSource('assets/scripts/ui/CityCompletionPanel.ts', cc, {
        './GeneratedUi': { generatedUi: node => node.addComponent(Sprite) },
    });
    const { CityManager } = loadSource('assets/scripts/city/CityManager.ts', cc, {
        '../map/MapBrowserDemo': { MapBrowserDemo }, '../ui/CityCompletionPanel': { CityCompletionPanel },
    });
    const first = city('street', 1, 'garden'), second = city('garden', 2, 'harbor');
    const stored = new Map(), save = new SaveManager({ loadLocal: key => stored.get(key) ?? null,
        saveLocal: (key, value) => stored.set(key, value) }, first.cityId, LIVING_CITY_SAVE_KEY);
    const loads = [], contents = [first, second].map(config => ({ config, bundle: {}, releases: 0,
        release() { this.releases++; } }));
    const loader = { catalog: { cities: [] }, async load(id) { loads.push(id); return contents.find(c => c.config.cityId === id); } };
    const manager = new CityManager();
    manager.node = new Node('Canvas'); manager.node.addComponent(UITransform).setContentSize(1080, 2340);
    return { manager, save, stored, first, second, contents, loader, loads, afterDraw };
}
const click = node => node.events.get(Button.EventType.CLICK)();
const caption = node => node.getChildByName('Text').getComponent(Label).string;

test('restored completion keeps the street playable and its saved unlocks, with an optional journey entry', () => {
    const h = harness();
    h.save.recordCityProgress(h.first.cityId, fullProgress(h.first));
    h.save.recordCityCompletion(h.first.cityId, h.second.cityId);
    h.save.recordCityProgress(h.second.cityId, { completedTaskIds: ['find_garden_0'],
        foundHiddenObjectIds: ['garden_0'], discoveredChickenIds: [] });
    const before = JSON.stringify(h.save.getSnapshot());
    h.manager.initialize(h.loader, h.contents[0], h.save);
    assert.equal(h.manager.ui.isOpen, false);
    assert.equal(h.manager.ui.entry.active, true);
    assert.equal(h.manager.current.view.hintsEnabled, true);
    assert.equal(h.manager.ui.blocksInput(9000, 9000), false);
    assert.equal(JSON.stringify(h.save.getSnapshot()), before);
    assert.deepEqual(h.loads, [], 'showing completion must not prefetch a destination');
    click(h.manager.ui.entry);
    assert.equal(h.manager.ui.isOpen, true);
    assert.equal(h.manager.current.view.hintsEnabled, false);
    assert.equal(h.manager.ui.summary.string, '12 件物品已找到\n第 1 站 · 共 3 站');
    assert.equal(caption(h.manager.ui.continueButton), '再逛一会儿');
    assert.equal(caption(h.manager.ui.nextButton), '去下一站');
    assert.ok(!h.manager.ui.message.string.includes('继续寻找'), 'a finished collection should not request more objects');
    click(h.manager.ui.continueButton);
    assert.equal(h.manager.ui.isOpen, false);
    assert.equal(h.manager.current.view.hintsEnabled, true);
    assert.equal(JSON.stringify(h.save.getSnapshot()), before);
});

test('a new last pickup saves immediately and celebrates only after the collection flight lands', () => {
    const h = harness(); h.manager.initialize(h.loader, h.contents[0], h.save);
    const view = h.manager.current.view;
    assert.equal(h.manager.ui.entry.active, false);
    view.collectAll();
    assert.equal(h.save.getCityProgress(h.first.cityId).foundHiddenObjectIds.length, 12);
    assert.equal(h.manager.ui.isOpen, false);
    assert.equal(h.save.isCityCompleted(h.first.cityId), false);
    view.land();
    assert.equal(h.manager.ui.isOpen, true);
    assert.equal(h.save.isCityCompleted(h.first.cityId), true);
    assert.equal(h.save.isCityUnlocked(h.second.cityId), true);
    assert.equal(h.manager.current.view.hintsEnabled, false);
});

test('travel to a restored completed city offers its entry and preserves progress while retiring the old view', async () => {
    const h = harness();
    for (const config of [h.first, h.second]) {
        h.save.recordCityProgress(config.cityId, fullProgress(config));
        h.save.recordCityCompletion(config.cityId, config.nextCityId);
    }
    h.manager.initialize(h.loader, h.contents[0], h.save);
    const old = h.manager.current;
    await h.manager.goNext();
    assert.equal(h.manager.current.content.config.cityId, h.second.cityId);
    assert.equal(h.save.getCurrentCityId(), h.second.cityId);
    assert.equal(h.save.getCityProgress(h.second.cityId).foundHiddenObjectIds.length, 12);
    assert.equal(h.save.isCityUnlocked('harbor'), true);
    assert.equal(h.manager.ui.isOpen, false);
    assert.equal(h.manager.ui.entry.active, true);
    assert.equal(h.manager.current.view.hintsEnabled, true);
    assert.equal(old.view.disposed, true);
    assert.equal(h.contents[0].releases, 0, 'assets must outlive deferred node destruction');
    h.afterDraw.splice(0).forEach(callback => callback());
    assert.equal(h.contents[0].releases, 1);
});

test('staying during destination loading ignores late results and keeps the completed street and save', async () => {
    const h = harness();
    h.save.recordCityProgress(h.first.cityId, fullProgress(h.first));
    h.save.recordCityCompletion(h.first.cityId, h.second.cityId);
    h.manager.initialize(h.loader, h.contents[0], h.save);
    const old = h.manager.current;
    let resolve; h.loader.load = () => new Promise(done => { resolve = done; });
    const travel = h.manager.goNext();
    assert.equal(h.manager.ui.isOpen, true);
    assert.equal(h.manager.ui.nextButton.getComponent(Button).interactable, false);
    click(h.manager.ui.continueButton);
    resolve(h.contents[1]); await travel;
    assert.equal(h.manager.current, old);
    assert.equal(h.save.getCurrentCityId(), h.first.cityId);
    assert.equal(h.manager.ui.isOpen, false);
    assert.equal(old.view.hintsEnabled, true);
    assert.equal(h.contents[1].releases, 1);
});

test('failed travel remains retryable, and a final stop never shows a next-stop button', async () => {
    const h = harness();
    h.save.recordCityProgress(h.first.cityId, fullProgress(h.first));
    h.manager.initialize(h.loader, h.contents[0], h.save);
    h.loader.load = async () => { throw new Error('offline'); };
    await h.manager.goNext();
    assert.equal(h.manager.current.content.config.cityId, h.first.cityId);
    assert.equal(h.save.getCurrentCityId(), h.first.cityId);
    assert.equal(h.manager.ui.nextButton.getComponent(Button).interactable, true);
    assert.equal(caption(h.manager.ui.nextButton), '重试去下一站');
    assert.equal(caption(h.manager.ui.continueButton), '再逛一会儿');
    h.manager.ui.show({ cityName: '河畔码头', hasNext: false, chapterIndex: 3, chapterCount: 3,
        progress: h.manager.current.view.progress, chickens: 0, objects: 12 });
    assert.equal(h.manager.ui.nextButton.active, false);
    assert.equal(h.manager.ui.summary.string, '12 件物品已找到\n第 3 站 · 共 3 站');
    assert.ok(h.manager.ui.message.string.includes('慢慢逛逛'));
});
