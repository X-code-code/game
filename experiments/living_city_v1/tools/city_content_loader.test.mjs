import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
const output = ts.transpileModule(fs.readFileSync('assets/scripts/config/CityContentLoader.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));

async function harness() {
    const pending = [], requested = [], removed = [];
    const config = { cityId: 'test', sceneBlueprint: 'block',
        hiddenObjects: [{ asset: 'targets/shell' }],
        interactiveObjects: [{ asset: 'interactions/chest_closed', openAsset: 'interactions/chest_opened' }] };
    class JsonAsset {}
    class SpriteFrame {}
    const cityAsset = { json: config, refs: 0, addRef() { this.refs++; }, decRef() { this.refs--; } };
    const bundle = { name: 'city_test', getInfoWithPath: () => null,
        load(assetPath, type, callback) {
            requested.push(assetPath);
            if (type === SpriteFrame) { pending.push({ assetPath, callback }); return; }
            const asset = assetPath === 'city' ? cityAsset : { json: assetPath === 'block'
                ? { artSlots: [{ id: 'ground' }], npcPlans: [{ id: 'chick' }] }
                : { clips: { idle: [{ asset: 'idle_01' }], walk: [{ asset: 'walk_01' }] } } };
            setImmediate(() => callback(null, asset));
        } };
    const cc = { JsonAsset, SpriteFrame,
        resources: { load: (_path, _type, callback) => callback(null, { json: {
            cities: [{ cityId: 'test', bundleName: 'city_test' }] } }) },
        assetManager: { getBundle: () => null, loadBundle: (_name, callback) => callback(null, bundle),
            removeBundle: value => removed.push(value.name) } };
    const module = { exports: {} };
    vm.runInNewContext(output, { module, exports: module.exports, Map, Set, Promise,
        require: name => name === 'cc' ? cc : { validateCityCatalog: x => x, validateCityConfig: x => x } });
    const loader = await module.exports.CityContentLoader.create();
    return { loader, pending, requested, removed, cityAsset };
}

test('mount waits for all PNG dependencies; a quick departure has no pending downloads', async () => {
    const h = await harness();
    let mounted = false;
    const loading = h.loader.load('test').then(value => { mounted = true; return value; });
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(mounted, false);
    assert.equal(h.pending.length, 10);
    assert.ok(h.requested.includes('cels/chick/walk_01/spriteFrame'));
    assert.ok(h.requested.includes('interactions/chest_opened/spriteFrame'));
    while (h.pending.length > 1) h.pending.shift().callback(null, {});
    await tick();
    assert.equal(mounted, false);
    assert.deepEqual(h.removed, []);
    h.pending.shift().callback(null, {});
    const loaded = await loading;
    loaded.release(); loaded.release();
    assert.equal(h.cityAsset.refs, 0);
    assert.deepEqual(h.removed, ['city_test']);
});

test('a failed PNG keeps the bundle registered until other downloads settle', async () => {
    const h = await harness();
    let finished = false;
    const result = h.loader.load('test').then(() => { throw new Error('Unexpected success'); }, error => {
        finished = true; return error;
    });
    for (let i = 0; i < 5; i++) await tick();
    h.pending.shift().callback(new Error('missing PNG'), null);
    await tick();
    assert.equal(finished, false);
    assert.deepEqual(h.removed, []);
    for (const request of h.pending.splice(0)) request.callback(null, {});
    assert.match((await result).message, /missing PNG/);
    assert.equal(h.cityAsset.refs, 0);
    assert.deepEqual(h.removed, ['city_test']);
});
