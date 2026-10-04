import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v11',review='art/review/ai_image_v11',read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const p=read(`${base}/production_manifest.json`),g=read(`${base}/generation_record.json`),b=read('design/street_block_01.json');
const paths={surfaces:`${review}/after_surfaces/surface_report.json`,chapter:`${review}/chapter_1_followup/runtime_report.json`,placement:`${review}/placement_review.json`,integrity:`${review}/asset_integrity_report.json`,visual:`${review}/visual_review.json`};
const s=read(paths.surfaces),r=read(paths.chapter),pr=read(paths.placement),ir=read(paths.integrity);
const visual=read(paths.visual);assert.equal(visual.status,'agent_visual_review_completed');assert.deepEqual(visual.observations.map(o=>o.id).sort(),p.assets.map(a=>a.targetId).sort());
assert.equal(s.status,'passed');assert.equal(s.baseline,false);assert.equal(s.samples.length,16);assert.equal(s.collected.length,4);assert.equal(s.restoredAfterReload,true);assert.equal(s.sceneBlueprintSha256,hash('design/street_block_01.json'));
assert.equal(pr.status,'png_geometry_checks_passed');assert.equal(pr.sceneBlueprintSha256,s.sceneBlueprintSha256);assert.equal(ir.status,'passed');
assert.equal(r.status,'passed');assert.equal(r.chapters.length,1);assert.equal(r.totalUniqueCollected,32);assert.equal(r.totalReveals,8);assert.equal(r.previousVersionRestore.restoredCompleted,32);assert.equal(r.previousVersionRestore.expanded,false);
for(const report of [s,r])for(const k of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(report[k].length,0);
assert.equal(p.assets.length,4);assert.equal(g.sources.length,4);
const evidence={status:'web_mobile_verified',playerVisualApproval:'pending',wechatPhone:'not_run',sceneBlueprintSha256:s.sceneBlueprintSha256,reports:Object.fromEntries(Object.entries(paths).map(([k,path])=>[k,{path,sha256:hash(path)}]))};
const m=read('art/asset_manifest.json');
for(const a of p.assets){assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.source),a.sourceSha256);
 const shown=r.chapters[0].targetSpriteFrames.find(t=>t.id===a.targetId);assert.equal(shown.runtimeSha256,a.sha256);assert.equal(shown.displayedMapUuid,shown.expectedSpriteFrameUuid);assert.equal(shown.displayedTrayUuid,shown.expectedSpriteFrameUuid);
 for(const previous of m.assets)if(previous.runtimePath===a.runtime&&previous.id!==a.name){previous.activeInFirstChapter=false;previous.supersededFirstChapterRuntimeByBatch='ai_image_v11';}
 a.status='runtime_verified_visual_unapproved';const row={id:a.name,filename:a.output.split('/').pop(),category:'target_asset',batchId:'ai_image_v11',targetId:a.targetId,sourceType:'codex_builtin_image_gen',status:a.status,styleId:'cozy_flat_town_v5',path:a.output,runtimePath:a.runtime,format:'PNG',size:`${a.width}x${a.height}`,transparent:true,activeInFirstChapter:true,sourcePath:a.source,promptPath:a.prompt,sourceSha256:a.sourceSha256,sha256:a.sha256,generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,runtimeVerification:evidence};
 const index=m.assets.findIndex(x=>x.id===row.id);if(index<0)m.assets.push(row);else m.assets[index]=row;
 m.activeProductionByChapter[b.id].targetsById[a.targetId]='ai_image_v11';
}
const batch={id:'ai_image_v11',category:'target_surface_integration_batch',sourceType:'codex_builtin_image_gen',status:'runtime_verified_visual_unapproved',counts:{newGenerationCalls:4,activeNewGeneratedSources:4,finalPngFiles:4},generationRecordPath:`${base}/generation_record.json`,idManifestPath:`${base}/production_manifest.json`,runtimeVerification:evidence};
const index=m.assets.findIndex(x=>x.id===batch.id);if(index<0)m.assets.push(batch);else m.assets[index]=batch;
m.currentProductionId='ai_image_v11';m.activeProductionByChapter[b.id].refinedExistingTargets='ai_image_v11';
p.runtimeVerification=evidence;p.visualApproval='pending';g.runtimeVerification=evidence;for(const src of g.sources)src.status='used_runtime_verified_visual_unapproved';
write(`${base}/production_manifest.json`,p);write(`${base}/generation_record.json`,g);write('art/asset_manifest.json',m);console.log(JSON.stringify({status:'verification_recorded',targets:4,chapterTargets:32,reveals:8,playerVisualApproval:'pending'}));
