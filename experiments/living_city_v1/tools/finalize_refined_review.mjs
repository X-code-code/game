import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Run after exports, mechanical validation and the actual browser smoke pass.
const folder = 'art/production/refined_city_v2';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const runtimePath = 'art/review/refined_city_v2/runtime_report.json';
const runtime = read(runtimePath), qa = read(`${folder}/qa_report.json`);
const production = read(`${folder}/production_manifest.json`), generation = read(`${folder}/generation_record.json`);
assert.equal(runtime.status, 'passed');
assert.equal(runtime.collections.length, 12); assert.equal(runtime.reveals.length, 3);
assert.equal(runtime.runtimeErrors.length, 0); assert.equal(runtime.failedRequests.length, 0);
assert.equal(qa.assetsChecked, 62);
qa.runtimeAcceptance = 'passed_web_mobile';
qa.runtimeEvidence = runtimePath;
qa.runtimeSummary = {
    portrait: '444x960', smallPhone: runtime.smallPhone,
    sceneLayers: runtime.initial.sceneLayers, npcs: runtime.initial.npcs.length,
    collected: runtime.collections.length, reveals: runtime.reveals.length,
    motion: runtime.motion, teaEventCompleted: runtime.completion.eventCompleted,
    prerequisiteHints: runtime.prerequisites,
    restored: runtime.restored, runtimeErrors: runtime.runtimeErrors.length,
    runtimeWarnings: runtime.runtimeWarnings.length, failedRequests: runtime.failedRequests.length,
    finalLandingWait: runtime.completion.proof.samples.every(s => !(s.flights || s.landing) || !s.completion),
};
qa.validatedFiles = ['assets/bundles/city_living_city_street_block_01/city.json',
    'build/web-mobile/assets/main/index.js'].map(file => ({file,
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
write(`${folder}/qa_report.json`, qa);
production.review.runtime = 'passed_web_mobile';
production.review.runtimeEvidence = runtimePath;
production.assets.forEach(asset => { asset.reviewPath = `${folder}/qa_report.json`; });
write(`${folder}/production_manifest.json`, production);
const manifest = read('art/asset_manifest.json');
for (const id of ['simple_city_scene_v1', 'simple_hidden_objects_v1']) {
    const old = manifest.assets.find(asset => asset.id === id);
    old.status = 'superseded'; old.supersededBy = 'refined_city_v2';
    old.description = 'Historical trial source and checks retained. The current runtime bundle is replaced by refined_city_v2; this earlier batch report does not validate the current bundle.';
}
const entries = [
    {
        id: generation.id, category: 'scene_concept_reference', status: 'concept_reference_only',
        sourceType: 'codex_builtin_image_gen', runtimeAsset: false,
        path: `${folder}/lc_refined_street_direction_v2_source.png`,
        size: generation.actualSize.join('x'), format: 'PNG RGB', transparent: false, sha256: generation.sha256,
        promptPath: `${folder}/PROMPT.md`, generationRecordPath: `${folder}/generation_record.json`,
        reviewPath: `${folder}/qa_report.json`,
        description: 'Built-in generated concept retained unchanged with exact prompt. Direction reference only; runtime layers are separately authored editable 2D drawings. Not player-approved.',
    },
    {
        id: 'refined_city_v2', category: 'layered_scene_and_search_batch', status: 'trial_unapproved',
        sourceType: 'codex_authored_2d_code', assetCount: production.assets.length,
        counts: {sceneLayers: 44, hiddenObjects: 12, interactionStateImages: 6},
        idManifestPath: `${folder}/production_manifest.json`, sourcePath: `${folder}/render_refined.py`,
        sourceDependencies: ['art/production/simple_city_scene_v1/render_scene.py',
            'art/production/simple_hidden_objects_v1/render_targets.py'],
        conceptReferenceId: generation.id,
        bundleFolder: 'assets/bundles/city_living_city_street_block_01',
        reviewPath: `${folder}/qa_report.json`, runtimeReviewPath: runtimePath,
        description: '62 registered exports with finer shop, stall, ceramic, wood and flower details. 12 independent search objects and 3 persisted reveals; source/runtime hashes, alpha, dimensions and metadata checked. Cocos Web Mobile collection and restoration passed with no runtime errors. Player visual approval and WeChat device testing pending.',
    },
];
for (const entry of entries) {
    const index = manifest.assets.findIndex(asset => asset.id === entry.id);
    if (index < 0) manifest.assets.push(entry); else manifest.assets[index] = entry;
}
write('art/asset_manifest.json', manifest);
console.log(JSON.stringify(qa.runtimeSummary));
