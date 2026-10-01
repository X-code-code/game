// Read-only PNG/provenance/registration checks. No artwork is drawn here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pixels, bounds } from './import_generated_art.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hashCache = new Map(), pixelCache = new Map();
const hash = file => {
    if (!hashCache.has(file)) hashCache.set(file, createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    return hashCache.get(file);
};
async function inspect(file) {
    if (!pixelCache.has(file)) {
        const { data, info } = await pixels(file);
        pixelCache.set(file, { info, alphaBounds: bounds(data, info, 0) });
    }
    return pixelCache.get(file);
}
const base = 'art/production/ai_image_v4';
const manifest = read(`${base}/production_manifest.json`);
const byRuntime = new Map(), uuidPaths = new Map();
assert.equal(manifest.sourceType, 'codex_builtin_image_gen');
for (const record of manifest.assets) {
    assert.ok(!byRuntime.has(record.runtime), `Duplicate runtime registration: ${record.runtime}`);
    byRuntime.set(record.runtime, record);
    assert.ok(record.output.startsWith('assets/generated/'));
    assert.ok(record.source.startsWith(`${base}/sources/`));
    assert.ok(fs.readFileSync(record.prompt, 'utf8').trim().length > 100, `Missing prompt: ${record.name}`);
    assert.equal(hash(record.source), record.sourceSha256, `${record.name}: original source changed`);
    assert.equal(hash(record.output), record.sha256, `${record.name}: output hash mismatch`);
    assert.equal(hash(record.runtime), record.sha256, `${record.name}: bundle bytes differ`);
    const { info, alphaBounds } = await inspect(record.output);
    assert.deepEqual([info.width, info.height], [record.width, record.height], record.name);
    assert.deepEqual(alphaBounds, record.alphaBounds, `${record.name}: Alpha record differs`);
    if (record.transparent !== false) assert.ok(alphaBounds.transparent > 0, `${record.name}: no actual transparency`);
    const meta = read(`${record.runtime}.meta`), frame = meta.subMetas.f9941.userData;
    assert.equal(meta.uuid, record.uuid, `${record.name}: wrong runtime UUID in provenance`);
    assert.ok(!uuidPaths.has(meta.uuid), `Duplicate UUID: ${record.runtime} and ${uuidPaths.get(meta.uuid)}`);
    uuidPaths.set(meta.uuid, record.runtime);
    assert.deepEqual([frame.width, frame.height, frame.rawWidth, frame.rawHeight],
        [record.width, record.height, record.width, record.height], `${record.name}: trimming changed registration`);
    assert.deepEqual([frame.trimX, frame.trimY, frame.offsetX, frame.offsetY, frame.pivotX, frame.pivotY],
        [0, 0, 0, 0, .5, .5], record.name);
    if (record.stage === 'characters') {
        assert.deepEqual([info.width, info.height], [384, 256], record.name);
        assert.deepEqual(record.footpoint, { x: 192, y: 215 });
        assert.equal(alphaBounds.top + alphaBounds.height, 215, `${record.name}: foot Y drift`);
        assert.equal(alphaBounds.height, 186, `${record.name}: inconsistent figure height`);
    }
}
const chapters = [], targetIds = new Set();
for (const file of ['street_block_01', 'garden_market_02', 'harbor_walk_03']) {
    const blueprint = read(`design/${file}.json`), bundle = `assets/bundles/city_${blueprint.id}`;
    const city = read(`${bundle}/city.json`);
    assert.deepEqual(read(`${bundle}/${file}.json`), blueprint, `${file}: stale runtime blueprint`);
    assert.equal(city.sceneBlueprint, file);
    assert.equal(city.hiddenObjects.length, 12); assert.equal(city.interactiveObjects.length, 3);
    const requirePng = (assetPath, size) => {
        const record = byRuntime.get(`${bundle}/${assetPath}.png`);
        assert.ok(record, `${file}: art without generated provenance: ${assetPath}`);
        if (size) assert.deepEqual([record.width, record.height], [size.width, size.height], assetPath);
        return record;
    };
    for (const slot of blueprint.artSlots) requirePng(`simple2d_scene/${slot.id}`, slot.size);
    for (const target of city.hiddenObjects) {
        assert.ok(!targetIds.has(target.id), `${target.id}: duplicate target across chapters`);
        targetIds.add(target.id); requirePng(target.asset, { width: 256, height: 256 });
    }
    for (const reveal of city.interactiveObjects) { requirePng(reveal.asset); requirePng(reveal.openAsset); }
    let cels = 0;
    for (const actor of blueprint.npcPlans) {
        const cel = read(`${bundle}/cels/${actor.id}/manifest.json`);
        assert.equal(cel.actorId, actor.id);
        assert.deepEqual(cel.canvasPx, { width: 384, height: 256 });
        assert.deepEqual(cel.footpointPx, { x: 192, y: 215 });
        const unique = new Set();
        for (const frames of Object.values(cel.clips)) for (const frame of frames) {
            assert.ok(frame.durationSeconds >= .04 && frame.durationSeconds <= 2);
            requirePng(`cels/${actor.id}/${frame.asset}`, cel.canvasPx); unique.add(frame.asset);
        }
        cels += unique.size;
        for (const point of actor.route) assert.ok(Math.abs(point.x) < 768 && Math.abs(point.y) < 1024,
            `${file}/${actor.id}: route leaves the map`);
    }
    assert.equal(cels, 132);
    for (const name of ['ui_panel', 'ui_button', 'ui_hint_ring', 'ui_backdrop']) requirePng(`ui/${name}`);
    chapters.push({ cityId: city.cityId, sceneLayers: blueprint.artSlots.length, targets: 12, reveals: 3,
        residents: blueprint.npcPlans.length, cels });
}
const result = { status: 'passed', generatedSources: new Set(manifest.assets.map(r => r.source)).size,
    finalPngFiles: new Set(manifest.assets.map(r => r.output)).size, runtimeRegistrations: manifest.assets.length,
    uniqueTargets: targetIds.size, chapters, playerVisualApproval: 'pending', wechatPhone: 'not_run' };
const output = 'art/review/ai_image_v4/asset_integrity_report.json';
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
