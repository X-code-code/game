import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
for (const modulePath of [
    'typescript',
    'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript',
]) {
    try { ts = require(modulePath); break; } catch { /* Try the bundled compiler. */ }
}
if (!ts) throw new Error('TypeScript is required to run the cel-player source test');

class UITransform {
    setContentSize(width, height) { this.width = width; this.height = height; }
    setAnchorPoint(x, y) { this.anchorX = x; this.anchorY = y; }
}
class Sprite {
    static SizeMode = { CUSTOM: 1 };
}
class SpriteFrame {
    constructor(width = 256, height = 256) { this.originalSize = { width, height }; }
}
class Graphics { enabled = true; }
class JsonAsset {}
class Node {
    constructor(name) { this.name = name; this.isValid = true; this.children = []; }
    addChild(child) { this.children.push(child); }
    addComponent(Type) {
        const component = new Type();
        this[Type.name] = component;
        return component;
    }
}

const warnings = [];
const cc = { UITransform, Sprite, SpriteFrame, Graphics, JsonAsset, Node,
    warn: (...args) => warnings.push(args) };
const sourcePath = path.resolve('assets/scripts/character/CelAnimationPlayer.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
    // Match Creator's legacy downleveling; Set spread once became [object Set].
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports,
    require: name => name === 'cc' ? cc : require(name), Map, Set, Number },
{ filename: sourcePath });
const { CelAnimationPlayer } = module.exports;

const folder = 'cels/messenger_customer';
const manifestPath = `${folder}/manifest`;
function validManifest() {
    const clips = {};
    for (const name of ['walk_n', 'walk_nw', 'walk_ne', 'turn_nw_w',
        'idle_w', 'receive_w', 'turn_w_ne', 'idle_ne']) {
        clips[name] = Array.from({ length: name.startsWith('idle_') ? 1 : 2 }, (_, index) => ({
            asset: `${name}_${index}`, durationSeconds: 0.1,
        }));
    }
    return { schemaVersion: 1, actorId: 'messenger_customer',
        canvasPx: { width: 256, height: 256 }, footpointPx: { x: 128, y: 215 },
        paintedHeightPx: 180, clips };
}

function makePlayer(manifest, missingPath = null, wrongSizePath = null) {
    warnings.length = 0;
    const paths = new Set([manifestPath]);
    const assets = new Map([[manifestPath, { json: manifest }]]);
    if (manifest) {
        for (const frames of Object.values(manifest.clips ?? {})) {
            for (const entry of frames) {
                const framePath = `${folder}/${entry.asset}/spriteFrame`;
                if (framePath !== missingPath) paths.add(framePath);
                assets.set(framePath, framePath === wrongSizePath
                    ? new SpriteFrame(128, 256) : new SpriteFrame());
            }
        }
    }
    const requests = [];
    const bundle = {
        getInfoWithPath: value => paths.has(value),
        load: (value, _type, callback) => {
            requests.push(value);
            callback(assets.has(value) ? null : new Error('missing'), assets.get(value));
        },
    };
    const actor = new Node('messenger_customer');
    const graphic = new Graphics();
    const nameLabel = { active: true };
    const player = new CelAnimationPlayer(actor, graphic, nameLabel,
        bundle, 'messenger_customer', folder, 120);
    return { player, actor, graphic, nameLabel, requests, assets };
}

// No manifest: skip the request and keep the diagnostic actor intact.
{
    const actor = new Node('messenger_customer');
    const graphic = new Graphics();
    const label = { active: true };
    const requests = [];
    const player = new CelAnimationPlayer(actor, graphic, label,
        { getInfoWithPath: () => null, load: value => requests.push(value) },
        'messenger_customer', folder, 120);
    assert.equal(player.isReady, false);
    assert.equal(graphic.enabled, true);
    assert.equal(label.active, true);
    assert.deepEqual(requests, []);
}

for (const mutate of [
    data => { delete data.clips.walk_ne; },
    data => { data.paintedHeightPx = 250; },
    data => { data.footpointPx.y = 270; },
]) {
    const manifest = validManifest();
    mutate(manifest);
    const { player, graphic, nameLabel, requests } = makePlayer(manifest);
    assert.equal(player.isReady, false);
    assert.equal(graphic.enabled, true);
    assert.equal(nameLabel.active, true);
    assert.deepEqual(requests, [manifestPath]);
}

{
    const manifest = validManifest();
    const missing = `${folder}/walk_ne_1/spriteFrame`;
    const { player, graphic, requests } = makePlayer(manifest, missing);
    assert.equal(player.isReady, false);
    assert.equal(graphic.enabled, true);
    assert.deepEqual(requests, [manifestPath]);
}

{
    const manifest = validManifest();
    const wrongSize = `${folder}/walk_n_1/spriteFrame`;
    const { player, graphic } = makePlayer(manifest, null, wrongSize);
    assert.equal(player.isReady, false);
    assert.equal(graphic.enabled, true);
}

{
    const { player, actor, graphic, nameLabel, assets } = makePlayer(validManifest());
    assert.equal(player.isReady, true);
    assert.equal(graphic.enabled, false);
    assert.equal(nameLabel.active, false);
    const visual = actor.children[0];
    assert.equal(visual.UITransform.anchorX, 0.5);
    assert.ok(Math.abs(visual.UITransform.anchorY - (1 - 215 / 256)) < 1e-9);
    assert.ok(Math.abs(visual.UITransform.height - 256 * 120 / 180) < 1e-9);
    player.setState('walk_nw');
    assert.equal(visual.Sprite.spriteFrame, assets.get(`${folder}/walk_nw_0/spriteFrame`));
    player.update(0.09);
    assert.equal(visual.Sprite.spriteFrame, assets.get(`${folder}/walk_nw_0/spriteFrame`));
    player.update(0.02);
    assert.equal(visual.Sprite.spriteFrame, assets.get(`${folder}/walk_nw_1/spriteFrame`));
    player.setState('receive_w');
    assert.equal(visual.Sprite.spriteFrame, assets.get(`${folder}/receive_w_0/spriteFrame`));
    player.update(0.11);
    assert.equal(visual.Sprite.spriteFrame, assets.get(`${folder}/receive_w_1/spriteFrame`));
    player.update(0.25);
    assert.equal(visual.Sprite.spriteFrame, assets.get(`${folder}/receive_w_1/spriteFrame`));
}

console.log('Cel animation manifest, registration, duration and fallback: passed');
