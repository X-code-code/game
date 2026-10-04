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
    setScale(x, y, z) { this.scale = { x, y, z }; }
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
    const actor = new Node(manifest?.actorId ?? 'messenger_customer');
    const graphic = new Graphics();
    const nameLabel = { active: true };
    const player = new CelAnimationPlayer(actor, graphic, nameLabel,
        bundle, manifest?.actorId ?? 'messenger_customer', folder, 120);
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

function sideViewManifest() {
    const data = validManifest();
    return { ...data, schemaVersion: 2, clips: {
        idle_w: [{ asset: 'idle_a', durationSeconds: 0.45 }, { asset: 'idle_b', durationSeconds: 0.45 }],
        walk_nw: [{ asset: 'walk_a', durationSeconds: 0.14 }, { asset: 'walk_b', durationSeconds: 0.14 }],
        receive_w: [{ asset: 'job_a', durationSeconds: 0.45 }, { asset: 'job_b', durationSeconds: 0.45 }],
    } };
}

// A six-cel actor requests only its own PNGs and never claims unpainted directions.
{
    const { player, actor, assets, requests } = makePlayer(sideViewManifest());
    assert.equal(player.isReady, true);
    assert.equal(player.supportsClip('idle_w'), true);
    assert.equal(player.supportsClip('walk_nw'), true);
    assert.equal(player.supportsClip('receive_w'), true);
    assert.equal(player.supportsClip('walk_n'), false);
    assert.equal(player.supportsClip('walk_ne'), false);
    assert.equal(requests.length, 7, 'one manifest and exactly six generated cels');
    const sprite = actor.children[0].Sprite;
    player.setState('walk_nw'); player.update(0.15);
    assert.equal(sprite.spriteFrame, assets.get(`${folder}/walk_b/spriteFrame`));
    player.setFacing(-1); assert.equal(actor.children[0].scale.x, -1);
    player.setState('receive_w'); player.update(0.25); player.update(0.25);
    assert.equal(sprite.spriteFrame, assets.get(`${folder}/job_b/spriteFrame`));
    player.update(0.25); player.update(0.25);
    assert.equal(sprite.spriteFrame, assets.get(`${folder}/job_b/spriteFrame`));
    player.setState('walk_n');
    assert.equal(sprite.spriteFrame, assets.get(`${folder}/idle_a/spriteFrame`), 'a missing view holds actual idle PNGs');
    assert.equal(warnings.length, 0);
}

// Four-cel production can express one true idle, two steps and one true job pose.
{
    const manifest = sideViewManifest();
    manifest.clips.idle_w = manifest.clips.idle_w.slice(0, 1);
    manifest.clips.receive_w = manifest.clips.receive_w.slice(0, 1);
    const { player, requests } = makePlayer(manifest);
    assert.equal(player.isReady, true);
    assert.equal(requests.length, 5);
}

for (const mutate of [
    data => { delete data.clips.idle_w; },
    data => { data.clips.walk_nw = data.clips.walk_nw.slice(0, 1); },
    data => { data.clips.receive_w = []; },
    data => { data.clips.water_plants = data.clips.receive_w; },
    data => { data.schemaVersion = 3; },
]) {
    const manifest = sideViewManifest(); mutate(manifest);
    const { player, requests } = makePlayer(manifest);
    assert.equal(player.isReady, false);
    assert.deepEqual(requests, [manifestPath]);
}

// A partial actor without a job pose never requests or substitutes ungenerated cels.
{
    const manifest = sideViewManifest(); delete manifest.clips.receive_w;
    const { player, actor, assets } = makePlayer(manifest);
    assert.equal(player.isReady, true);
    assert.equal(player.supportsClip('receive_w'), false);
    player.setState('receive_w');
    assert.equal(actor.children[0].Sprite.spriteFrame, assets.get(`${folder}/idle_a/spriteFrame`));
}

// New job cels can repeat inside a resident's station; old event poses still hold once.
{
    const manifest = sideViewManifest(); manifest.loopingClips = ['idle_w', 'walk_nw', 'receive_w'];
    const { player, actor, assets } = makePlayer(manifest);
    player.setState('receive_w');
    for (let index = 0; index < 4; index++) player.update(0.25);
    assert.equal(actor.children[0].Sprite.spriteFrame, assets.get(`${folder}/job_a/spriteFrame`));
    const legacy = validManifest(); legacy.loopingClips = ['receive_w'];
    const old = makePlayer(legacy); old.player.setState('receive_w');
    for (let index = 0; index < 4; index++) old.player.update(0.25);
    assert.equal(old.actor.children[0].Sprite.spriteFrame, old.assets.get(`${folder}/receive_w_1/spriteFrame`));
}

for (const loopingClips of [['walk_n'], ['ungenerated_action'], 'receive_w']) {
    const manifest = sideViewManifest(); manifest.loopingClips = loopingClips;
    assert.equal(makePlayer(manifest).player.isReady, false);
}

// A stationary tea vendor needs only two resting and two generated offering cels.
{
    const manifest = sideViewManifest(); delete manifest.clips.walk_nw;
    manifest.clips.receive_w.forEach(frame => { frame.durationSeconds = 0.2; });
    manifest.loopingClips = ['idle_w'];
    const { player, actor, assets, requests } = makePlayer(manifest);
    assert.equal(player.isReady, true); assert.equal(requests.length, 5);
    for (const clip of ['walk_n', 'walk_nw', 'walk_ne', 'turn_nw_w']) {
        assert.equal(player.supportsClip(clip), false, 'a stationary actor does not claim unpainted walking views');
    }
    player.setState('receive_w'); player.update(0.21);
    assert.equal(actor.children[0].Sprite.spriteFrame, assets.get(`${folder}/job_b/spriteFrame`),
        'the second offering cel appears inside the 0.45-second exchange handoff');
    player.update(0.25); player.update(0.25);
    assert.equal(actor.children[0].Sprite.spriteFrame, assets.get(`${folder}/job_b/spriteFrame`),
        'the free invitation holds its offered cup rather than looping the transfer');
}

// The returning tea regular owns separate generated front, back and side steps.
{
    const manifest = sideViewManifest();
    manifest.clips.walk_n = [{ asset: 'north_a', durationSeconds: 0.14 },
        { asset: 'north_b', durationSeconds: 0.14 }];
    manifest.clips.walk_ne = [{ asset: 'south_a', durationSeconds: 0.14 },
        { asset: 'south_b', durationSeconds: 0.14 }];
    manifest.loopingClips = ['idle_w', 'walk_n', 'walk_nw', 'walk_ne'];
    const { player, actor, assets, requests } = makePlayer(manifest);
    assert.equal(player.isReady, true); assert.equal(requests.length, 11);
    const sprite = actor.children[0].Sprite;
    for (const [clip, first, second] of [['walk_n', 'north_a', 'north_b'],
        ['walk_ne', 'south_a', 'south_b'], ['walk_nw', 'walk_a', 'walk_b']]) {
        player.setState(clip);
        assert.equal(sprite.spriteFrame, assets.get(`${folder}/${first}/spriteFrame`));
        player.update(0.15);
        assert.equal(sprite.spriteFrame, assets.get(`${folder}/${second}/spriteFrame`));
        player.update(0.14);
        assert.equal(sprite.spriteFrame, assets.get(`${folder}/${first}/spriteFrame`));
    }
    assert.equal(player.supportsClip('turn_w_ne'), false);
    assert.equal(player.supportsClip('idle_ne'), false);
    assert.equal(warnings.length, 0);
}

{
    const build = id => {
        const manifest = sideViewManifest();
        manifest.actorId = id;
        manifest.staggerIdlePhase = true;
        manifest.clips.idle_w = [0,1,2,3].map(i=>({asset:`blink_${i}`,durationSeconds:.1}));
        return makePlayer(manifest);
    };
    const a=build('lane_child'), b=build('tea_vendor');
    assert.equal(a.player.isReady,true);assert.equal(b.player.isReady,true);
    assert.notEqual(a.player.frameSeconds,b.player.frameSeconds);
    const observed=new Set();
    for(let i=0;i<12;i++){a.player.update(.05);observed.add(a.actor.children[0].Sprite.spriteFrame);}
    assert.equal(observed.size,4,'Every genuine blink frame must play');
    a.player.setState('receive_w');
    assert.equal(a.player.frameIndex,0,'An idle offset must never skip the start of a job gesture');
    assert.equal(a.player.frameSeconds,0);
    const stoppedFrames = new Set();
    for (let i = 0; i < 60; i++) {
        a.player.setState('walk_nw'); a.player.update(.05);
        a.player.setState('idle_w');
        stoppedFrames.add(a.actor.children[0].Sprite.spriteFrame);
        a.player.update(.03);
    }
    assert.equal(stoppedFrames.size,4,'Brief stops must not repeatedly restart the same idle pose');
}
console.log('Cel animation manifest, registration, duration, staggered idle and fallback: passed');
