// Inspect generated PNG pixels and authored positions. No image drawing.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pixels } from './import_generated_art.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const blueprintFile = 'design/street_block_01.json';
const blueprint = read(blueprintFile);
const manifest = read('art/production/ai_image_v8/production_manifest.json');
const slots = blueprint.artSlots.filter(slot => slot.id.startsWith('lc8_'));
assert.equal(blueprint.layoutVersion, 'street_courtyards_v8');
assert.equal(slots.length, 14);
assert.equal(blueprint.hiddenObjectSlots.length, 24);
assert.equal(blueprint.interactiveSlots.length, 6);
assert.equal(blueprint.npcPlans.length, 16);
const rasters = new Map();
for (const slot of slots) {
    const record = manifest.assets.find(asset => asset.sceneSlotId === slot.id);
    assert.ok(record, `${slot.id}: missing imported generated PNG`);
    assert.equal(record.width, slot.size.width);
    assert.equal(record.height, slot.size.height);
    assert.equal(record.sourceHasAlpha, true);
    assert.ok(record.alphaBounds.transparent > 0, `${slot.id}: no actual transparent pixels`);
    assert.equal(createHash('sha256').update(fs.readFileSync(record.output)).digest('hex'), record.sha256);
    assert.equal(createHash('sha256').update(fs.readFileSync(record.runtime)).digest('hex'), record.sha256);
    rasters.set(slot.id, { record, ...await pixels(record.output) });
}
function alphaAt(slot, world) {
    const { data, info } = rasters.get(slot.id);
    const x = Math.round(info.width / 2 + (world.x - slot.center.x) * info.width / slot.size.width);
    const y = Math.round(info.height / 2 - (world.y - slot.center.y) * info.height / slot.size.height);
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return 0;
    return data[(y * info.width + x) * 4 + 3];
}
const apronProbes = {
    books: [{ x: -710, y: 535 }, { x: -830, y: 405 }, { x: -640, y: 350 }],
    flowers: [{ x: -745, y: -5 }, { x: -850, y: -45 }],
    tea: [{ x: -305, y: 298 }, { x: -205, y: 290 }, { x: -255, y: 40 }],
    sweets: [{ x: 730, y: 545 }, { x: 840, y: 545 }, { x: 1020, y: 410 }],
    noodles: [{ x: 780, y: 95 }, { x: 900, y: 95 }, { x: 650, y: -45 }, { x: 960, y: -57 }],
    sage: [{ x: -820, y: -795 }, { x: -675, y: -795 }, { x: -995, y: -935 }],
    rose: [{ x: 720, y: -745 }, { x: 840, y: -745 }, { x: 705, y: -905 }, { x: 970, y: -910 }],
};
const aprons = slots.filter(slot => slot.layer === 'ground').map(slot => {
    const name = slot.id.match(/^lc8_(.+)_courtyard_ground$/)[1];
    const probes = apronProbes[name].map(at => ({ at, alpha: alphaAt(slot, at) }));
    assert.equal(slot.footY, undefined);
    assert.ok(!blueprint.physicalFootprints.some(item => item.artSlotId === slot.id));
    return { id: slot.id, sourceId: slot.generatedSourceId, center: slot.center, size: slot.size,
        output: rasters.get(slot.id).record.output, alphaBounds: rasters.get(slot.id).record.alphaBounds,
        probes, note: 'Alpha probes describe actual coverage; irregular transparent boundaries need screenshot review, not forced full-rectangle coverage.' };
});
const existingProduction = ['ai_image_v5', 'ai_image_v7'].flatMap(batch =>
    read(`art/production/${batch}/production_manifest.json`).assets);
const doors = {
    books: ['lc7_book_shop_back', 218], flowers: ['lc7_flower_shop_back', 150],
    tea: ['lc5_west_storefront_back', 198], sweets: ['lc7_sweet_shop_back', 224],
    noodles: ['lc7_noodle_shop_back', 224], sage: ['lc7_sage_house_back', 204],
    rose: ['lc7_rose_house_back', 220],
};
for (const apron of aprons) {
    const name = apron.id.match(/^lc8_(.+)_courtyard_ground$/)[1];
    const [facadeId, doorColumn] = doors[name];
    const facadeSlot = blueprint.artSlots.find(slot => slot.id === facadeId);
    const facadeRecord = existingProduction.find(asset => asset.sceneSlotId === facadeId);
    assert.ok(facadeRecord, `${facadeId}: actual facade PNG is missing`);
    const { data, info } = await pixels(facadeRecord.output);
    let lastOpaqueRow = -1;
    for (let y = 0; y < info.height; y++) {
        if (data[(y * info.width + doorColumn) * 4 + 3] >= 200) lastOpaqueRow = y;
    }
    assert.ok(lastOpaqueRow >= 0);
    const threshold = {
        x: facadeSlot.center.x + (doorColumn - info.width / 2) * facadeSlot.size.width / info.width,
        y: facadeSlot.center.y + (info.height / 2 - lastOpaqueRow) * facadeSlot.size.height / info.height,
    };
    const ground = slots.find(slot => slot.id === apron.id);
    let firstOpaqueGroundBelowWorld = null;
    for (let distance = 0; distance <= 40; distance++) {
        if (alphaAt(ground, { x: threshold.x, y: threshold.y - distance }) >= 200) {
            firstOpaqueGroundBelowWorld = distance;
            break;
        }
    }
    assert.ok(firstOpaqueGroundBelowWorld !== null && firstOpaqueGroundBelowWorld <= 24,
        `${apron.id}: actual paving edge is separated from the actual facade threshold by more than 24 world units`);
    apron.doorConnection = { facadeId, file: facadeRecord.output, sampledDoorColumnPx: doorColumn,
        lastOpaqueDoorRowPx: lastOpaqueRow, threshold, firstOpaqueGroundBelowWorld,
        note: 'Door column selected from direct PNG inspection. This is the actual facade bottom and actual paving Alpha, not a rectangle-bound estimate. Normal-zoom appearance remains a runtime screenshot check.' };
}
function routeSamples(npc) {
    if (npc.route.length === 1) return [...npc.route];
    const points = [];
    for (let i = 1; i < npc.route.length; i++) {
        const a = npc.route[i - 1], b = npc.route[i];
        const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
        for (let j = 0; j <= count; j++) points.push({ x: a.x + (b.x - a.x) * j / count,
            y: a.y + (b.y - a.y) * j / count });
    }
    return points;
}
const landscaping = slots.filter(slot => slot.layer === 'depth').map(slot => {
    const opaqueHeadOverlaps = [], opaqueTargetOverlaps = [];
    for (const npc of blueprint.npcPlans) for (const foot of routeSamples(npc)) {
        // A depth slot can hide an actor only when sorted in front of the actor's feet.
        if (slot.footY >= foot.y) continue;
        const head = { x: foot.x, y: foot.y + npc.actorHeight * 0.86 };
        const alpha = alphaAt(slot, head);
        if (alpha >= 200) opaqueHeadOverlaps.push({ npcId: npc.id, foot, head, alpha });
    }
    for (const target of blueprint.hiddenObjectSlots) {
        const support = blueprint.artSlots.find(item => item.id === target.supportArtSlotId);
        const targetDepth = support.footY === undefined ? target.at.y : support.footY - 1;
        if (slot.footY >= targetDepth) continue;
        const alpha = alphaAt(slot, target.at);
        if (alpha >= 200) opaqueTargetOverlaps.push({ targetId: target.id, at: target.at, alpha });
    }
    assert.equal(opaqueHeadOverlaps.length, 0, `${slot.id}: opaque PNG overlaps a resident head probe`);
    assert.equal(opaqueTargetOverlaps.length, 0, `${slot.id}: opaque PNG overlaps a target center`);
    return { id: slot.id, sourceId: slot.generatedSourceId, center: slot.center, size: slot.size,
        footY: slot.footY, output: rasters.get(slot.id).record.output,
        alphaBounds: rasters.get(slot.id).record.alphaBounds, opaqueHeadOverlaps, opaqueTargetOverlaps,
        collisionStatus: blueprint.physicalFootprints.some(item => item.artSlotId === slot.id)
            ? 'authored_bottom_footprint' : 'no_new_blocking_footprint',
        note: 'Sampled registered PNG Alpha against route head centers and target centers. Actual sprite silhouettes and appearance require runtime screenshot inspection.' };
});
const report = { status: 'png_geometry_checks_passed', visualApproval: 'pending',
    sceneBlueprintSha256: createHash('sha256').update(fs.readFileSync(blueprintFile)).digest('hex'),
    scope: 'v8_generated_courtyard_alpha_coverage_low_landscape_depth_and_preserved_target_positions',
    counts: { slots: blueprint.artSlots.length, grounds: aprons.length, landscaping: landscaping.length,
        targets: blueprint.hiddenObjectSlots.length, reveals: blueprint.interactiveSlots.length,
        residents: blueprint.npcPlans.length }, aprons, landscaping,
    crateFootprint: blueprint.physicalFootprints.find(item => item.artSlotId === 'lc6_central_crates'),
    note: 'All source and runtime files must exist before this report is produced. Pixel/geometry checks are separate from runtime visual review and player visual approval.' };
fs.mkdirSync('art/review/ai_image_v8', { recursive: true });
fs.writeFileSync('art/review/ai_image_v8/placement_review.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, counts: report.counts,
    actualDoorEdgeGaps: aprons.map(row => ({ apron: row.id, gapWorld: row.doorConnection.firstOpaqueGroundBelowWorld })),
    uncoveredApronProbes: aprons.flatMap(row => row.probes.filter(p => p.alpha < 200).map(p => ({ apron: row.id, ...p }))),
    opaqueHeadOverlaps: landscaping.reduce((sum, row) => sum + row.opaqueHeadOverlaps.length, 0),
    opaqueTargetOverlaps: landscaping.reduce((sum, row) => sum + row.opaqueTargetOverlaps.length, 0) }));
