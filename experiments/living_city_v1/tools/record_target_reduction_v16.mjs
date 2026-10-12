import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/target_reduction_v16',review='art/review/ai_image_v16';
const read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const r=read(`${review}/three_chapters/runtime_report.json`),change=read(`${base}/change_record.json`);
assert.equal(r.status,'passed');assert.equal(r.totalUniqueCollected,36);assert.equal(r.totalReveals,10);
assert.equal(r.previousVersionRestore.restoredCompleted,12);assert.equal(r.reducedPartialRestore.retainedFound,3);
assert.deepEqual(r.chapters.map(c=>c.targets),[12,12,12]);assert.deepEqual(r.chapters.map(c=>c.revealCount),[4,3,3]);
for(const key of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(r[key].length,0);
assert.equal(hash('design/street_block_01.json'),change.sceneBlueprintSha256);
assert.match(fs.readFileSync('temp/v16_build_stdout.log','utf8'),/build Task \(web-mobile\) Finished/);
fs.copyFileSync('temp/v16_build_stdout.log',`${review}/web_mobile_build.txt`);
const evidence={status:'web_mobile_verified',playerApproval:'pending',wechatPhone:'not_run',report:`${review}/three_chapters/runtime_report.json`,sha256:hash(`${review}/three_chapters/runtime_report.json`)};
change.verification=evidence;write(`${base}/change_record.json`,change);
const m=read('art/asset_manifest.json'),a=m.activeProductionByChapter.living_city_street_block_01;
for(const [key,ids]of [['targetsById',change.retainedTargetIds],['interactionsById',change.retainedInteractionIds]])a[key]=Object.fromEntries(Object.entries(a[key]).filter(([id])=>ids.includes(id)));
for(const asset of m.assets){const p=asset.runtimePath??'';
 if(p.startsWith('assets/bundles/city_living_city_street_block_01/')&&(change.removedTargetIds.some(id=>p.endsWith(`/targets/${id}.png`))||change.retiredInteractionIds.some(id=>p.endsWith(`/interactions/${id}_closed.png`)||p.endsWith(`/interactions/${id}_opened.png`)))){
  asset.activeInFirstChapter=false;asset.retiredFromFirstChapterByRevision='target_reduction_v16';
 }}
a.targetSelection='target_reduction_v16';
const row={id:'target_reduction_v16',category:'existing_target_selection_revision',sourceType:'configuration_only',targets:12,reveals:4,retiredTargets:20,retiredReveals:4,newGenerationCalls:0,changeRecordPath:`${base}/change_record.json`,runtimeVerification:evidence};
const index=m.assets.findIndex(x=>x.id===row.id);if(index<0)m.assets.push(row);else m.assets[index]=row;
write('art/asset_manifest.json',m);console.log('Recorded twelve-target first chapter; historical generated resources retained.');
