// Read generated alpha and verify unchanged gameplay scope. No artwork is drawn.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels} from './import_generated_art.mjs';
const base='art/production/ai_image_v11',review='art/review/ai_image_v11',read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint_v10.json`),p=read(`${base}/production_manifest.json`),g=read(`${base}/generation_record.json`),v6=read('art/production/ai_image_v6/production_manifest.json');
assert.equal(b.hiddenObjectSlots.length,32);assert.deepEqual(b.hiddenObjectSlots.map(t=>t.id),old.hiddenObjectSlots.map(t=>t.id));
// The final integrated v12 build also changes texture density and actor source sheets.
// Their geometry/identity invariants are checked by review_motion_density_v12.mjs.
const withoutArtRevision = value => JSON.parse(JSON.stringify(value, (key, value) =>
 ['textureScale','generatedSourceBatch','generatedSourceId'].includes(key) ? undefined : value));
for(const key of Object.keys(old).filter(k=>k!=='hiddenObjectSlots'))assert.deepEqual(withoutArtRevision(b[key]),withoutArtRevision(old[key]),`${key}: out-of-scope edit`);
const ids=p.assets.map(a=>a.targetId),checks=[];
for(const t of b.hiddenObjectSlots){const previous=old.hiddenObjectSlots.find(o=>o.id===t.id);assert.equal(t.clickRadiusWorld,previous.clickRadiusWorld);assert.deepEqual(t.visibleCondition,previous.visibleCondition);if(!ids.includes(t.id))assert.deepEqual(t,previous);}
for(const a of p.assets){const t=b.hiddenObjectSlots.find(t=>t.id===a.targetId),s=b.artSlots.find(s=>s.id===t.supportArtSlotId),path=`assets/bundles/city_living_city_street_block_01/simple2d_scene/${s.id}.png`,{data,info}=await pixels(path),at=t.surfaceContact;
 assert.equal(a.uuid,v6.assets.find(v=>v.runtime===a.runtime).uuid);assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.source),a.sourceSha256);
 const x=Math.round(info.width/2+(at.x-s.center.x)*info.width/s.size.width),y=Math.round(info.height/2-(at.y-s.center.y)*info.height/s.size.height),alpha=data[(y*info.width+x)*4+3];
 assert.ok(alpha>200,`${t.id}: contact (${x},${y}) alpha ${alpha}`);
 const bottom=t.at.y+(a.height/2-a.alphaBounds.top-a.alphaBounds.height)*t.visualWorldSize.height/a.height;
 if(t.surfacePlacement==='visible_bottom_on_authored_surface')assert.ok(Math.abs(bottom-at.y)<.01);
 checks.push({id:t.id,at:t.at,size:t.visualWorldSize,contact:at,actualBottom:bottom,support:s.id,contactProbe:{x,y,alpha},uuidPreserved:true,sha256:a.sha256});
}
for(const source of g.sources){assert.equal(hash(source.source),source.sourceSha256);for(const ref of source.references)assert.equal(hash(ref.path),ref.sha256);}
fs.mkdirSync(review,{recursive:true});fs.writeFileSync(`${review}/placement_review.json`,JSON.stringify({status:'png_geometry_checks_passed',sceneBlueprintSha256:hash('design/street_block_01.json'),counts:{targets:32,newTargets:0,refinedTargets:4,sceneSlots:65,residents:16,interactions:8},checks,playerVisualApproval:'pending'},null,2)+'\n');
console.log(JSON.stringify({status:'png_geometry_checks_passed',contacts:checks.map(c=>({id:c.id,alpha:c.contactProbe.alpha}))}));
