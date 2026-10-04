// Read-only provenance, scene registration and unchanged-content review.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v12',out='art/review/ai_image_v12',read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint.json`),p=read(`${base}/production_manifest.json`),density=read(`${base}/scene_density_plan.json`),motion=read(`${base}/motion_registration.json`);
assert.equal(b.hiddenObjectSlots.length,32);assert.deepEqual(b.hiddenObjectSlots,old.hiddenObjectSlots);assert.deepEqual(b.interactiveSlots,old.interactiveSlots);
for(const key of Object.keys(old).filter(k=>!['artSlots','npcPlans'].includes(k)))assert.deepEqual(b[key],old[key],key);
assert.equal(b.artSlots.length,old.artSlots.length);assert.equal(b.npcPlans.length,old.npcPlans.length);
for(const s of b.artSlots){const {textureScale,...rest}=s;assert.deepEqual(rest,old.artSlots.find(v=>v.id===s.id));}
for(const n of b.npcPlans){const strip=x=>{const {generatedSourceBatch,generatedSourceId,...rest}=x;return rest;};assert.deepEqual(strip(n),strip(old.npcPlans.find(v=>v.id===n.id)));}
const sceneChecks=[];
for(const a of p.assets){assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.source),a.sourceSha256);
 if(a.stage!=='scene_hd')continue;const prior=density.slots.find(s=>s.id===a.sceneSlotId),original=prior.previous,k=a.textureScale;
 assert.equal(a.uuid,original.uuid);assert.equal(a.sourceSha256,original.sourceSha256);assert.ok(prior.nativeFactor>=k);
 const box=a.alphaBounds,bb=original.alphaBounds,edgeErrors=['left','top','width','height'].map(key=>Math.abs(box[key]/k-bb[key]));
 assert.ok(Math.max(...edgeErrors)<=1.5,`${a.sceneSlotId}: high-density export changes world registration ${edgeErrors}`);
 sceneChecks.push({id:a.sceneSlotId,textureScale:k,worldSize:a.worldSize,textureSize:{width:a.width,height:a.height},originalSourcePreserved:true,uuidPreserved:true,maximumWorldPixelEdgeShift:Math.max(...edgeErrors)});
}
assert.equal(sceneChecks.length,64);assert.equal(motion.residents,16);assert.equal(p.assets.filter(a=>a.stage==='character').length,220);
const actorChecks=[];
for(const n of b.npcPlans){const m=read(`assets/bundles/city_living_city_street_block_01/cels/${n.id}/manifest.json`),a=motion.audit.find(a=>a.actor===n.id);
 assert.equal(m.sourceBatch,'ai_image_v12');assert.equal(m.staggerIdlePhase,true);
 for(const [clip,frames] of Object.entries(m.clips)){assert.equal(new Set(frames.map(f=>f.asset)).size,4);if(clip.startsWith('walk_'))assert.ok(frames.every(f=>f.durationSeconds===.1));}
 assert.equal(new Set(p.assets.filter(v=>v.actor===n.id).map(v=>v.sharedSheetScale)).size,1);
 actorChecks.push({id:n.id,source:m.generatedSourceId,frames:a.frames,canvas:m.canvasPx,footpoint:m.footpointPx,walkingDrawingRate:a.walkingFrameSeconds?10:null,staggeredBlink:true});
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/registration_report.json`,JSON.stringify({status:'passed',sceneBlueprintSha256:hash('design/street_block_01.json'),counts:{additionalTargets:0,additionalResidents:0,additionalSceneSlots:0,targets:32,residents:16,sceneSlots:65,higherDensitySceneSlots:64,newActorFrames:220},sceneChecks,actorChecks,playerVisualApproval:'pending'},null,2)+'\n');console.log(JSON.stringify({status:'passed',higherDensityScenes:sceneChecks.length,renewedResidents:actorChecks.length}));
