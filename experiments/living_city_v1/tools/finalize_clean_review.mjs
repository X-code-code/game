import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const folder = 'art/production/clean_cartoon_v3';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const evidence = 'art/review/clean_cartoon_v3/runtime_report.json';
const runtime = read(evidence), qa = read(`${folder}/qa_report.json`), production = read(`${folder}/production_manifest.json`);
assert.equal(runtime.status, 'passed'); assert.equal(qa.assetsChecked, 91);
assert.equal(runtime.collections.length, 12); assert.equal(runtime.reveals.length, 3);
assert.equal(runtime.runtimeErrors.length, 0); assert.equal(runtime.failedRequests.length, 0);
assert.equal(runtime.detailZoom.zoom, 2.25);
// An earlier passing browser report cannot bless replaced runtime pixels.
production.assets.forEach(asset => assert.equal(sha(asset.runtime), asset.sha256, asset.id));
qa.runtimeAcceptance = 'passed_web_mobile'; qa.runtimeEvidence = evidence;
qa.runtimeSummary = {
    sceneLayers: runtime.initial.sceneLayers, npcs: runtime.initial.npcs.length,
    smallPhone: runtime.smallPhone, detailZoom: runtime.detailZoom, motion: runtime.motion,
    collected: runtime.collections.length, reveals: runtime.reveals.length,
    restored: runtime.restored, teaEventCompleted: runtime.completion.eventCompleted,
    prerequisiteHints: runtime.prerequisites, runtimeErrors: runtime.runtimeErrors.length,
    runtimeWarnings: runtime.runtimeWarnings.length, failedRequests: runtime.failedRequests.length,
    finalLandingWait: runtime.completion.proof.samples.every(s => !(s.flights || s.landing) || !s.completion),
};
qa.validatedFiles = ['assets/bundles/city_living_city_street_block_01/city.json',
    'build/web-mobile/assets/main/index.js', 'assets/scripts/character/AmbientChickenPainter.ts']
    .map(file => ({file,sha256:sha(file)}));
write(`${folder}/qa_report.json`, qa);
production.review.runtime = 'passed_web_mobile'; production.review.runtimeEvidence = evidence;
production.assets.forEach(asset => {asset.reviewPath = `${folder}/qa_report.json`;});
write(`${folder}/production_manifest.json`, production);
const manifest = read('art/asset_manifest.json');
manifest.styleId = production.styleId;
manifest.styleStatus = 'user_selected_direction_assets_pending';
manifest.selectedStyleReferenceId = 'bg_png_clean_cartoon_20260930';
for (const id of ['simple_city_scene_v1','simple_hidden_objects_v1','simple_chicken_courier_v1']) {
    const old = manifest.assets.find(asset => asset.id === id);
    old.status = 'superseded'; old.supersededBy = 'clean_cartoon_v3';
}
const rejected = manifest.assets.find(asset => asset.id === 'refined_city_v2');
rejected.status = 'rejected'; rejected.supersededBy = 'clean_cartoon_v3';
rejected.rejectionReason = 'User rejected the visual style as robotic/AI-looking and supplied bg-png screenshots as a new direction on 2026-09-30.';
rejected.description = 'Historical v2 trial and functional checks retained. Its art was rejected by the user; current runtime pixels belong to clean_cartoon_v3.';
const ambient = manifest.assets.find(asset => asset.id === 'simple_ambient_cast_v1');
ambient.styleRevision = 'clean_cartoon_v3'; ambient.reviewPath = `${folder}/AMBIENT_CAST.md`;
ambient.description = 'Seven existing editable code-drawn residents now use the clean-cartoon common palette. Directional geometry, footpoints and activities are retained. Current browser validation passed; player approval and WeChat device testing pending.';
const generation = read(`${folder}/generation_record.json`), references = read(`${folder}/reference_record.json`);
const entries = [
    {id:'bg_png_clean_cartoon_20260930',category:'style_reference_set',status:'user_selected_direction',
        approvalScope:'broad_visual_direction_only',sourceType:'user_provided_local_screenshots',runtimeAsset:false,
        sourcePath:'C:/Users/24627/Desktop/bg-png',idManifestPath:`${folder}/reference_record.json`,
        assets:references.assets,reviewPath:`${folder}/REFERENCE_ANALYSIS.md`,
        description:'Four actual user-supplied screenshots select clean outlines, flat colors and readable town prop clusters. They do not approve any runtime asset. No screenshot pixels are used in the game.'},
    {id:generation.id,category:'scene_concept_reference',status:'concept_reference_only',runtimeAsset:false,
        sourceType:'codex_builtin_image_gen',path:`${folder}/lc_clean_cartoon_direction_v3_source.png`,
        size:generation.actualSize.join('x'),format:'PNG RGB',transparent:false,sha256:generation.sha256,
        promptPath:`${folder}/PROMPT.md`,generationRecordPath:`${folder}/generation_record.json`,
        description:'Generated direction study retained unchanged; separate authored sources produce runtime layers. Not player-approved.'},
    {id:'clean_cartoon_v3',category:'layered_scene_search_and_cel_batch',status:'trial_unapproved',
        sourceType:'codex_authored_2d_code',assetCount:91,
        counts:{sceneLayers:44,hiddenObjects:12,interactionStateImages:6,courierCels:29},
        idManifestPath:`${folder}/production_manifest.json`,sourcePath:production.editableSource,
        sourceDependencies:production.sourceDependencies,conceptReferenceId:generation.id,
        styleReferenceId:'bg_png_clean_cartoon_20260930',bundleFolder:'assets/bundles/city_living_city_street_block_01',
        reviewPath:`${folder}/qa_report.json`,runtimeReviewPath:evidence,
        description:'Clean flat cartoon revision after user rejected v2: gray paving/green courtyards, colorful compact storefronts, recessed windows and eaves, controlled plant silhouettes, unified prop and character palette. 91 exports mechanically checked; Web Mobile collection/reveal/restore and phone/max-zoom checks passed. Player visual approval and WeChat device testing pending.'},
];
for (const entry of entries) {
    const index = manifest.assets.findIndex(asset => asset.id === entry.id);
    if(index<0) manifest.assets.push(entry); else manifest.assets[index]=entry;
}
write('art/asset_manifest.json', manifest);
console.log(JSON.stringify(qa.runtimeSummary));
