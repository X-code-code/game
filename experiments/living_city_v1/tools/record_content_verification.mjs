// Record PNG provenance and completed in-game evidence. No artwork is drawn.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const base='art/production/ai_image_v6';
const reportPath=process.argv[2]??'art/review/ai_image_v6/three_chapters/runtime_report.json';
const report=read(reportPath),blueprint=read('design/street_block_01.json');
assert.equal(report.status,'passed');
for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(report[key].length,0);
assert.equal(report.totalUniqueCollected,48);assert.equal(report.totalReveals,12);
assert.equal(blueprint.artSlots.length,61);assert.equal(blueprint.hiddenObjectSlots.length,24);
const production=read(`${base}/production_manifest.json`),generation=read(`${base}/generation_record.json`);
assert.equal(production.assets.length,54);
const followupPath=process.argv[3]??'art/review/ai_image_v6/chapter_1_followup/runtime_report.json';
const followup=read(followupPath);
assert.equal(followup.status,'passed');assert.equal(followup.totalUniqueCollected,24);
assert.equal(followup.totalReveals,6);
for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(followup[key].length,0);
assert.equal(followup.unchangedChapterBaseline.sha256,hash(reportPath));
assert.equal(followup.chapters[0].layers,61);
assert.equal(followup.legacyCompletionUpgrade.restoredCompleted,12);
assert.equal(followup.legacyCompletionUpgrade.newRequiredTotal,24);
assert.equal(followup.legacyCompletionUpgrade.nextChapterUnlockRetained,true);
assert.equal(followup.legacyCompletionUpgrade.nextChapterProgressRetained,true);
assert.equal(followup.chapters[0].facilityDiscoveries.length,3);
assert.equal(followup.chapters[0].residentRequests.length,1);
const placementPath='art/review/ai_image_v6/placement_review.json';
const integrityPath='art/review/ai_image_v6/asset_integrity_report.json';
assert.equal(read(placementPath).status,'passed');assert.equal(read(integrityPath).status,'passed');
assert.equal(read(placementPath).sceneBlueprintSha256,hash('design/street_block_01.json'));
const evidence={threeChapters:{path:reportPath,sha256:hash(reportPath)},
    finalFirstChapter:{path:followupPath,sha256:hash(followupPath)},
    placement:{path:placementPath,sha256:hash(placementPath)},assetIntegrity:{path:integrityPath,sha256:hash(integrityPath)},
    status:'web_mobile_verified',
    playerVisualApproval:'pending',wechatPhone:'not_run'};
production.runtimeVerification=evidence;production.visualApproval='pending';
production.sceneBlueprintSha256=hash('design/street_block_01.json');
for(const asset of production.assets) {
    assert.equal(hash(asset.output),asset.sha256);assert.equal(hash(asset.runtime),asset.sha256);
    assert.equal(hash(asset.source),asset.sourceSha256);
    asset.status='runtime_verified_visual_unapproved';
}
write(`${base}/production_manifest.json`,production);
generation.sceneBlueprintSha256=production.sceneBlueprintSha256;
generation.runtimeVerification=evidence;
for(const source of generation.sources) {
    assert.equal(hash(source.source),source.sourceSha256);
    if(production.assets.some(asset=>asset.source===source.source))source.status='used_runtime_verified_visual_unapproved';
}
write(`${base}/generation_record.json`,generation);
const global=read('art/asset_manifest.json');
function upsert(asset) {
    const index=global.assets.findIndex(row=>row.id===asset.id);
    if(index<0)global.assets.push(asset);else global.assets[index]=asset;
}
for(const asset of production.assets) {
    const source=generation.sources.find(row=>row.source===asset.source);
    assert.ok(source);
    upsert({id:asset.sceneSlotId??asset.name,filename:path.basename(asset.output),
        category:asset.stage==='scene'?'scene_asset':asset.stage==='target'?'target_asset':'interaction_state',
        batchId:'ai_image_v6',sourceType:'codex_builtin_image_gen',status:asset.status,
        styleId:'cozy_flat_town_v5',productionStyleId:'cozy_flat_town_v5',path:asset.output,runtimePath:asset.runtime,
        format:'PNG',size:`${asset.width}x${asset.height}`,transparent:true,sourcePath:asset.source,promptPath:asset.prompt,
        sourceSha256:asset.sourceSha256,sha256:asset.sha256,
        generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,
        ...(source.reusedFromProduction?{reusedGeneratedSourceBatch:source.reusedFromProduction}:{}),
        runtimeReviewPath:followupPath,description:'First-chapter content PNG; generated source retained, mechanically exported and Web Mobile verified. Player visual approval pending.'});
}
upsert({id:'ai_image_v6',category:'first_chapter_content_generated_png_batch',
    status:'runtime_verified_visual_unapproved',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',
    sourcePath:`${base}/sources/`,promptPath:`${base}/prompts/`,generationRecordPath:`${base}/generation_record.json`,
    idManifestPath:`${base}/production_manifest.json`,finalFolder:'assets/generated/',
    counts:{newGenerationCalls:13,activeNewGeneratedSources:12,unusedSupersededCandidates:1,
        scenePngFiles:36,reusedSceneExports:30,targetPngFiles:12,interactionStatePngFiles:6,finalPngFiles:54},
    mapSize:blueprint.map,buildingScaleFromPreviousLayout:0.8,
    firstChapterContent:{sceneSlots:61,targets:24,reveals:6,lifeGroups:6},
    runtimeVerification:evidence,retainedArtBatches:['ai_image_v5','ai_image_v4'],
    description:'Content expansion in the v5 drawing language. Six new facilities, 30 generated-source instances, 12 new targets and three independent two-state containers. Actors/UI and other chapters remain v4; original 25 first-chapter layers remain v5.'});
global.currentProductionId='ai_image_v6';global.styleId='cozy_flat_town_v5';
global.styleStatus='staged_migration_runtime_verified_visual_approval_pending';
global.activeProductionByChapter={
    living_city_street_block_01:{sceneBase:'ai_image_v5',sceneContent:'ai_image_v6',
        originalTargetsInteractions:'ai_image_v4',newTargetsInteractions:'ai_image_v6',sharedActorsUi:'ai_image_v4'},
    living_city_garden_market_02:{scene:'ai_image_v4',sharedActorsTargetsInteractionsUi:'ai_image_v4'},
    living_city_harbor_walk_03:{scene:'ai_image_v4',sharedActorsTargetsInteractionsUi:'ai_image_v4'},
};
write('art/asset_manifest.json',global);
console.log(JSON.stringify({status:'verification_recorded',newPngFiles:54,firstChapterTargets:24,firstChapterReveals:6,
    firstChapterSceneSlots:61,playerVisualApproval:'pending'}));
