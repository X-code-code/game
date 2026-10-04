// Record only completed real runtime and generated-PNG evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v9',review='art/review/ai_image_v9';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,r)=>fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n');
const p=read(`${base}/production_manifest.json`),g=read(`${base}/generation_record.json`),jobs=read(`${base}/generation_plan.json`).jobs;
const rpath=`${review}/before_pen_surface/runtime_report.json`,r=read(rpath),b=read('design/street_block_01.json'),c=r.chapters[0];
// Full journey first; the final change moves only the pen. Verify that placement
// in a fresh build with real collection/reload and all six generated front rims.
const finalPath=`${review}/front_rim_detail/rim_report.json`,final=read(finalPath);
assert.equal(final.status,'passed');assert.equal(final.scope,'final_pen_placement_and_generated_front_rims');
assert.equal(final.sceneBlueprintSha256,hash('design/street_block_01.json'));assert.equal(final.samples.length,6);
assert.deepEqual(final.pen.at,b.hiddenObjectSlots.find(t=>t.id==='fountain_pen').at);assert.equal(final.pen.actualMouseCollection,true);assert.equal(final.pen.restoredAfterReload,true);
for(const k of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(final[k].length,0);
assert.equal(r.status,'passed');assert.equal(r.chapters.length,3);assert.equal(r.totalUniqueCollected,56);assert.equal(r.totalReveals,14);
for(const k of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(r[k].length,0);
assert.equal(c.sceneLayers,65);assert.equal(c.targets,32);assert.equal(c.revealCount,8);assert.equal(c.residents,16);assert.equal(c.buildings,11);
assert.equal(c.targetTrayPaging.pages,3);assert.equal(c.targetSpriteFrames.length,32);assert.equal(c.targetTrayPaging.pngAspectPreserved,true);
assert.equal(c.targetTrayPaging.mapAndTrayUseSameSpriteFrames,true);assert.equal(c.targetTrayPaging.viewports.length,2);
assert.equal(c.reveals.filter(r=>r.generatedFrontRim?.active&&r.generatedFrontRim?.sameTexture).length,6);
assert.equal(r.previousVersionRestore.restoredCompleted,24);assert.equal(r.previousVersionRestore.newRequiredTotal,32);
assert.equal(r.previousVersionRestore.staleCompletionRemoved,true);assert.equal(r.previousVersionRestore.unlocksAndOtherCitiesPreserved,true);
assert.equal(r.legacyCompletionUpgrade.restoredCompleted,12);
for(const chapter of r.chapters){const fit=chapter.dialogueFit;assert.equal(fit.viewportClipping,false);assert.equal(fit.overlapsTargetTray,false);for(const s of fit.samples){assert.ok(s.bounds.left>=-1&&s.bounds.top>=-1&&s.bounds.right<=s.viewport.width+1&&s.bounds.bottom<=s.trayBounds.top+1);}}
for(const id of ['flower_scent','child_wave']){const event=c.residentTapActivities.find(e=>e.eventId===id);for(const k of ['actualMouseInput','completionOnlyAward','cooldownChecked','requiredProgressUnchanged','restoredAfterReload'])assert.equal(event[k],true);assert.ok(new Set(event.generatedJobFrames).size>=2);}
assert.equal(c.activeTeaInvitation.completionOnlyAward,true);assert.equal(c.activeTeaInvitation.restoredAfterReload,true);assert.equal(c.repeatableTea.singleCupNeverDuplicated,true);
const renewed=b.npcPlans.filter(n=>n.generatedSourceBatch==='ai_image_v9');assert.equal(renewed.length,6);
for(const n of renewed){const a=c.newResidentAnimations.actors.find(a=>a.id===n.id);assert.ok(a);for(const clip of ['idle_w','receive_w'])assert.ok(new Set(a.observedClips[clip]).size>=2);}
assert.equal(p.assets.length,65);assert.equal(g.sources.length,jobs.length);
const active=new Set(p.assets.map(a=>a.source));assert.equal(active.size,15);
for(const s of g.sources){assert.equal(hash(s.source),s.sourceSha256);assert.equal(hash(s.originalToolOutput),s.sourceSha256);assert.ok(fs.readFileSync(s.prompt,'utf8').trim().length>100);}
for(const a of p.assets){assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.source),a.sourceSha256);assert.ok(a.sourceHasAlpha&&a.alphaBounds.transparent>0);}
for(const a of p.assets.filter(a=>a.stage==='target')){const t=c.targetSpriteFrames.find(t=>t.id===a.targetId);assert.equal(t.runtimeSha256,a.sha256);assert.equal(t.displayedMapUuid,t.expectedSpriteFrameUuid);assert.equal(t.displayedTrayUuid,t.expectedSpriteFrameUuid);}
const sourceReviewPath=`${review}/source_review.json`,placementPath=`${review}/placement_review.json`,integrityPath=`${review}/asset_integrity_report.json`;
const sr=read(sourceReviewPath),pr=read(placementPath),ir=read(integrityPath);assert.equal(sr.reviewStatus,'source_visual_review_recorded');assert.equal(sr.checkedSources,g.sources.length);assert.equal(pr.status,'png_geometry_checks_passed');assert.equal(pr.sceneBlueprintSha256,hash('design/street_block_01.json'));assert.equal(ir.status,'passed');assert.equal(ir.uniqueTargets,56);
const evidence={status:'web_mobile_verified',scope:'Full three-chapter journey before final pen-only position adjustment; final built pen collection/reload and six front rims verified separately.',playerVisualApproval:'pending',wechatPhone:'not_run',threeChapters:{path:rpath,sha256:hash(rpath)},finalPlacement:{path:finalPath,sha256:hash(finalPath)},sourceReview:{path:sourceReviewPath,sha256:hash(sourceReviewPath)},placement:{path:placementPath,sha256:hash(placementPath)},assetIntegrity:{path:integrityPath,sha256:hash(integrityPath)}};
p.runtimeVerification=evidence;p.sceneBlueprintSha256=pr.sceneBlueprintSha256;p.visualApproval='pending';g.runtimeVerification=evidence;g.sceneBlueprintSha256=pr.sceneBlueprintSha256;
for(const a of p.assets)a.status='runtime_verified_visual_unapproved';
for(const s of g.sources)if(active.has(s.source))s.status='used_runtime_verified_visual_unapproved';
const m=read('art/asset_manifest.json'),upsert=a=>{const i=m.assets.findIndex(x=>x.id===a.id);if(i<0)m.assets.push(a);else m.assets[i]={...m.assets[i],...a};};
const replacedPaths=new Set(p.assets.map(a=>a.runtime)),actorIds=new Set(renewed.map(a=>a.id));
for(const a of m.assets)if(replacedPaths.has(a.runtimePath)||actorIds.has(a.actorId)){a.activeInFirstChapter=false;a.supersededFirstChapterRuntimeByBatch='ai_image_v9';}
for(const a of p.assets)upsert({id:a.name,filename:path.basename(a.output),category:a.stage==='scene'?'scene_asset':a.stage==='target'?'target_asset':a.stage==='interaction'?'interaction_state':'character_cel',batchId:'ai_image_v9',sourceType:'codex_builtin_image_gen',status:a.status,styleId:'cozy_flat_town_v5',path:a.output,runtimePath:a.runtime,format:'PNG',size:`${a.width}x${a.height}`,transparent:true,activeInFirstChapter:true,sourcePath:a.source,promptPath:a.prompt,sourceSha256:a.sourceSha256,sha256:a.sha256,...(a.actor?{actorId:a.actor,frameIndex:a.frameIndex,footpoint:a.footpoint,sharedSheetScale:a.sharedSheetScale}:{}),...(a.targetId?{targetId:a.targetId}:{}),...(a.sceneSlotId?{sceneSlotId:a.sceneSlotId}:{}),generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,runtimeReviewPath:rpath});
upsert({id:'ai_image_v9',category:'first_chapter_visual_polish_and_exploration_batch',sourceType:'codex_builtin_image_gen',status:'runtime_verified_visual_unapproved',counts:{newGenerationCalls:g.sources.length,activeNewGeneratedSources:15,unusedSupersededCandidates:g.sources.length-15,scenePngFiles:5,targetPngFiles:8,interactionPngFiles:4,renewedActors:6,characterCelPngFiles:48,finalPngFiles:65},sourcePath:`${base}/sources/`,promptPath:`${base}/prompts/`,finalFolder:'assets/generated/',generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,firstChapterContent:{sceneSlots:65,buildings:11,residents:16,targets:32,reveals:8},runtimeVerification:evidence});
const current=m.activeProductionByChapter[b.id];
for(const a of p.assets){if(a.sceneSlotId)current.sceneBySlotId[a.sceneSlotId]='ai_image_v9';if(a.actor)current.actorsById[a.actor]='ai_image_v9';if(a.targetId)current.targetsById[a.targetId]='ai_image_v9';if(a.interactionId)current.interactionsById[a.interactionId]='ai_image_v9';}
current.retainedOriginalResidents='ai_image_v9';current.polishedFixturesAndAdditionalTargets='ai_image_v9';current.newResidentTapActivities=['flower_scent','child_wave'];
m.currentProductionId='ai_image_v9';m.styleStatus='staged_migration_runtime_verified_visual_approval_pending';
write(`${base}/production_manifest.json`,p);write(`${base}/generation_record.json`,g);write('art/asset_manifest.json',m);
console.log(JSON.stringify({status:'verification_recorded',assets:65,actualCalls:g.sources.length,activeSources:15,targets:32,reveals:8,reportSha256:hash(rpath),playerVisualApproval:'pending'}));
