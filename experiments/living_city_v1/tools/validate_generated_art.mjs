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
const batches = fs.readdirSync('art/production', { withFileTypes:true })
    .filter(entry=>entry.isDirectory()&&/^ai_image_v\d+$/.test(entry.name))
    .map(entry=>({id:entry.name,base:`art/production/${entry.name}`}))
    .filter(batch => fs.existsSync(`${batch.base}/production_manifest.json`))
    .sort((a,b)=>Number(a.id.match(/\d+$/)[0])-Number(b.id.match(/\d+$/)[0]))
    .map(batch => ({ ...batch, manifest:read(`${batch.base}/production_manifest.json`) }));
assert.ok(batches.length > 0, 'No generated-art production manifests exist');
assert.equal(batches[0].manifest.sourceType, 'codex_builtin_image_gen');
const registrations = new Map(), supersededRegistrations = [], historicalExports = [];
const historicalKeys = new Set();
function retainHistorical(record) {
    const key = `${record.output}|${record.sha256}`;
    if (!historicalKeys.has(key)) { historicalKeys.add(key); historicalExports.push(record); }
}
for (const batch of batches) {
    assert.equal(batch.manifest.sourceType, 'codex_builtin_image_gen', batch.id);
    for (const record of batch.manifest.historicalExports ?? []) retainHistorical(record);
    const runtimePaths = new Set();
    for (const record of batch.manifest.assets) {
        if (record.runtimeIsHistorical) { retainHistorical(record); continue; }
        assert.ok(!runtimePaths.has(record.runtime), `${batch.id}: duplicate runtime registration: ${record.runtime}`);
        runtimePaths.add(record.runtime);
        const previous = registrations.get(record.runtime);
        if (previous) {
            supersededRegistrations.push({ runtime:record.runtime, previousSource:previous.source, currentSource:record.source });
            retainHistorical(previous);
        }
        registrations.set(record.runtime, record);
    }
}
const manifest = { assets:[...registrations.values()] };
const byRuntime = new Map(), uuidPaths = new Map();
for (const record of historicalExports) {
    assert.ok(batches.some(batch => record.source.startsWith(`${batch.base}/sources/`)),record.name);
    assert.ok(fs.readFileSync(record.prompt,'utf8').trim().length>100,`Historical prompt missing: ${record.name}`);
    assert.equal(hash(record.source),record.sourceSha256,`Historical generated source changed: ${record.name}`);
    assert.equal(hash(record.output),record.sha256,`Historical generated export changed: ${record.name}`);
    const {info,alphaBounds}=await inspect(record.output);
    assert.deepEqual([info.width,info.height],[record.width,record.height],record.name);
    assert.deepEqual(alphaBounds,record.alphaBounds,record.name);
}
for (const record of manifest.assets) {
    assert.ok(!byRuntime.has(record.runtime), `Duplicate runtime registration: ${record.runtime}`);
    byRuntime.set(record.runtime, record);
    assert.ok(record.output.startsWith('assets/generated/'));
    assert.ok(batches.some(batch => record.source.startsWith(`${batch.base}/sources/`)),
        `${record.name}: source does not belong to a retained built-in generation batch`);
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
        assert.ok(Number.isFinite(record.footpoint?.x)&&record.footpoint.x>=0&&record.footpoint.x<=info.width,record.name);
        assert.ok(Number.isFinite(record.footpoint?.y)&&record.footpoint.y>0&&record.footpoint.y<=info.height,record.name);
        assert.equal(alphaBounds.top + alphaBounds.height, record.footpoint.y, `${record.name}: foot Y drift`);
        assert.equal(alphaBounds.height, record.figureHeight, `${record.name}: inconsistent figure height`);
    }
}
const chapters = [], targetIds = new Set();
for (const file of ['street_block_01', 'garden_market_02', 'harbor_walk_03']) {
    const blueprint = read(`design/${file}.json`), bundle = `assets/bundles/city_${blueprint.id}`;
    const city = read(`${bundle}/city.json`);
    assert.deepEqual(read(`${bundle}/${file}.json`), blueprint, `${file}: stale runtime blueprint`);
    assert.equal(city.sceneBlueprint, file);
    assert.ok(city.hiddenObjects.length > 0, `${file}: no search targets`);
    assert.equal(city.hiddenObjects.length, blueprint.hiddenObjectSlots.length, `${file}: target slots and config differ`);
    assert.equal(new Set(city.hiddenObjects.map(target=>target.id)).size,city.hiddenObjects.length);
    assert.equal(new Set(city.interactiveObjects.map(reveal=>reveal.id)).size,city.interactiveObjects.length);
    const requirePng = (assetPath, size) => {
        const record = byRuntime.get(`${bundle}/${assetPath}.png`);
        assert.ok(record, `${file}: art without generated provenance: ${assetPath}`);
        if (size) assert.deepEqual([record.width, record.height], [size.width, size.height], assetPath);
        return record;
    };
    for (const slot of blueprint.artSlots) {
        const density=slot.textureScale??1;
        assert.ok(Number.isInteger(density)&&density>=1&&density<=4,`${slot.id}: invalid texture density`);
        requirePng(`simple2d_scene/${slot.id}`, {width:slot.size.width*density,height:slot.size.height*density});
    }
    for (const target of city.hiddenObjects) {
        assert.ok(!targetIds.has(target.id), `${target.id}: duplicate target across chapters`);
        targetIds.add(target.id);
        const targetArt = requirePng(target.asset);
        assert.equal(Math.max(targetArt.width,targetArt.height),256,`${target.id}: target PNG maximum canvas side changed`);
        assert.ok(Math.min(targetArt.width,targetArt.height)>=96,`${target.id}: target PNG canvas is too thin`);
        if(targetArt.width!==targetArt.height) {
            assert.ok(target.visualSize?.width>0&&target.visualSize?.height>0,`${target.id}: shaped target lacks world dimensions`);
            assert.ok(Math.abs(targetArt.width/targetArt.height-target.visualSize.width/target.visualSize.height)<.01,
                `${target.id}: map visual dimensions stretch the generated PNG`);
        }
    }
    for (const reveal of city.interactiveObjects) { requirePng(reveal.asset); requirePng(reveal.openAsset); }
    const lifeGroups = [];
    for (const group of blueprint.lifeGroups ?? []) {
        assert.ok(group.artSlotIds?.length > 0, `${file}/${group.id}: life group lacks PNG art slots`);
        for (const id of group.artSlotIds) {
            const slot = blueprint.artSlots.find(slot=>slot.id===id);
            assert.ok(slot, `${file}/${group.id}: unknown art slot ${id}`);
            const density=slot.textureScale??1;
            requirePng(`simple2d_scene/${id}`,{width:slot.size.width*density,height:slot.size.height*density});
        }
        lifeGroups.push({ id:group.id, pngLayers:group.artSlotIds.length });
    }
    let cels = 0;
    const residentAnimationAssets=[],actorPngOwners=new Map();
    for (const actor of blueprint.npcPlans) {
        const cel = read(`${bundle}/cels/${actor.id}/manifest.json`);
        assert.equal(cel.actorId, actor.id);
        assert.ok(Number.isInteger(cel.canvasPx?.width)&&cel.canvasPx.width>0,actor.id);
        assert.ok(Number.isInteger(cel.canvasPx?.height)&&cel.canvasPx.height>0,actor.id);
        assert.ok(Number.isFinite(cel.paintedHeightPx)&&cel.paintedHeightPx>0,actor.id);
        const unique = new Set(),figureHeights=new Set(),sharedScales=new Set();
        for (const frames of Object.values(cel.clips)) for (const frame of frames) {
            assert.ok(frame.durationSeconds >= .04 && frame.durationSeconds <= 2);
            const record=requirePng(`cels/${actor.id}/${frame.asset}`, cel.canvasPx);
            assert.equal(record.actor,actor.id,`${actor.id}: uses another resident's export`);
            assert.deepEqual(record.footpoint,cel.footpointPx,`${actor.id}: manifest and export footpoints differ`);
            assert.ok(record.figureHeight>0&&record.figureHeight<=cel.paintedHeightPx,
                `${actor.id}: export exceeds the manifest's common maximum painted height`);
            figureHeights.add(record.figureHeight);
            if(record.sharedSheetScale!==undefined) {
                assert.ok(Number.isFinite(record.sharedSheetScale)&&record.sharedSheetScale>0,actor.id);
                sharedScales.add(record.sharedSheetScale);
            }
            if(cel.schemaVersion===2)assert.ok(record.sharedSheetScale!==undefined,
                `${actor.id}: new animation frame lacks common-sheet scale provenance`);
            const previousActor=actorPngOwners.get(record.sha256);
            assert.ok(!previousActor||previousActor===actor.id,
                `${actor.id}: uses the same PNG bytes as ${previousActor}`);
            actorPngOwners.set(record.sha256,actor.id);
            unique.add(frame.asset);
        }
        assert.equal(Math.max(...figureHeights),cel.paintedHeightPx,`${actor.id}: manifest maximum differs from actual exported frames`);
        assert.ok(sharedScales.size<=1,`${actor.id}: frames were independently resized instead of sharing the source-sheet scale`);
        residentAnimationAssets.push({actorId:actor.id,canvasPx:cel.canvasPx,footpointPx:cel.footpointPx,
            paintedHeightPx:cel.paintedHeightPx,uniquePngFrames:unique.size,
            frameFigureHeights:[...figureHeights].sort((a,b)=>a-b),sharedSheetScale:[...sharedScales][0]??null,
            clips:Object.fromEntries(Object.entries(cel.clips).map(([clip,frames])=>
                [clip,{frames:frames.length,distinctFrames:new Set(frames.map(frame=>frame.asset)).size}]))});
        cels += unique.size;
        for (const point of actor.route) assert.ok(Math.abs(point.x) < blueprint.map.width / 2 &&
            Math.abs(point.y) < blueprint.map.height / 2,
            `${file}/${actor.id}: route leaves the map`);
    }
    assert.ok(cels > 0, `${file}: no registered animation frames`);
    for (const name of ['ui_panel', 'ui_button', 'ui_hint_ring', 'ui_backdrop']) requirePng(`ui/${name}`);
    chapters.push({ cityId: city.cityId, sceneLayers: blueprint.artSlots.length,
        buildings:blueprint.artSlots.filter(slot=>slot.layer==='building_back').length,
        targets: city.hiddenObjects.length, reveals: city.interactiveObjects.length,
        residents: blueprint.npcPlans.length, cels, residentAnimationAssets, lifeGroups });
}
const retainedAssets=[...manifest.assets,...historicalExports];
const result = { status: 'passed', generatedSources: new Set(retainedAssets.map(r => r.source)).size,
    finalPngFiles: new Set(retainedAssets.map(r => r.output)).size, runtimeRegistrations: manifest.assets.length,
    historicalExports:historicalExports.length,
    productionBatches:batches.map(batch=>batch.id),supersededRegistrations,
    uniqueTargets: targetIds.size, chapters, playerVisualApproval: 'pending', wechatPhone: 'not_run' };
const output = `art/review/${batches.at(-1).id}/asset_integrity_report.json`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
