import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v13',review='art/review/ai_image_v13';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const paths={runtime:`${review}/chapter_1/runtime_report.json`,surfaces:`${review}/details/surface_report.json`,placement:`${review}/placement_review.json`,integrity:`${review}/asset_integrity_report.json`,visual:`${review}/visual_review.json`};
const r=read(paths.runtime),s=read(paths.surfaces),pr=read(paths.placement);
assert.equal(r.status,'passed');assert.equal(r.chapters.length,1);assert.equal(r.totalUniqueCollected,32);assert.equal(r.totalReveals,8);assert.equal(r.previousVersionRestore.restoredCompleted,32);
assert.equal(s.status,'passed');assert.equal(s.samples.length,16);assert.equal(s.collected.length,4);assert.equal(s.restoredAfterReload,true);
assert.equal(pr.status,'passed');assert.equal(read(paths.integrity).status,'passed');assert.equal(read(paths.visual).status,'agent_visual_review_completed');
for(const report of [s,pr])assert.equal(report.sceneBlueprintSha256,hash('design/street_block_01.json'));
for(const report of [s,r])for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(report[key].length,0);
const buildLog=`${review}/web_mobile_build.txt`;assert.match(fs.readFileSync('temp/v13_build_stdout.log','utf8'),/build Task \(web-mobile\) Finished/);fs.copyFileSync('temp/v13_build_stdout.log',buildLog);
const evidence={status:'web_mobile_verified',playerVisualApproval:'pending',wechatPhone:'not_run',sceneBlueprintSha256:s.sceneBlueprintSha256,reports:Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,{path,sha256:hash(path)}])),build:{path:buildLog,sha256:hash(buildLog)},unchangedChaptersBaseline:'art/review/ai_image_v12/three_chapters/runtime_report.json'};
const m=read('art/asset_manifest.json'),b=read('design/street_block_01.json'),p=read(`${base}/production_manifest.json`),g=read(`${base}/generation_record.json`),changes=read(`${base}/layout_changes.json`),active=m.activeProductionByChapter[b.id];
const upsert=row=>{const i=m.assets.findIndex(a=>a.id===row.id);if(i<0)m.assets.push(row);else m.assets[i]=row;};
assert.equal(p.assets.length,6);assert.equal(g.newGenerationCalls,0);
for(const a of p.assets){
 assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.source),a.sourceSha256);
 for(const old of m.assets)if(old.runtimePath===a.runtime&&old.id!==a.name){old.activeInFirstChapter=false;old.supersededFirstChapterRuntimeByBatch='ai_image_v13';}
 a.status='runtime_verified_visual_unapproved';
 upsert({id:a.name,filename:a.output.split('/').pop(),category:'scene_asset',batchId:'ai_image_v13',sourceType:'codex_builtin_image_gen',status:a.status,styleId:p.styleId,path:a.output,runtimePath:a.runtime,format:'PNG',size:`${a.width}x${a.height}`,transparent:true,activeInFirstChapter:true,sourcePath:a.source,promptPath:a.prompt,sourceSha256:a.sourceSha256,sha256:a.sha256,sceneSlotId:a.sceneSlotId,textureScale:a.textureScale,worldSize:a.worldSize,reusedSourceBatch:'ai_image_v8',generationRecordPath:'art/production/ai_image_v8/generation_record.json',idManifestPath:`${base}/production_manifest.json`,runtimeVerification:evidence});
 active.sceneTextureExportsBySlotId[a.sceneSlotId]='ai_image_v13';
}
upsert({id:'ai_image_v13',category:'existing_scene_staging_batch',sourceType:'codex_builtin_image_gen',status:'runtime_verified_visual_unapproved',counts:{newGenerationCalls:0,newContent:0,movedExistingPlacements:changes.translated.length,resampledExistingGrounds:6},layoutChangesPath:`${base}/layout_changes.json`,idManifestPath:`${base}/production_manifest.json`,runtimeVerification:evidence});
active.sceneStaging='ai_image_v13';m.currentProductionId='ai_image_v13';p.runtimeVerification=evidence;p.visualApproval='pending';g.runtimeVerification=evidence;
write(`${base}/production_manifest.json`,p);write(`${base}/generation_record.json`,g);write('art/asset_manifest.json',m);
console.log(JSON.stringify({status:'recorded',moved:10,existingGrounds:6,newContent:0,chapterCollected:32,reveals:8}));
