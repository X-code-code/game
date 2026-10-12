import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v17', review='art/review/ai_image_v17';
const read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tray=read(`${review}/tray_verified/tray_report.json`),runtime=read(`${review}/three_chapters/runtime_report.json`);
assert.equal(tray.status,'passed');assert.equal(tray.samples.length,3);
assert.equal(tray.restored.progress,'已找到 1/12');assert.equal(tray.restored.checked,true);
assert.equal(runtime.status,'passed');assert.equal(runtime.totalUniqueCollected,36);assert.equal(runtime.totalReveals,10);
for(const k of ['runtimeErrors','runtimeWarnings','failedRequests'])assert.equal(runtime[k].length,0);
for(const k of ['errors','warnings','failedRequests'])assert.equal(tray[k].length,0);
assert.match(fs.readFileSync('temp/v17_final_build_stdout.log','utf8'),/build Task \(web-mobile\) Finished/);
fs.copyFileSync('temp/v17_final_build_stdout.log',`${review}/web_mobile_build.txt`);
const evidence={status:'web_mobile_verified',playerVisualApproval:'pending',wechatPhone:'not_run',
 reports:Object.fromEntries(['tray_verified/tray_report.json','three_chapters/runtime_report.json'].map(p=>[p,{path:`${review}/${p}`,sha256:hash(`${review}/${p}`)}]))};
const production=read(`${base}/production_manifest.json`);
production.runtimeVerification=evidence;write(`${base}/production_manifest.json`,production);
const manifest=read('art/asset_manifest.json');
for(const record of production.assets) {
 const city=record.bundle.split('/').at(-1).replace(/^city_/,'');
 const asset={id:`${record.name}_${city}`,category:'generated_ui',sourceType:'codex_builtin_image_gen',
  productionBatch:'ai_image_v17',sourcePath:record.source,promptPath:record.prompt,
  sourceSha256:record.sourceSha256,sourceSize:record.sourceSize,path:record.output,runtimePath:record.runtime,
  size:{width:record.width,height:record.height},sha256:record.sha256,uuid:record.uuid,
  status:'runtime_verified_visual_unapproved',runtimeVerification:evidence};
 const i=manifest.assets.findIndex(a=>a.id===asset.id);if(i<0)manifest.assets.push(asset);else manifest.assets[i]=asset;
 manifest.activeProductionByChapter[city].targetTray='ai_image_v17';
}
manifest.currentProductionId='ai_image_v17';write('art/asset_manifest.json',manifest);
console.log('Recorded two generated UI assets, six bundle registrations and verified journal behavior.');
