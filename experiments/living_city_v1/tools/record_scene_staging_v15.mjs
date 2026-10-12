import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/scene_staging_v15',review='art/review/ai_image_v15';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const r=read(`${review}/chapter_1/runtime_report.json`),p=read(`${review}/placement_review.json`),s=read(`${review}/after_final/staging_report.json`),changes=read(`${base}/layout_changes.json`);
assert.equal(r.status,'passed');assert.equal(r.totalUniqueCollected,32);assert.equal(r.totalReveals,8);assert.equal(r.previousVersionRestore.restoredCompleted,32);
assert.equal(p.status,'passed');assert.equal(p.sceneBlueprintSha256,hash('design/street_block_01.json'));
assert.equal(changes.sceneBlueprintSha256,p.sceneBlueprintSha256);assert.equal(s.samples.length,10);
for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(r[key].length,0);
for(const key of ['errors','warnings','failedRequests'])assert.equal(s[key].length,0);
assert.match(fs.readFileSync('temp/v15_verified_build_stdout.log','utf8'),/build Task \(web-mobile\) Finished/);
fs.copyFileSync('temp/v15_verified_build_stdout.log',`${review}/web_mobile_build.txt`);
const evidence={status:'web_mobile_verified',playerVisualApproval:'pending',wechatPhone:'not_run',sceneBlueprintSha256:p.sceneBlueprintSha256,
 reports:Object.fromEntries(['chapter_1/runtime_report.json','placement_review.json','after_final/staging_report.json'].map(name=>[name,{path:`${review}/${name}`,sha256:hash(`${review}/${name}`)}])),
 unchangedChaptersBaseline:'art/review/ai_image_v14/three_chapters_retry/runtime_report.json'};
changes.runtimeVerification=evidence;write(`${base}/layout_changes.json`,changes);
const m=read('art/asset_manifest.json'),id='scene_staging_v15',active=m.activeProductionByChapter.living_city_street_block_01;
const record={id,category:'existing_scene_layout_revision',sourceType:'existing_generated_png_placement',newGenerationCalls:0,newContent:0,pixelFilesChanged:0,
 status:'runtime_verified_visual_unapproved',layoutChangesPath:`${base}/layout_changes.json`,runtimeVerification:evidence};
const index=m.assets.findIndex(a=>a.id===id);if(index<0)m.assets.push(record);else m.assets[index]=record;
active.sceneStaging=id;
active.scenePlacementOverrides=Object.fromEntries(changes.moves.map(move=>[move.id,{center:move.after.center,size:move.after.size,textureScale:move.after.textureScale,revision:id}]));
// currentProductionId remains the last actual PNG export batch, ai_image_v13.
write('art/asset_manifest.json',m);
console.log(JSON.stringify({status:'recorded',moved:8,collected:32,reveals:8,newContent:0,pngExportBatch:m.currentProductionId}));
