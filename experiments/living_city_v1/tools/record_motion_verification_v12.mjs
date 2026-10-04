import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=f=>JSON.parse(fs.readFileSync(f)), hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const review='art/review/ai_image_v12';
const paths={runtime:`${review}/three_chapters/runtime_report.json`,surfaces:`${review}/after_surfaces/surface_report.json`,registration:`${review}/registration_report.json`,integrity:`${review}/asset_integrity_report.json`,placement:'art/review/ai_image_v11/placement_review.json',visual:`${review}/visual_review.json`};
const r=read(paths.runtime),s=read(paths.surfaces),registration=read(paths.registration),visual=read(paths.visual);
assert.equal(r.status,'passed');assert.equal(r.chapters.length,3);assert.equal(r.totalUniqueCollected,56);assert.equal(r.totalReveals,14);
assert.equal(r.previousVersionRestore.restoredCompleted,32);
assert.equal(s.status,'passed');assert.equal(s.samples.length,16);assert.equal(s.collected.length,4);assert.equal(s.restoredAfterReload,true);
assert.equal(registration.status,'passed');assert.equal(read(paths.integrity).status,'passed');assert.equal(read(paths.placement).status,'png_geometry_checks_passed');
assert.equal(visual.status,'agent_visual_review_completed');
for(const report of [s,registration,read(paths.placement)])assert.equal(report.sceneBlueprintSha256,hash('design/street_block_01.json'));
for(const report of [s,r])for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(report[key].length,0);
assert.equal(r.chapters[0].newResidentAnimations.actors.length,16);
assert.equal(r.chapters[0].playbackRecordings.length,3);
const buildLog=`${review}/web_mobile_build.txt`;assert.match(fs.readFileSync('temp/v12_final_stdout.log','utf8'),/build Task \(web-mobile\) Finished/);fs.copyFileSync('temp/v12_final_stdout.log',buildLog);
const sourceFiles=['assets/scripts/character/CelAnimationPlayer.ts','assets/scripts/map/SceneArtSlot.ts','assets/scripts/map/LivingCityGreybox.ts'];
const evidence={status:'web_mobile_verified',playerVisualApproval:'pending',wechatPhone:'not_run',sceneBlueprintSha256:s.sceneBlueprintSha256,reports:Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,{path,sha256:hash(path)}])),build:{path:buildLog,sha256:hash(buildLog)},runtimeSources:sourceFiles.map(path=>({path,sha256:hash(path)}))};
const m=read('art/asset_manifest.json'),b=read('design/street_block_01.json'),active=m.activeProductionByChapter[b.id];
const upsert=row=>{const index=m.assets.findIndex(a=>a.id===row.id);if(index<0)m.assets.push(row);else m.assets[index]=row;};
for(const batchId of ['ai_image_v11','ai_image_v12']){
 const base=`art/production/${batchId}`,p=read(`${base}/production_manifest.json`),g=read(`${base}/generation_record.json`);
 assert.equal(p.assets.length,batchId==='ai_image_v11'?4:284);assert.equal(g.sources.length,batchId==='ai_image_v11'?4:18);
 for(const a of p.assets){
  for(const file of [a.output,a.runtime])assert.equal(hash(file),a.sha256);assert.equal(hash(a.source),a.sourceSha256);
  if(a.targetId){const shown=r.chapters[0].targetSpriteFrames.find(t=>t.id===a.targetId);assert.equal(shown.runtimeSha256,a.sha256);assert.equal(shown.displayedMapUuid,shown.expectedSpriteFrameUuid);assert.equal(shown.displayedTrayUuid,shown.expectedSpriteFrameUuid);}
  for(const previous of m.assets)if(previous.id!==a.name&&(previous.runtimePath===a.runtime||(a.actor&&previous.actorId===a.actor&&previous.batchId!==batchId))){previous.activeInFirstChapter=false;previous.supersededFirstChapterRuntimeByBatch=batchId;}
  a.status='runtime_verified_visual_unapproved';
  upsert({id:a.name,filename:a.output.split('/').pop(),category:a.targetId?'target_asset':a.actor?'character_cel':'scene_asset',batchId,sourceType:'codex_builtin_image_gen',status:a.status,styleId:'cozy_flat_town_v5',path:a.output,runtimePath:a.runtime,format:'PNG',size:`${a.width}x${a.height}`,transparent:true,activeInFirstChapter:true,sourcePath:a.source,promptPath:a.prompt,sourceSha256:a.sourceSha256,sha256:a.sha256,targetId:a.targetId,actorId:a.actor,frameIndex:a.frameIndex,footpoint:a.footpoint,sharedSheetScale:a.sharedSheetScale,sceneSlotId:a.sceneSlotId,textureScale:a.textureScale,worldSize:a.worldSize,reusedSourceBatch:a.reusedSourceBatch,generationRecordPath:a.stage==='scene_hd'?`art/production/${a.reusedSourceBatch}/generation_record.json`:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,runtimeVerification:evidence});
  if(a.targetId)active.targetsById[a.targetId]=batchId;
  if(a.actor)active.actorsById[a.actor]=batchId;
  if(a.sceneSlotId){active.sceneTextureExportsBySlotId??={};active.sceneTextureExportsBySlotId[a.sceneSlotId]=batchId;}
 }
 const used=new Set(p.assets.map(a=>a.source));
 for(const source of g.sources){assert.equal(hash(source.source),source.sourceSha256);for(const ref of source.references??[])assert.equal(hash(ref.path),ref.sha256);source.status=used.has(source.source)?'used_runtime_verified_visual_unapproved':source.id.includes('flower_buyer')?'superseded_clipped_feet_candidate':'superseded_missing_glasses_candidate';}
 const counts={newGenerationCalls:g.sources.length,activeNewGeneratedSources:g.sources.filter(x=>used.has(x.source)).length,finalPngFiles:p.assets.length,higherDensityReexports:p.assets.filter(a=>a.stage==='scene_hd').length};
 upsert({id:batchId,category:batchId==='ai_image_v11'?'target_surface_integration_batch':'existing_scene_density_and_resident_motion_batch',sourceType:'codex_builtin_image_gen',status:'runtime_verified_visual_unapproved',counts,generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,runtimeVerification:evidence});
 p.runtimeVerification=evidence;p.visualApproval='pending';g.runtimeVerification=evidence;write(`${base}/production_manifest.json`,p);write(`${base}/generation_record.json`,g);
}
active.refinedExistingTargets='ai_image_v11';active.residentMotion='ai_image_v12';
for(const key of ['teaResidents','retainedOriginalResidents','newResidents'])active[key]='ai_image_v12';
m.currentProductionId='ai_image_v12';write('art/asset_manifest.json',m);
console.log(JSON.stringify({status:'verification_recorded',higherDensityScenes:64,residents:16,newActorFrames:220,refinedTargets:4,addedContent:0,playerVisualApproval:'pending'}));
