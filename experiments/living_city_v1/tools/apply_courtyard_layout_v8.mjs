/** Author PNG placements only. This script does not generate or draw art. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'design/street_block_01.json');
const scene = JSON.parse(readFileSync(file, 'utf8'));
const batch = 'ai_image_v8';
const pending = 'Authored placement only; generated source, final PNG Alpha, and runtime visual review pending.';
const grounds = [
    ['books', -805, 445, 550, 330, 'west_reading_garden', 'Warm gray small-stone reading apron joining the bookshop door, book stall and reader space.'],
    ['flowers', -825, -30, 530, 220, 'west_reading_garden', 'Soft terracotta brick working apron joining the flower shop door and independent flower shelf.'],
    ['tea', -310, 260, 480, 460, 'central_tea_food', 'Cream irregular-stone tea courtyard joining the original tea facade, tea counter and sitting table.'],
    ['sweets', 850, 465, 480, 280, 'northeast_mail_corner', 'Pale sandstone shop apron joining the sweets doorway and independent notice/mail stand.'],
    ['noodles', 830, 0, 520, 290, 'east_fountain_rest', 'Cool gray-blue old-stone forecourt joining the noodle shop, fountain and rest bench.'],
    ['sage', -815, -850, 530, 220, 'west_gardening_corner', 'Earth-colored gravel apron with a few coplanar stepping stones under the gardener and independent workbench.'],
    ['rose', 830, -805, 520, 240, 'southeast_picnic_yard', 'Warm pale terracotta courtyard joining the rose house, independent laundry line and picnic blanket.'],
].map(([name, x, y, width, height, lifeGroupId, purpose]) => ({
    id: `lc8_${name}_courtyard_ground`, layer: 'ground', center: { x, y }, size: { width, height },
    alpha: true, generatedSourceId: `courtyard_${name}_v8`, generatedSourceBatch: batch,
    lifeGroupId, purpose: `${purpose} Independent built-in generated transparent flat ground PNG; no baked buildings, furniture, residents, targets or collision.`,
    placementReview: pending,
}));
const lowPlants = [
    ['books_flower_border', 'flower_border_v8', -1000, 360, 180, 90, 320, 'west_reading_garden', 'A low flowering edge at the outer bookshop apron, away from the bookkeeper and reader routes.'],
    ['flowers_flower_border', 'flower_border_v8', -985, -175, 190, 90, -215, 'west_reading_garden', 'A low flower patch beneath the flower forecourt edge, leaving the flower buyer route open.'],
    ['inner_lane_flower_border', 'flower_border_v8', -630, -280, 180, 90, -320, 'central_tea_food', 'Small flowering edge between the west rest lane and southern shop frontage.'],
    ['tea_shrub', 'shrub_clump_v8', -575, 120, 140, 100, 75, 'central_tea_food', 'Low shrub corner outside the tea tree and every resident travel line.'],
    ['sweets_shrub', 'shrub_clump_v8', 565, 490, 140, 100, 445, 'northeast_mail_corner', 'Low shrub corner between the existing east facade and the sweets forecourt.'],
    ['sage_fence', 'low_garden_fence_v8', -585, -625, 210, 90, -665, 'west_gardening_corner', 'Short low fence marks the inner corner of the sage garden without closing its entry or gardener route.'],
    ['rose_fence', 'low_garden_fence_v8', 570, -720, 190, 90, -760, 'southeast_picnic_yard', 'Short low fence marks the rose yard edge without blocking the laundry resident or public route.'],
].map(([name, sourceId, x, y, width, height, footY, lifeGroupId, purpose], index) => ({
    id: `lc8_${name}`, layer: 'depth', center: { x, y }, size: { width, height }, footY,
    alpha: true, generatedSourceId: sourceId, generatedSourceBatch: batch, sourcePlacementIndex: index,
    lifeGroupId, purpose: `${purpose} A mechanically scaled instance of its named generated PNG; no new code-drawn pixels.`,
    collisionReview: 'Deferred until final PNG Alpha review; no new blocking footprint is authored yet.',
    placementReview: pending,
}));

const kept = scene.artSlots.filter(slot => !slot.id.startsWith('lc8_'));
const originalGroundIndex = kept.findIndex(slot => slot.layer === 'ground');
kept.splice(originalGroundIndex + 1, 0, ...grounds);
scene.artSlots = [...kept, ...lowPlants];
const crate = scene.physicalFootprints.find(item => item.artSlotId === 'lc6_central_crates');
if (!crate) throw new Error('Missing preserved central crate footprint');
crate.polygon = [[125, 810], [225, 810], [225, 870], [125, 870]];
crate.placementReview = 'Historical v6 footprint synchronized with the retained crate center (175,855) and ground contact footY810; target and PNG placement unchanged.';
for (const group of scene.lifeGroups) {
    group.artSlotIds = group.artSlotIds.filter(id => !id.startsWith('lc8_'));
    group.artSlotIds.push(...[...grounds, ...lowPlants].filter(slot => slot.lifeGroupId === group.id).map(slot => slot.id));
}
scene.status = 'v8_courtyard_layout_candidate';
scene.layoutVersion = 'street_courtyards_v8';
scene.contentPlan.currentProductionId = batch;
scene.contentPlan.scenePlacementCount = scene.artSlots.length;
scene.contentPlan.newCourtyardSourceIds = grounds.map(slot => slot.generatedSourceId);
scene.contentPlan.lowLandscapeSourceIds = [...new Set(lowPlants.map(slot => slot.generatedSourceId))];
scene.contentPlan.courtyardPlacementCount = grounds.length;
scene.contentPlan.lowLandscapePlacementCount = lowPlants.length;
scene.contentPlan.courtyardReview = pending;
scene.reviewGates.status = 'v8 authored candidate: 63 source-backed scene placements, 11 buildings, 16 residents, 24 preserved targets and six preserved reveals. Final generated PNG Alpha, placement and runtime visual review pending.';
scene.sceneEvents = scene.sceneEvents.filter(event => event.id !== 'tea_invitation');
scene.sceneEvents.push({
    id: 'tea_invitation', trigger: { npcId: 'tea_vendor', waypointIndex: 0 },
    tapTriggerNpcId: 'tea_vendor', participants: ['tea_vendor'], repeat: true,
    cooldownSeconds: 8, resumeRouteAfterSeconds: 1.5, discoveryId: 'tea_break',
    actorBeats: [{ npcId: 'tea_vendor', clip: 'receive_w', atSeconds: 0, durationSeconds: 1.5, facing: 1 }],
});
const exchange = scene.sceneEvents.find(event => event.id === 'tea_exchange');
exchange.prop.visibleFromSeconds = 0;
exchange.prop.visibleUntilSeconds = 0.35;
exchange.actorBeats = exchange.actorBeats.filter(beat => beat.npcId !== 'tea_vendor');
exchange.actorBeats.push(
    { npcId: 'tea_vendor', clip: 'idle_w', atSeconds: 0, durationSeconds: 0.35, facing: 1 },
    { npcId: 'tea_vendor', clip: 'receive_w', atSeconds: 0.35, durationSeconds: 0.45, facing: 1 },
    { npcId: 'tea_vendor', clip: 'idle_w', atSeconds: 0.8, durationSeconds: 1.7, facing: 1 },
);
scene.npcClues.tea_vendor = ['刚泡好的，\n尝一口？', '不急，茶还热着。\n慢慢逛吧。'];
for (const npc of scene.npcPlans.filter(npc => ['tea_vendor', 'tea_regular'].includes(npc.id))) {
    npc.generatedSourceBatch = batch;
    npc.generatedSourceId = npc.id === 'tea_regular' ? 'chicken_tea_regular_sheet_walkfix_v8' : 'chicken_tea_vendor_sheet_v8';
}
writeFileSync(file, JSON.stringify(scene, null, 2) + '\n', 'utf8');
console.log(`Authored ${grounds.length} ground aprons and ${lowPlants.length} low landscape placements; ${scene.artSlots.length} total slots. Existing target/reveal/resident IDs and positions retained.`);
