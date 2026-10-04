// Record existing runtime evidence and PNG provenance; no artwork is drawn.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const base = 'art/production/ai_image_v5';
const baselinePath = 'art/review/ai_image_v5/three_chapters/runtime_report.json';
const finalPath = 'art/review/ai_image_v5/chapter_1_vendor_adjustment/runtime_report.json';
const baseline = read(baselinePath), final = read(finalPath);
for (const report of [baseline, final]) {
    assert.equal(report.status, 'passed');
    for (const key of ['runtimeErrors', 'runtimeWarnings', 'failedRequests']) assert.equal(report[key].length, 0);
}
assert.equal(baseline.totalUniqueCollected, 36); assert.equal(baseline.totalReveals, 9);
assert.equal(final.totalUniqueCollected, 12); assert.equal(final.totalReveals, 3);
const production = read(`${base}/production_manifest.json`);
assert.equal(production.assets.length, 25);
const evidence = {
    threeChapterBaseline: { path: baselinePath, sha256: hash(baselinePath) },
    finalFirstChapter: { path: finalPath, sha256: hash(finalPath) },
    status: 'web_mobile_verified', playerVisualApproval: 'pending', wechatPhone: 'not_run',
};
production.runtimeVerification = evidence;
production.visualApproval = 'pending';
for (const asset of production.assets) {
    assert.equal(hash(asset.output), asset.sha256);
    assert.equal(hash(asset.runtime), asset.sha256);
    asset.status = 'runtime_verified_visual_unapproved';
}
write(`${base}/production_manifest.json`, production);
const global = read('art/asset_manifest.json');
for (const asset of global.assets.filter(asset => asset.batchId === 'ai_image_v5')) {
    asset.status = 'runtime_verified_visual_unapproved';
    asset.category = 'scene_asset';
    asset.runtimeReviewPath = finalPath;
    asset.description = asset.reusedGeneratedSourceBatch
        ? 'Historical generated support mechanically re-exported into the wider first chapter. Web Mobile verified; player visual approval pending.'
        : 'Built-in generated scene PNG mechanically exported for the wider first chapter. Web Mobile verified; player visual approval pending.';
}
const batch = {
    id: 'ai_image_v5', category: 'first_chapter_overhaul_generated_png_batch',
    status: 'runtime_verified_visual_unapproved', sourceType: 'codex_builtin_image_gen',
    styleId: 'cozy_flat_town_v5', sourcePath: `${base}/sources/`, promptPath: `${base}/prompts/`,
    generationRecordPath: `${base}/generation_record.json`, idManifestPath: `${base}/production_manifest.json`,
    finalFolder: 'assets/generated/', counts: { newGeneratedSources: 14, unchangedHistoricalSources: 5,
        repeatedNewSourceExports: 6, scenePngFiles: 25 },
    mapSize: { width: 2304, height: 2048 }, buildingScaleFromPreviousLayout: 0.8,
    runtimeVerification: evidence,
    retainedArtBatch: 'ai_image_v4',
    description: 'Stage 1 wider street composition. First chapter scene uses v5 PNGs; five supports, all characters/targets/reveal states/UI and the other two chapters retain v4 assets. Character redesign and content expansion remain planned.',
};
const index = global.assets.findIndex(asset => asset.id === batch.id);
if (index < 0) global.assets.push(batch); else global.assets[index] = batch;
const previous = global.assets.find(asset => asset.id === 'ai_image_v4');
previous.activeRuntimeScope = ['characters', 'targets', 'interaction_states', 'ui', 'garden_market_02', 'harbor_walk_03', 'five_reused_street_supports'];
previous.description = 'Historical generated batch retained for shared characters, targets, interaction states, UI and chapters 2/3. Its old first-chapter scene registrations remain preserved as history; current first-chapter scene composition is v5.';
global.currentProductionId = 'ai_image_v5';
global.styleId = 'cozy_flat_town_v5';
global.styleStatus = 'staged_migration_runtime_verified_visual_approval_pending';
global.activeProductionByChapter = {
    living_city_street_block_01: { scene: 'ai_image_v5', sharedActorsTargetsInteractionsUi: 'ai_image_v4' },
    living_city_garden_market_02: { scene: 'ai_image_v4', sharedActorsTargetsInteractionsUi: 'ai_image_v4' },
    living_city_harbor_walk_03: { scene: 'ai_image_v4', sharedActorsTargetsInteractionsUi: 'ai_image_v4' },
};
write('art/asset_manifest.json', global);
console.log(JSON.stringify({ status: 'verification_recorded', scenePngFiles: 25, playerVisualApproval: 'pending' }));
