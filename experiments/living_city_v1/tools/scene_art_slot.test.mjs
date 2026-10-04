import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
class UITransform { setContentSize(width, height) { this.width = width; this.height = height; } }
class Sprite { static SizeMode = { CUSTOM: 1 }; }
class SpriteFrame { constructor(width, height) { this.originalSize = { width, height }; } }
class Node {
    constructor(name) { this.name = name; this.children = []; this.isValid = true; this.active = true; }
    insertChild(child, index) { this.children.splice(index, 0, child); }
    addComponent(Type) { const component = new Type(); this[Type.name] = component; return component; }
}
const warnings = [];
const cc = { UITransform, Sprite, SpriteFrame, Node, warn: (...args) => warnings.push(args) };
const sourcePath = path.resolve('assets/scripts/map/SceneArtSlot.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports,
    require: name => name === 'cc' ? cc : require(name) }, { filename: sourcePath });
const { loadSceneArtSlot } = module.exports;

function fixture(available, frame, density = 1) {
    warnings.length = 0;
    const requests = [];
    const bundle = {
        getInfoWithPath: () => available,
        load: (resourcePath, _type, callback) => { requests.push(resourcePath); callback(frame ? null : Error('missing'), frame); },
    };
    const node = new Node('lc_tea_counter_front');
    const label = new Node('Label_tea_counter');
    node.children.push(label);
    const fallback = { enabled: true };
    let loaded = 0;
    loadSceneArtSlot(bundle, node.name, node, fallback, { width: 56, height: 171 }, () => loaded++, density);
    return { node, label, fallback, loaded, requests };
}

{
    const result = fixture(false, null);
    assert.equal(result.fallback.enabled, true);
    assert.deepEqual(result.requests, []);
}
{
    const result = fixture(true, new SpriteFrame(64, 171));
    assert.equal(result.fallback.enabled, true);
    assert.equal(result.label.active, true);
    assert.equal(result.loaded, 0);
    assert.equal(result.node.children.length, 1);
    assert.equal(warnings.length, 1);
}
{
    const result = fixture(true, new SpriteFrame(56, 171));
    assert.equal(result.fallback.enabled, false);
    assert.equal(result.label.active, false);
    assert.equal(result.loaded, 1);
    assert.equal(result.node.children[0].name, 'lc_tea_counter_front_art');
    assert.equal(result.node.children[0].UITransform.height, 171);
    assert.equal(result.node.children[0].Sprite.sizeMode, Sprite.SizeMode.CUSTOM);
    assert.equal(result.requests[0], 'simple2d_scene/lc_tea_counter_front/spriteFrame');
}
{
    const result = fixture(true, new SpriteFrame(168, 513), 3);
    assert.equal(result.loaded, 1);
    assert.equal(result.node.children[0].UITransform.width, 56);
    assert.equal(result.node.children[0].UITransform.height, 171);
    assert.equal(result.node.children[0].Sprite.spriteFrame.originalSize.width, 168);
    assert.equal(warnings.length, 0);
}
for (const density of [0, 1.5, 5]) {
    const result = fixture(true, new SpriteFrame(56 * density, 171 * density), density);
    assert.equal(result.loaded, 0);
    assert.equal(result.fallback.enabled, true);
}
console.log('Scene art slot loading, independent texture density, registration and fallback: passed');
