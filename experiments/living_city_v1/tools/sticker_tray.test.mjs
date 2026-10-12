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
    getChildByName(name) { return this.children.find(child => child.name === name) ?? null; }
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
        mapSize: { width: 2304, height: 2048 },
        hiddenObjects: Array.from({ length: count }, (_, i) => ({ id: `item_${i}`, displayName: `物品${i}`,
            clue: `陈列${i}`, visualSize: { width: 32, height: 28 },
            targetable: true, x: 0.25, y: 0.75 })) };
    view.foundCount = completed.length;
    view.artBundle = {};
    view.taskManager = {
        getProgress: () => ({ requiredCompleted: completed.length, requiredTotal: count,
            allRequiredComplete: completed.length === count }),
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
        assert.equal(card.background.enabled, true);
        assert.equal(card.background.color.g > card.background.color.r, id === 'item_2');
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
    assert.ok(visible(view).every(card=>card.icon.color.a===255&&card.background.enabled));
    assert.ok(view.journalProgressLabel.string.includes('12/24'));
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
    view.stickerClueLabel.string = '点卡片看线索，卡住时点「帮我找」。';
    view.onStickerMouseDown(eventAt(point));
    view.onStickerMouseMove(eventAt({ x: point.x - 100, y: point.y }));
    view.onStickerMouseUp(eventAt({ x: point.x - 100, y: point.y }));
    assert.equal(view.stickerPage, 1);
    assert.equal(view.stickerClueLabel.string, '点卡片看线索，卡住时点「帮我找」。');
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
    assert.equal(view.stickerClueLabel.string, '点卡片看线索，卡住时点「帮我找」。');
    view.onStickerMouseDown(eventAt(point)); view.onStickerMouseUp(eventAt({ x: point.x - 100, y: point.y }));
    assert.equal(view.stickerPage, 0);
});

test('selection follows the last pending card and clears after collection without losing its acknowledgement', () => {
    const completed=[];
    const view=fixture(32,completed);
    view.showStickerClue('item_2');
    assert.equal(view.selectedStickerId,'item_2');
    assert.notDeepEqual(view.stickerCards.get('item_2').background.color,Color.WHITE);
    view.showStickerClue('item_7');
    assert.deepEqual(view.stickerCards.get('item_2').background.color,Color.WHITE);
    assert.equal(view.selectedStickerId,'item_7');
    completed.push('item_7');view.renderTaskPanel();
    assert.equal(view.selectedStickerId,null);
    assert.equal(view.stickerClueLabel.string,'物品7已收进手账，接着慢慢找。');
    assert.equal(view.stickerCards.get('item_7').check.node.active,true);
});

test('a fresh first city offers an uncovered existing item without awarding progress', () => {
    const view = fixture();
    view.cityConfig.hiddenObjects[0].visibleCondition = { objectId: 'cover', state: 'opened' };
    const focus = [];
    view.controller = { focusAt: (x, y) => focus.push({ x, y }) };
    view.createWelcomePrompt();
    view.offerFirstFind();
    assert.equal(view.welcomePrompt.active, true);
    assert.equal(view.selectedStickerId, 'item_1');
    assert.deepEqual(focus, [{ x: -576, y: 512 }]);
    assert.equal(view.progress.requiredCompleted, 0);
    assert.equal(view.foundCount, 0);
    view.showStickerClue('item_3');
    view.offerFirstFind();
    assert.equal(view.selectedStickerId, 'item_3', 'Late scene readiness must not overwrite a player choice');
    assert.equal(focus.length, 1);
});

test('returning players and later cities skip the welcome and first-find focus', () => {
    for (const view of [fixture(12, ['item_2']), fixture(12, Array.from({ length: 12 }, (_, i) => `item_${i}`)),
        fixture()]) {
        if (view.foundCount === 0) view.cityConfig.cityId = 'living_city_garden_market_02';
        view.controller = { focusAt: () => assert.fail('Returning player was redirected') };
        view.createWelcomePrompt();
        view.offerFirstFind();
        assert.equal(view.welcomePrompt, null);
        assert.equal(view.selectedStickerId, null);
    }
});

test('a complete journal invites strolling instead of asking the player to find more items', () => {
    const view = fixture(12, Array.from({ length: 12 }, (_, i) => `item_${i}`));
    assert.equal(view.stickerClueLabel.string, '小东西都找齐了，可以再逛一会儿。');
    view.showStickerClue('item_1');
    assert.equal(view.selectedStickerId, null);
    assert.equal(view.stickerClueLabel.string, '小东西都找齐了，可以再逛一会儿。');
});

test('the welcome fits phone and landscape screens and retires without blocking map input', () => {
    const view = fixture();
    view.createWelcomePrompt();
    for (const [width, height] of [[1080, 2340], [1332, 2880], [1280, 720]]) {
        view.node.getComponent(UITransform).setContentSize(width, height);
        view.resizeDisplay();
        const prompt = view.welcomePrompt;
        const bounds = prompt.getComponent(UITransform);
        assert.ok(Math.abs(prompt.position.x) + bounds.width / 2 <= width / 2);
        assert.ok(prompt.position.y + bounds.height / 2 <= height / 2);
        assert.ok(prompt.position.y - bounds.height / 2 > view.taskPanel.position.y +
            view.taskPanel.getComponent(UITransform).height / 2);
        assert.equal(view.isOverWelcomePrompt(prompt.worldPosition.x, prompt.worldPosition.y), true);
        assert.equal(view.isOverWelcomePrompt(prompt.worldPosition.x, prompt.worldPosition.y - bounds.height), false);
    }
    view.lateUpdate(16);
    assert.equal(view.welcomePrompt.active, false);
    assert.equal(view.isOverWelcomePrompt(view.welcomePrompt.worldPosition.x, view.welcomePrompt.worldPosition.y), false);
    assert.equal(view.progress.requiredCompleted, 0);
});

test('journal separates progress, cards and clues and does not report an in-flight item as stored', () => {
    const view=fixture(12,['item_2']);
    view.collectionFlights.set('item_2',{});view.renderTaskPanel();
    assert.equal(view.journalProgressLabel.string,'已找到 0/12');
    assert.equal(view.stickerCards.get('item_2').check.node.active,false);
    view.collectionFlights.clear();view.renderTaskPanel();
    assert.equal(view.journalProgressLabel.string,'已找到 1/12');
    for(const [width,height] of [[1080,2340],[1332,2880],[1280,720]]) {
        view.node.getComponent(UITransform).setContentSize(width,height);view.resizeDisplay();
        const badge=view.journalProgressLabel.node.parent;
        const badgeBottom=badge.position.y-badge.getComponent(UITransform).height/2;
        const clueTop=view.journalCluePaper.position.y+view.journalCluePaper.getComponent(UITransform).height/2;
        for(const card of visible(view)) {
            const size=card.node.getComponent(UITransform);
            assert.ok(card.node.position.y+size.height/2<badgeBottom,'Header overlaps card');
            assert.ok(card.node.position.y-size.height/2>clueTop,'Clue overlaps card');
        }
    }
});
