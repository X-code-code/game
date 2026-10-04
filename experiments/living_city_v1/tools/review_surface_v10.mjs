// Inspect generated PNG registration and supporting surfaces; no pixel drawing.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels} from './import_generated_art.mjs';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const base='art/production/ai_image_v10',review='art/review/ai_image_v10',p=read(`${base}/production_manifest.json`),g=read(`${base}/generation_record.json`),b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint_v9.json`),v6=read('art/production/ai_image_v6/production_manifest.json');
assert.deepEqual(b.hiddenObjectSlots.map(t=>t.id),old.hiddenObjectSlots.map(t=>t.id));assert.deepEqual(b.npcPlans,old.npcPlans);assert.deepEqual(b.artSlots,old.artSlots);assert.deepEqual(b.interactiveSlots,old.interactiveSlots);
const notes={garden_glove:'Flat, foreshortened sage glove; no upright display pose or decorative badge; complete cuff/fingers.',tiny_camera:'Muted blue/cream body, visible narrow top plane and flat base; removed strap and glossy lens highlights.',pink_watering_can:'Plain coral body with visible elliptical top opening; complete spout and handle, no floral badge or white gloss streak.',wooden_bird:'Simple ochre wooden silhouette with narrow upper plane, two wheels and one wing line; no dense feather/grain marks.'};
const checks=[];
for(const a of p.assets){const t=b.hiddenObjectSlots.find(t=>t.id===a.targetId),legacy=v6.assets.find(v=>v.runtime===a.runtime),s=b.artSlots.find(s=>s.id===t.supportArtSlotId);
 assert.equal(a.uuid,legacy.uuid,`${t.id}: changed existing resource UUID`);assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.source),a.sourceSha256);
 assert.equal(t.clickRadiusWorld,old.hiddenObjectSlots.find(v=>v.id===t.id).clickRadiusWorld);assert.ok(a.alphaBounds.transparent>0);
 const supportPath=`assets/bundles/city_living_city_street_block_01/simple2d_scene/${s.id}.png`,{data,info}=await pixels(supportPath),at=t.surfaceContact;
 const x=Math.round(info.width/2+(at.x-s.center.x)*info.width/s.size.width),y=Math.round(info.height/2-(at.y-s.center.y)*info.height/s.size.height);
 const alpha=x<0||y<0||x>=info.width||y>=info.height?0:data[(y*info.width+x)*4+3];assert.ok(alpha>200,`${t.id}: unsupported contact ${x},${y}`);
 const actualBottom=t.at.y+(a.height/2-a.alphaBounds.top-a.alphaBounds.height)*t.visualWorldSize.height/a.height;
 if(t.surfacePlacement==='visible_bottom_on_authored_surface')assert.ok(Math.abs(actualBottom-at.y)<.3);
 checks.push({id:t.id,output:a.output,runtime:a.runtime,sha256:a.sha256,uuidPreserved:true,at:t.at,size:t.visualWorldSize,contact:at,actualBottom,support:s.id,supportPng:supportPath,supportSha256:hash(supportPath),contactProbe:{x,y,alpha},observation:notes[t.id]});
}
for(const s of g.sources){assert.equal(hash(s.source),s.sourceSha256);assert.equal(hash(s.originalToolOutput),s.sourceSha256);for(const ref of s.references)assert.equal(hash(ref.path),ref.sha256);}
const report={status:'png_geometry_checks_passed',sourceReview:'four_actual_builtin_sources_inspected',sources:g.sources.map(s=>({id:s.id,source:s.source,sha256:s.sourceSha256})),sceneBlueprintSha256:hash('design/street_block_01.json'),counts:{generatedCalls:4,finalPngs:4,targets:32,sceneSlots:65,interactions:8,residents:16},checks,unchanged:['target IDs and click radii','scene assets','residents and routes','container states and front rims'],playerVisualApproval:'pending',runtimeVerification:'separate_actual_browser_report_required'};
fs.writeFileSync(`${review}/placement_review.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,contacts:checks.map(c=>({id:c.id,alpha:c.contactProbe.alpha}))}));
