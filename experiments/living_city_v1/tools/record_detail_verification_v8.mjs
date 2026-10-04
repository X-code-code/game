// Validate completed evidence before updating the current mixed-batch inventory.
// Retain historical sources, exports, evidence, and UUIDs; do not draw artwork.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = 'art/production/ai_image_v8', review = 'art/review/ai_image_v8';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const sameSet = (a, b, message) => assert.deepEqual([...new Set(a)].sort(), [...new Set(b)].sort(), message);
const nonempty = (value, message) => assert.ok(Array.isArray(value) && value.length > 0, message);
const reportPath = process.argv[2] ?? `${review}/three_chapters/runtime_report.json`;
const defaultFollowup = `${review}/chapter_1_followup/runtime_report.json`;
const followupPath = process.argv[3] ?? (fs.existsSync(defaultFollowup) ? defaultFollowup : reportPath);
const baseline = read(reportPath), finalReport = read(followupPath);
const blueprintFile = 'design/street_block_01.json', blueprintSha = hash(blueprintFile), blueprint = read(blueprintFile);
assert.equal(baseline.status, 'passed');
assert.equal(baseline.totalUniqueCollected, 48);
assert.equal(baseline.totalReveals, 12);
assert.equal(finalReport.status, 'passed');
if (followupPath !== reportPath) {
    assert.equal(finalReport.totalUniqueCollected, 24);
    assert.equal(finalReport.totalReveals, 6);
    assert.equal(finalReport.unchangedChapterBaseline.sha256, hash(reportPath));
}
for (const report of [baseline, finalReport]) {
    for (const key of ['runtimeErrors', 'runtimeWarnings', 'failedRequests']) {
        assert.ok(Array.isArray(report[key]), `Runtime report lacks ${key}`);
        assert.equal(report[key].length, 0);
    }
}
const cityIds = ['living_city_street_block_01', 'living_city_garden_market_02', 'living_city_harbor_walk_03'];
sameSet(baseline.chapters.map(chapter => chapter.cityId), cityIds,
    'Completed baseline must contain all three actual chapters');
const phoneViewports = [{ width: 444, height: 960 }, { width: 360, height: 780 }];
function verifyDialogueFit(chapter) {
    const fit = chapter.dialogueFit;
    assert.ok(fit, `${chapter.cityId}: missing final dialogue fit evidence`);
    assert.equal(fit.viewportClipping, false);
    assert.equal(fit.overlapsTargetTray, false);
    nonempty(fit.samples, `${chapter.cityId}: no actual dialogue bounds samples`);
    for (const viewport of phoneViewports) {
        const samples = fit.samples.filter(sample => sample.viewport.width === viewport.width &&
            sample.viewport.height === viewport.height);
        const kinds = chapter.cityId === 'living_city_street_block_01'
            ? ['resident', 'resident_after_real_drag', 'facility', 'facility_after_real_drag']
            : ['resident', 'resident_after_real_drag'];
        for (const kind of kinds) assert.ok(samples.some(sample => sample.kind === kind && sample.zoom === 'maximum'),
            `${chapter.cityId}: missing ${kind} at maximum zoom on ${viewport.width}x${viewport.height}`);
    }
    for (const sample of fit.samples) {
        const { viewport, bounds, trayBounds } = sample;
        assert.ok(Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height) &&
            viewport.width > 0 && viewport.height > 0, `${chapter.cityId}: invalid actual dialogue viewport`);
        for (const [label, rect] of [['dialogue', bounds], ['target tray', trayBounds]]) {
            assert.ok(rect && ['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(rect[key])),
                `${chapter.cityId}: missing real ${label} bounds`);
            assert.ok(rect.right > rect.left && rect.bottom > rect.top,
                `${chapter.cityId}: empty ${label} bounds`);
            assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 &&
                rect.bottom <= viewport.height + 1,
                `${chapter.cityId}: ${label} extends outside the measured viewport`);
        }
        assert.ok(bounds.bottom <= trayBounds.top + 1,
            `${chapter.cityId}: actual dialogue bounds overlap the target tray`);
    }
    return { cityId: chapter.cityId, actualBoundsSamples: fit.samples.length,
        viewportClipping: false, overlapsTargetTray: false, checkedViewports: phoneViewports };
}
const dialogueFitEvidence = baseline.chapters.map(verifyDialogueFit);
if (followupPath !== reportPath) finalReport.chapters.forEach(verifyDialogueFit);
const chapter = finalReport.chapters.find(item => item.cityId === blueprint.id) ?? finalReport.chapters[0];
assert.equal(chapter.buildings, 11);
assert.equal(chapter.residents, 16);
assert.equal(blueprint.artSlots.length, 63);
assert.equal(blueprint.artSlots.filter(slot => slot.layer === 'building_back').length, 11);
assert.equal(blueprint.npcPlans.length, 16);
assert.equal(blueprint.hiddenObjectSlots.length, 24);
assert.equal(blueprint.interactiveSlots.length, 6);
assert.equal(chapter.sceneLayers ?? chapter.layers ?? chapter.artSlots ?? chapter.loadedSceneSlots, 63,
    'Runtime report must explicitly confirm all 63 authored scene slots');
assert.equal(chapter.targetSpriteFrames.length, 24);
assert.equal(chapter.targetTrayPaging.pages, 2);
for (const key of ['swipeChecked', 'pngAspectPreserved', 'mapAndTrayUseSameSpriteFrames']) {
    assert.equal(chapter.targetTrayPaging[key], true);
}
assert.ok(chapter.targetTrayPaging.viewports.length >= 2, 'Target tray needs two actual phone viewports');
for (const row of chapter.targetSpriteFrames) {
    assert.equal(row.displayedMapUuid, row.expectedSpriteFrameUuid, `${row.id}: map sprite mismatch`);
    assert.equal(row.displayedTrayUuid, row.expectedSpriteFrameUuid, `${row.id}: tray sprite mismatch`);
    assert.equal(hash(row.runtimePath), row.runtimeSha256);
}
assert.equal(chapter.newResidentAnimations.renewedResidents, 2);
for (const id of ['tea_vendor', 'tea_regular']) {
    const actor = chapter.newResidentAnimations.actors.find(row => row.id === id);
    assert.ok(actor, `${id}: renewed actor was not observed in the actual game`);
    for (const clip of ['idle_w', 'receive_w']) {
        assert.ok(new Set(actor.observedClips[clip]).size >= 2, `${id}: ${clip} lacks two observed generated frames`);
    }
    if (id === 'tea_regular') for (const clip of ['walk_n', 'walk_ne']) {
        assert.ok(new Set(actor.observedClips[clip]).size >= 2, `${id}: ${clip} lacks real observed directional frames`);
    }
}
assert.equal(chapter.repeatableTea.singleCupNeverDuplicated, true);
sameSet(chapter.repeatableTea.singleCupStates, ['table', 'tea_vendor', 'tea_regular'], 'Missing a real single-cup handoff stage');
nonempty(chapter.repeatableTea.cupStageScreens, 'No actual cup-stage screenshots');
for (const screenshot of chapter.repeatableTea.cupStageScreens) {
    assert.ok(fs.existsSync(screenshot.file), `Missing runtime cup screenshot ${screenshot.file}`);
}
const invitation = chapter.activeTeaInvitation;
assert.equal(invitation.eventId, 'tea_invitation');
assert.equal(invitation.discoveryId, 'tea_break');
for (const key of ['actualMouseInput', 'participantsMutuallyExclusive', 'regularContinuedWalking',
    'completionOnlyAward', 'requiredProgressUnchanged', 'restoredAfterReload']) assert.equal(invitation[key], true);
assert.equal(invitation.cooldownSeconds, 8);
assert.equal(invitation.replayWritesSave, false);
assert.ok(new Set(invitation.generatedOfferFrames).size >= 2, 'Manual invitation did not play both generated offer frames');

const placementPath = `${review}/placement_review.json`, integrityPath = `${review}/asset_integrity_report.json`;
const sourceReviewPath = `${review}/source_review.json`;
const placement = read(placementPath), integrity = read(integrityPath), sourceReview = read(sourceReviewPath);
assert.equal(placement.status, 'png_geometry_checks_passed');
assert.equal(placement.sceneBlueprintSha256, blueprintSha);
assert.equal(placement.counts.slots, 63);
assert.equal(placement.aprons.length, 7);
assert.equal(placement.landscaping.length, 7);
assert.equal(integrity.status, 'passed');
assert.equal(integrity.chapters.find(row => row.cityId === blueprint.id).sceneLayers, 63);
assert.equal(sourceReview.reviewStatus, 'source_visual_review_recorded');
assert.equal(sourceReview.playerVisualApproval, 'pending');
const productionFile = `${base}/production_manifest.json`, generationFile = `${base}/generation_record.json`;
const production = read(productionFile), generation = read(generationFile), plan = read(`${base}/generation_plan.json`);
assert.equal(production.assets.length, 40);
const sceneAssets = production.assets.filter(asset => asset.stage === 'scene');
const targetAssets = production.assets.filter(asset => asset.stage === 'target');
const actorAssets = production.assets.filter(asset => asset.stage === 'character');
assert.equal(sceneAssets.length, 14);
assert.equal(targetAssets.length, 12);
assert.equal(actorAssets.length, 14);
const sourceIds = generation.sources.map(source => source.id);
assert.equal(new Set(sourceIds).size, sourceIds.length, 'Duplicate generated source IDs');
sameSet(plan.jobs.map(job => job.id), sourceIds, 'Planned tool calls and recorded tool outputs differ');
const activeSourcePaths = [...new Set(production.assets.map(asset => asset.source))];
const selected = generation.sources.filter(source => activeSourcePaths.includes(source.source));
assert.equal(selected.length, 15);
assert.equal(sourceReview.checkedSources, generation.sources.length);
assert.equal(sourceReview.activeSources, selected.length);
sameSet(sourceReview.reviewedSourceIds, sourceIds, 'Some actual generated sources lack manual review');
sameSet(sourceReview.activeSourceIds, selected.map(source => source.id), 'Source review does not match actual runtime selection');
const originalTargets = ['tea_clay_whistle', 'tailor_thimble', 'banner_knot', 'chestnut_tongs',
    'pocket_watch', 'sewing_scissors', 'blue_feather', 'sealed_letter', 'honey_dipper', 'seed_packet',
    'orchard_apple', 'golden_bun'];
const targetId = asset => asset.targetId ?? path.basename(asset.runtime, '.png');
sameSet(targetAssets.map(targetId), originalTargets, 'v8 must replace exactly the original twelve saved target IDs');
for (const source of generation.sources) {
    assert.equal(hash(source.source), source.sourceSha256);
    assert.equal(hash(source.originalToolOutput), source.originalToolOutputSha256);
    assert.equal(source.sourceSha256, source.originalToolOutputSha256, 'Source original bytes were changed');
    const job = plan.jobs.find(row => row.id === source.id);
    assert.ok(fs.readFileSync(source.prompt, 'utf8').includes(job.prompt), `${source.id}: real prompt mismatch`);
    const reviewed = sourceReview.sources.find(row => row.id === source.id);
    assert.ok(reviewed, `${source.id}: missing manual observations`);
    assert.equal(reviewed.source, source.source);
    assert.equal(reviewed.sha256, source.sourceSha256);
    nonempty(reviewed.observations, `${source.id}: no actual source observation`);
    assert.equal(reviewed.status, selected.includes(source) ? 'selected_runtime_trial_unapproved' :
        'superseded_animation_candidate_unapproved');
}
for (const asset of production.assets) {
    assert.equal(hash(asset.output), asset.sha256);
    assert.equal(hash(asset.runtime), asset.sha256);
    assert.equal(hash(asset.source), asset.sourceSha256);
    assert.ok(generation.sources.some(source => source.source === asset.source));
    assert.ok(fs.existsSync(`${asset.output}.meta`) && fs.existsSync(`${asset.runtime}.meta`));
}
for (const asset of targetAssets) {
    const runtimeRecord = chapter.targetSpriteFrames.find(row => row.id === targetId(asset));
    assert.equal(runtimeRecord.runtimeSha256, asset.sha256, `${targetId(asset)}: stale runtime target PNG`);
}
const evidence = { status: 'web_mobile_verified', playerVisualApproval: 'pending', wechatPhone: 'not_run',
    threeChapters: { path: reportPath, sha256: hash(reportPath) },
    finalFirstChapter: { path: followupPath, sha256: hash(followupPath) },
    sourceReview: { path: sourceReviewPath, sha256: hash(sourceReviewPath), status: sourceReview.reviewStatus },
    placement: { path: placementPath, sha256: hash(placementPath), status: placement.status },
    assetIntegrity: { path: integrityPath, sha256: hash(integrityPath), status: integrity.status },
    dialogueFit: { status: 'actual_bounds_checked', chapters: dialogueFitEvidence } };
production.runtimeVerification = evidence;
production.visualApproval = 'pending';
production.sceneBlueprintSha256 = blueprintSha;
for (const asset of production.assets) asset.status = 'runtime_verified_visual_unapproved';
generation.sceneBlueprintSha256 = blueprintSha;
generation.runtimeVerification = evidence;
for (const source of selected) source.status = 'used_runtime_verified_visual_unapproved';
const global = read('art/asset_manifest.json');
const upsert = asset => {
    const index = global.assets.findIndex(row => row.id === asset.id);
    if (index < 0) global.assets.push(asset); else global.assets[index] = { ...global.assets[index], ...asset };
};
for (const asset of production.assets) upsert({ id: asset.sceneSlotId ?? asset.name,
    filename: path.basename(asset.output), category: asset.stage === 'scene' ? 'scene_asset' :
        asset.stage === 'target' ? 'target_asset' : 'character_cel', batchId: 'ai_image_v8',
    sourceType: 'codex_builtin_image_gen', status: asset.status, styleId: 'cozy_flat_town_v5',
    productionStyleId: 'cozy_flat_town_v5', path: asset.output, runtimePath: asset.runtime,
    format: 'PNG', size: `${asset.width}x${asset.height}`, transparent: true,
    sourcePath: asset.source, promptPath: asset.prompt, sourceSha256: asset.sourceSha256, sha256: asset.sha256,
    ...(asset.stage === 'target' ? { targetId: targetId(asset) } : {}),
    ...(asset.actor ? { actorId: asset.actor, frameIndex: asset.frameIndex,
        sharedSheetScale: asset.sharedSheetScale, footpoint: asset.footpoint } : {}),
    generationRecordPath: generationFile, idManifestPath: productionFile, runtimeReviewPath: followupPath,
    description: 'Generated courtyard/detail PNG, mechanically registered and Web Mobile verified; player visual approval pending.' });
upsert({ id: 'ai_image_v8', category: 'first_chapter_courtyards_tea_targets_generated_png_batch',
    sourceType: 'codex_builtin_image_gen', status: 'runtime_verified_visual_unapproved', styleId: 'cozy_flat_town_v5',
    sourcePath: `${base}/sources/`, promptPath: `${base}/prompts/`, generationRecordPath: generationFile,
    idManifestPath: productionFile, finalFolder: 'assets/generated/',
    counts: { newGenerationCalls: generation.sources.length, activeNewGeneratedSources: selected.length,
        unusedSupersededCandidates: generation.sources.length - selected.length, groundPngFiles: 7,
        landscapePngFiles: 7, scenePngFiles: 14, targetPngFiles: 12, renewedActors: 2,
        characterCelPngFiles: 14, finalPngFiles: 40 },
    mapSize: blueprint.map, firstChapterContent: { sceneSlots: 63, buildings: 11, residents: 16,
        targets: 24, reveals: 6, lifeGroups: 6 }, runtimeVerification: evidence,
    retainedArtBatches: ['ai_image_v5', 'ai_image_v6', 'ai_image_v7', 'ai_image_v4'],
    description: 'Seven independent courtyard floors and three low landscape sources connect the existing town. Twelve original targets and two tea residents use new PNGs; optional manual tea invitation retains all saved target/reveal IDs.' });
const sceneIds = new Set(blueprint.artSlots.map(slot => slot.id));
const newRuntimePaths = new Set(production.assets.map(asset => asset.runtime));
for (const asset of global.assets) {
    if (asset.category === 'scene_asset' && ['ai_image_v5', 'ai_image_v6', 'ai_image_v7', 'ai_image_v8'].includes(asset.batchId)) {
        asset.activeInFirstChapter = sceneIds.has(asset.id);
    }
    if (asset.runtimePath && newRuntimePaths.has(asset.runtimePath)) {
        asset.activeInFirstChapter = asset.batchId === 'ai_image_v8';
        if (asset.batchId !== 'ai_image_v8') asset.supersededFirstChapterRuntimeByBatch = 'ai_image_v8';
    }
}
const newTargetIds = new Set(blueprint.contentPlan.newTargetIds);
const newRevealIds = new Set(blueprint.contentPlan.newRevealIds);
const sceneBySlotId = Object.fromEntries(blueprint.artSlots.map(slot => [slot.id,
    slot.generatedSourceBatch ?? slot.reusedGeneratedSourceBatch ??
    (slot.generatedSourceId?.endsWith('_v7') ? 'ai_image_v7' : 'ai_image_v5')]));
const actorsById = Object.fromEntries(blueprint.npcPlans.map(npc => [npc.id,
    npc.generatedSourceBatch ?? (npc.generatedSourceId?.endsWith('_v7') ? 'ai_image_v7' : 'ai_image_v4')]));
global.currentProductionId = 'ai_image_v8';
global.styleId = 'cozy_flat_town_v5';
global.styleStatus = 'staged_migration_runtime_verified_visual_approval_pending';
global.activeProductionByChapter = {
    living_city_street_block_01: { sceneBase: 'ai_image_v5', sceneContent: 'ai_image_v6', newBuildingFacades: 'ai_image_v7',
        courtyardsAndLowLandscape: 'ai_image_v8', originalTargets: 'ai_image_v8', newTargets: 'ai_image_v6',
        originalInteractions: 'ai_image_v4', newInteractions: 'ai_image_v6', teaResidents: 'ai_image_v8',
        retainedOriginalResidents: 'ai_image_v4', newResidents: 'ai_image_v7', ui: 'ai_image_v4',
        sceneBySlotId, actorsById,
        targetsById: Object.fromEntries(blueprint.hiddenObjectSlots.map(target => [target.id, newTargetIds.has(target.id) ? 'ai_image_v6' : 'ai_image_v8'])),
        interactionsById: Object.fromEntries(blueprint.interactiveSlots.map(item => [item.id, newRevealIds.has(item.id) ? 'ai_image_v6' : 'ai_image_v4'])) },
    living_city_garden_market_02: { scene: 'ai_image_v4', sharedActorsTargetsInteractionsUi: 'ai_image_v4' },
    living_city_harbor_walk_03: { scene: 'ai_image_v4', sharedActorsTargetsInteractionsUi: 'ai_image_v4' },
};
// All validation above is read-only. Only genuine completed evidence reaches these writes.
write(productionFile, production);
write(generationFile, generation);
write('art/asset_manifest.json', global);
console.log(JSON.stringify({ status: 'verification_recorded', newPngFiles: 40,
    generatedCalls: generation.sources.length, activeSources: selected.length,
    firstChapterSceneSlots: 63, firstChapterBuildings: 11, firstChapterResidents: 16,
    firstChapterTargets: 24, firstChapterReveals: 6, playerVisualApproval: 'pending' }));
