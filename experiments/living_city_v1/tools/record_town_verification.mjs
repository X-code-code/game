// Retain exact generated-source provenance and completed runtime evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v7',review='art/review/ai_image_v7';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const reportPath=process.argv[2]??`${review}/three_chapters/runtime_report.json`;
const report=read(reportPath),blueprint=read('design/street_block_01.json');
assert.equal(report.status,'passed');assert.equal(report.totalUniqueCollected,48);assert.equal(report.totalReveals,12);
for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(report[key].length,0);
const followupPath=process.argv[3]??`${review}/chapter_1_followup/runtime_report.json`;
const followup=read(followupPath);
assert.equal(followup.status,'passed');assert.equal(followup.totalUniqueCollected,24);assert.equal(followup.totalReveals,6);
for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(followup[key].length,0);
assert.equal(followup.unchangedChapterBaseline.sha256,hash(reportPath));
assert.equal(followup.chapters[0].newResidentAnimations.actors.length,8);
assert.equal(followup.chapters[0].buildings,11);assert.equal(followup.chapters[0].residents,16);
assert.equal(blueprint.artSlots.length,49);assert.equal(blueprint.npcPlans.length,16);
assert.equal(blueprint.artSlots.filter(s=>s.layer==='building_back').length,11);
assert.equal(blueprint.hiddenObjectSlots.length,24);assert.equal(blueprint.interactiveSlots.length,6);
const placementPath=`${review}/placement_review.json`,integrityPath=`${review}/asset_integrity_report.json`;
assert.equal(read(placementPath).status,'passed');assert.equal(read(integrityPath).status,'passed');
assert.equal(read(placementPath).sceneBlueprintSha256,hash('design/street_block_01.json'));
const production=read(`${base}/production_manifest.json`),generation=read(`${base}/generation_record.json`);
assert.equal(production.assets.length,54);assert.equal(generation.sources.length,22);
const sourceReviewPath=`${review}/source_review.json`;
const evidence={threeChapters:{path:reportPath,sha256:hash(reportPath)},
    finalFirstChapter:{path:followupPath,sha256:hash(followupPath)},
    sourceReview:{path:sourceReviewPath,sha256:hash(sourceReviewPath)},
    placement:{path:placementPath,sha256:hash(placementPath)},assetIntegrity:{path:integrityPath,sha256:hash(integrityPath)},
    status:'web_mobile_verified',playerVisualApproval:'pending',wechatPhone:'not_run'};
production.runtimeVerification=evidence;production.visualApproval='pending';
production.sceneBlueprintSha256=hash('design/street_block_01.json');
for(const asset of production.assets){
    assert.equal(hash(asset.output),asset.sha256);assert.equal(hash(asset.runtime),asset.sha256);
    assert.equal(hash(asset.source),asset.sourceSha256);asset.status='runtime_verified_visual_unapproved';
}
write(`${base}/production_manifest.json`,production);
generation.sceneBlueprintSha256=production.sceneBlueprintSha256;generation.runtimeVerification=evidence;
for(const source of generation.sources){
    assert.equal(hash(source.source),source.sourceSha256);
    if(production.assets.some(asset=>asset.source===source.source))source.status='used_runtime_verified_visual_unapproved';
}
write(`${base}/generation_record.json`,generation);
const global=read('art/asset_manifest.json');
function upsert(asset){const i=global.assets.findIndex(row=>row.id===asset.id);if(i<0)global.assets.push(asset);else global.assets[i]=asset;}
for(const asset of production.assets)upsert({id:asset.sceneSlotId??asset.name,filename:path.basename(asset.output),
    category:asset.stage==='scene'?'scene_asset':'character_cel',batchId:'ai_image_v7',
    sourceType:'codex_builtin_image_gen',status:asset.status,styleId:'cozy_flat_town_v5',productionStyleId:'cozy_flat_town_v5',
    path:asset.output,runtimePath:asset.runtime,format:'PNG',size:`${asset.width}x${asset.height}`,transparent:true,
    sourcePath:asset.source,promptPath:asset.prompt,sourceSha256:asset.sourceSha256,sha256:asset.sha256,
    ...(asset.actor?{actorId:asset.actor,frameIndex:asset.frameIndex,sharedSheetScale:asset.sharedSheetScale,footpoint:asset.footpoint}:{}),
    generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,runtimeReviewPath:followupPath,
    description:'Generated town variety PNG, mechanically registered and Web Mobile verified; player visual approval pending.'});
upsert({id:'ai_image_v7',category:'first_chapter_buildings_residents_generated_png_batch',status:'runtime_verified_visual_unapproved',
    sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',sourcePath:`${base}/sources/`,promptPath:`${base}/prompts/`,
    generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,finalFolder:'assets/generated/',
    counts:{newGenerationCalls:22,activeNewGeneratedSources:14,unusedSupersededCandidates:8,buildingPngFiles:6,actors:8,characterCelPngFiles:48,finalPngFiles:54},
    mapSize:blueprint.map,firstChapterContent:{sceneSlots:49,buildings:11,residents:16,targets:24,reveals:6,lifeGroups:6},
    runtimeVerification:evidence,retainedArtBatches:['ai_image_v5','ai_image_v6','ai_image_v4'],
    description:'Six independent facades and eight residents with generated idle, alternating side steps and occupational poses. Eighteen unused repeated furniture instances leave the active layout; their source assets are retained.'});
const activeSceneIds=new Set(blueprint.artSlots.map(s=>s.id));
for(const asset of global.assets){
    if(asset.category==='scene_asset'&&['ai_image_v5','ai_image_v6','ai_image_v7'].includes(asset.batchId))
        asset.activeInFirstChapter=activeSceneIds.has(asset.id);
}
global.currentProductionId='ai_image_v7';global.styleId='cozy_flat_town_v5';
global.styleStatus='staged_migration_runtime_verified_visual_approval_pending';
global.activeProductionByChapter={
    living_city_street_block_01:{sceneBase:'ai_image_v5',sceneContent:'ai_image_v6',newBuildingFacades:'ai_image_v7',
        originalTargetsInteractions:'ai_image_v4',newTargetsInteractions:'ai_image_v6',
        newResidents:'ai_image_v7',existingResidentsUi:'ai_image_v4'},
    living_city_garden_market_02:{scene:'ai_image_v4',sharedActorsTargetsInteractionsUi:'ai_image_v4'},
    living_city_harbor_walk_03:{scene:'ai_image_v4',sharedActorsTargetsInteractionsUi:'ai_image_v4'},
};
write('art/asset_manifest.json',global);
console.log(JSON.stringify({status:'verification_recorded',newPngFiles:54,firstChapterSceneSlots:49,
    firstChapterBuildings:11,firstChapterResidents:16,firstChapterTargets:24,firstChapterReveals:6,playerVisualApproval:'pending'}));
