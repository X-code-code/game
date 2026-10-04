import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
class Vec3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class Color {
    constructor(r, g, b, a = 255) { Object.assign(this, { r, g, b, a }); }
    static WHITE = new Color(255, 255, 255);
}
class UITransform {
    setContentSize(width, height) { Object.assign(this, { width, height }); }
    setAnchorPoint() {}
    get contentSize() { return { width: this.width, height: this.height }; }
    convertToNodeSpaceAR(point) {
        const world = this.node.worldPosition;
        return new Vec3(point.x - world.x, point.y - world.y, point.z - world.z);
    }
}
class Node {
    constructor(name) {
        Object.assign(this, { name, children: [], components: new Map(), active: true, isValid: true,
            position: new Vec3(), scale: new Vec3(1, 1, 1) });
    }
    addChild(node) { node.parent = this; this.children.push(node); }
    addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
    getComponent(Type) { return this.components.get(Type) ?? null; }
    setPosition(x, y, z = 0) { this.position = typeof x === 'object' ? x : new Vec3(x, y, z); }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    get worldPosition() { const p = this.parent?.worldPosition ?? new Vec3(); return new Vec3(p.x + this.position.x, p.y + this.position.y, p.z + this.position.z); }
}
class Sprite { static SizeMode = { CUSTOM: 1 }; constructor() { this.enabled = true; } }
class Label { static HorizontalAlign = { LEFT: 0, CENTER: 1 }; static VerticalAlign = { TOP: 0, CENTER: 1 }; static Overflow = { SHRINK: 1 }; }
class Graphics {}
class Component {}
const cc = { Vec3, Color, UITransform, Node, Sprite, Label, Graphics, Component,
    _decorator: { ccclass: () => Type => Type }, input: { on() {}, off() {} },
    Input: { EventType: {} }, EventMouse: { BUTTON_LEFT: 0 } };
const sourcePath = path.resolve('assets/scripts/map/MapBrowserDemo.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015, experimentalDecorators: true },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports,
    require: name => name === 'cc' ? cc : name.endsWith('/GeneratedUi')
        ? { generatedUi: node => node.addComponent(Sprite) } : name.endsWith('/HintTargetRegistry')
            ? { HintTargetRegistry: class {} } : {} }, { filename: sourcePath });
const { MapBrowserDemo } = module.exports;

function fixture(count = 12, completed = []) {
    const view = new MapBrowserDemo();
    view.node = new Node('CityRoot');
    view.node.addComponent(UITransform).setContentSize(1080, 2335);
    view.cityConfig = { cityId: 'living_city_street_block_01', cityName: '茶摊街区',
        hiddenObjects: Array.from({ length: count }, (_, i) => ({ id: `item_${i}`, displayName: `物品${i}`,
            clue: `陈列${i}`, visualSize: { width: 32, height: 28 } })) };
    view.artBundle = {};
    view.taskManager = {
        getProgress: () => ({ requiredCompleted: completed.length, requiredTotal: count }),
        getTaskStates: () => view.cityConfig.hiddenObjects.map(c => ({ config: { type: 'hiddenObject', targetId: c.id },
            completed: completed.includes(c.id) })),
    };
    view.loadPrototypeFrame = (_path, callback) => callback({});
    view.createTaskPanel();
    view.resizeDisplay();
    return view;
}
const visible = view => [...view.stickerCards.values()].filter(card => card.node.activeInHierarchy);
const eventAt = (point, id = 1) => ({ simulate: false, getID: () => id, getButton: () => 0, getUILocation: () => point });

test('all pending objects stay full-color; completion uses a distinct check and soft card', () => {
    const view = fixture(12, ['item_2']);
    assert.equal(visible(view).length, 12);
    for (const [id, card] of view.stickerCards) {
        assert.deepEqual(card.icon.color, Color.WHITE);
        assert.equal(card.background.enabled, id === 'item_2');
        assert.equal(card.check.node.active, id === 'item_2');
        assert.equal(card.collected, id === 'item_2');
        assert.ok(card.icon.node.getComponent(UITransform).width >= 80);
    }
    assert.equal(view.stickerPageLabel.node.active, false);
});

test('an expanded 24-target tray preserves 12 restored discoveries and exposes 12 new full-color targets', () => {
    const legacy = Array.from({length:12},(_,index)=>`item_${index}`);
    const view = fixture(24,legacy);
    assert.equal(view.stickerPageLabel.string,'‹  1/2  ›');
    assert.equal(visible(view).length,12);
    assert.ok(visible(view).every(card=>card.collected&&card.check.node.active));
    view.changeStickerPage(1);
    assert.equal(view.stickerPageLabel.string,'‹  2/2  ›');
    assert.equal(visible(view).length,12);
    assert.ok(visible(view).every(card=>!card.collected&&!card.check.node.active));
    assert.ok(visible(view).every(card=>card.icon.color.a===255&&!card.background.enabled));
    assert.ok(view.taskTitleLabel.string.includes('12/24'));
    view.showStickerPageFor('item_0');assert.equal(view.stickerPage,0);
    view.showStickerPageFor('item_23');assert.equal(view.stickerPage,1);
});

test('32 targets occupy three pages and the eight new objects remain full-color after restoring 24', () => {
    const view = fixture(32, Array.from({length:24},(_,i)=>`item_${i}`));
    for (const [page, count] of [[0, 12], [1, 12], [2, 8]]) {
        view.stickerPage = page; view.relayoutStickerPage();
        assert.equal(visible(view).length, count);
        assert.equal(view.stickerPageLabel.string, `‹  ${page + 1}/3  ›`);
        assert.ok(visible(view).every(card=>card.collected===(page<2)));
        if(page===2)assert.ok(visible(view).every(card=>card.icon.color.a===255));
        const panel = view.taskPanel.getComponent(UITransform);
        for (const card of visible(view)) {
            const size = card.node.getComponent(UITransform);
            assert.ok(Math.abs(card.node.position.x) + size.width / 2 <= panel.width / 2);
            assert.ok(Math.abs(card.node.position.y) + size.height / 2 <= panel.height / 2);
        }
    }
    view.changeStickerPage(1); assert.equal(view.stickerPage, 2);
    view.changeStickerPage(-10); assert.equal(view.stickerPage, 0);
});

test('the two-row tray also fits a landscape viewport without overlapping its footer', () => {
    const view = fixture(28);
    view.node.getComponent(UITransform).setContentSize(1280, 720);
    view.resizeDisplay();
    const panel = view.taskPanel.getComponent(UITransform);
    const footer = view.stickerClueLabel.node.position.y;
    assert.equal(visible(view).length, 12);
    for (const card of visible(view)) {
        const size = card.node.getComponent(UITransform);
        assert.ok(Math.abs(card.node.position.x) + size.width / 2 <= panel.width / 2);
        assert.ok(card.node.position.y - size.height / 2 > footer);
        assert.ok(card.icon.node.getComponent(UITransform).width >= 40);
    }
});

test('clicking a card keeps its clue, while a horizontal swipe changes page without showing it', () => {
    const view = fixture(28);
    const point = view.stickerCards.get('item_2').node.worldPosition;
    view.onStickerMouseDown(eventAt(point)); view.onStickerMouseUp(eventAt(point));
    assert.equal(view.stickerClueLabel.string, '物品2：陈列2');
    view.stickerClueLabel.string = '轻点物品看线索';
    view.onStickerMouseDown(eventAt(point));
    view.onStickerMouseMove(eventAt({ x: point.x - 100, y: point.y }));
    view.onStickerMouseUp(eventAt({ x: point.x - 100, y: point.y }));
    assert.equal(view.stickerPage, 1);
    assert.equal(view.stickerClueLabel.string, '轻点物品看线索');
});

test('pinches, vertical drags and drags beginning outside the tray never change page', () => {
    const view = fixture(28);
    const point = view.stickerCards.get('item_2').node.worldPosition;
    view.onStickerTouchStart(eventAt(point, 1)); view.onStickerTouchStart(eventAt(point, 2));
    view.onStickerTouchEnd(eventAt(point, 2)); view.onStickerTouchEnd(eventAt({ x: point.x - 100, y: point.y }, 1));
    assert.equal(view.stickerPage, 0);
    view.onStickerMouseDown(eventAt(point)); view.onStickerMouseUp(eventAt({ x: point.x - 30, y: point.y + 100 }));
    assert.equal(view.stickerPage, 0);
    const outside = { x: point.x, y: point.y + 1000 };
    view.onStickerMouseDown(eventAt(outside)); view.onStickerMouseUp(eventAt({ x: outside.x - 100, y: outside.y }));
    assert.equal(view.stickerPage, 0);
});

test('page control and collection focus work, with pages locked during flight and landing', () => {
    const view = fixture(28);
    const page = view.stickerPageLabel.node.worldPosition;
    const next = { x: page.x + 35, y: page.y };
    view.onStickerMouseDown(eventAt(next)); view.onStickerMouseUp(eventAt(next));
    assert.equal(view.stickerPage, 1);
    view.showStickerPageFor('item_27'); assert.equal(view.stickerPage, 2);
    assert.equal(view.stickerCards.get('item_27').node.activeInHierarchy, true);
    view.collectionFlights.set('item_27', {}); view.changeStickerPage(-1); assert.equal(view.stickerPage, 2);
    view.collectionFlights.clear(); view.collectionLandingAnimations = 1;
    view.changeStickerPage(-1); assert.equal(view.stickerPage, 2);
    view.collectionLandingAnimations = 0; view.changeStickerPage(-1); assert.equal(view.stickerPage, 1);
});

test('external overlays block both card clues and tray page gestures', () => {
    const view = fixture(28);
    view.blocksExternalInput = () => true;
    const point = view.stickerCards.get('item_2').node.worldPosition;
    view.onStickerMouseDown(eventAt(point)); view.onStickerMouseUp(eventAt(point));
    assert.equal(view.stickerClueLabel.string, '轻点物品看线索');
    view.onStickerMouseDown(eventAt(point)); view.onStickerMouseUp(eventAt({ x: point.x - 100, y: point.y }));
    assert.equal(view.stickerPage, 0);
});
