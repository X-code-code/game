import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
const handlers = new Map();
const input = {
    on(type, callback, owner) { handlers.set(type, { callback, owner }); },
    off(type) { handlers.delete(type); },
};
const EventType = Object.fromEntries(['TOUCH_START', 'TOUCH_MOVE', 'TOUCH_END', 'TOUCH_CANCEL',
    'MOUSE_DOWN', 'MOUSE_MOVE', 'MOUSE_UP', 'MOUSE_WHEEL'].map(name => [name, name]));
const cc = { input, Input: { EventType }, EventMouse: { BUTTON_LEFT: 0 } };
const sourcePath = path.resolve('assets/scripts/gameplay/TargetInput.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports, require: () => cc }, { filename: sourcePath });
const { TargetInput } = module.exports;

function fixture(targets = [], blocked = () => false) {
    handlers.clear();
    const hits = [], misses = [];
    const router = new TargetInput(targets, hit => hits.push(hit), blocked, (x, y) => misses.push({ x, y }));
    const send = (type, x, y, id = 1) => {
        const handler = handlers.get(type);
        handler?.callback.call(handler.owner, { simulate: false, getID: () => id,
            getUILocation: () => ({ x, y }), getButton: () => 0 });
    };
    return { router, hits, misses, send };
}

test('an empty mouse or touch tap reports one gentle feedback location', () => {
    const f = fixture();
    f.send('MOUSE_DOWN', 200, 240); f.send('MOUSE_UP', 204, 243);
    f.send('TOUCH_START', 300, 340); f.send('TOUCH_END', 302, 342);
    assert.deepEqual(f.misses, [{ x: 204, y: 243 }, { x: 302, y: 342 }]);
    assert.equal(f.hits.length, 0);
    f.router.dispose();
});

test('a drag that returns to its starting point never becomes a missed tap', () => {
    const f = fixture();
    f.send('MOUSE_DOWN', 200, 240); f.send('MOUSE_MOVE', 260, 240); f.send('MOUSE_UP', 200, 240);
    f.send('TOUCH_START', 300, 340); f.send('TOUCH_MOVE', 300, 390); f.send('TOUCH_END', 300, 340);
    assert.equal(f.misses.length, 0);
    f.router.dispose();
});

test('a two-finger pinch invalidates both remaining finger taps', () => {
    const f = fixture();
    f.send('TOUCH_START', 200, 240, 1); f.send('TOUCH_START', 260, 240, 2);
    f.send('TOUCH_END', 260, 240, 2); f.send('TOUCH_END', 200, 240, 1);
    assert.equal(f.misses.length, 0);
    f.router.dispose();
});

test('taps starting or finishing over UI never report an empty-scene miss', () => {
    const f = fixture([], x => x < 100);
    f.send('MOUSE_DOWN', 95, 240); f.send('MOUSE_UP', 103, 240);
    f.send('MOUSE_DOWN', 103, 240); f.send('MOUSE_UP', 95, 240);
    f.send('TOUCH_START', 95, 240); f.send('TOUCH_END', 103, 240);
    f.send('TOUCH_START', 103, 240); f.send('TOUCH_END', 95, 240);
    assert.equal(f.misses.length, 0);
    f.router.dispose();
});

test('scroll zoom while the mouse is pressed cancels its tap', () => {
    const f = fixture();
    f.send('MOUSE_DOWN', 200, 240); f.send('MOUSE_WHEEL', 200, 240); f.send('MOUSE_UP', 200, 240);
    assert.equal(f.misses.length, 0);
    f.router.dispose();
});

test('successful targets and unavailable target activations never report misses', () => {
    let available = true;
    const hit = { type: 'hiddenObject', id: 'flower', tags: ['garden'] };
    const f = fixture([{ hitTest: x => x > 100, activate: () => available ? hit : null }]);
    f.send('MOUSE_DOWN', 200, 240); f.send('MOUSE_UP', 200, 240);
    available = false;
    f.send('MOUSE_DOWN', 200, 240); f.send('MOUSE_UP', 200, 240);
    assert.deepEqual(f.hits, [hit]);
    assert.equal(f.misses.length, 0);
    f.router.dispose();
});

test('canceling or disposing the router clears gestures and all event listeners', () => {
    const f = fixture();
    f.send('MOUSE_DOWN', 200, 240); f.router.cancelGestures(); f.send('MOUSE_UP', 200, 240);
    f.send('TOUCH_START', 200, 240); f.send('TOUCH_CANCEL', 200, 240); f.send('TOUCH_END', 200, 240);
    assert.equal(f.misses.length, 0);
    f.router.dispose();
    assert.equal(handlers.size, 0);
});
