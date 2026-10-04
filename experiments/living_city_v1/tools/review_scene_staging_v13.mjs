import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels} from './import_generated_art.mjs';
const base='art/production/ai_image_v13',review='art/review/ai_image_v13';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint_v12.json`),changes=read(`${base}/layout_changes.json`),p=read(`${base}/production_manifest.json`);
const moved=new Map(changes.translated.map(c=>[c.id,c])),groundIds=new Set(changes.groundChanges.map(c=>c.id));
assert.equal(b.artSlots.length,65);assert.equal(b.hiddenObjectSlots.length,32);assert.equal(b.npcPlans.length,16);assert.equal(b.interactiveSlots.length,8);
for(const key of Object.keys(old).filter(k=>!['artSlots','hiddenObjectSlots','interactiveSlots','sceneDiscoveries','physicalFootprints'].includes(k)))assert.deepEqual(b[key],old[key],`${key}: changed outside staging scope`);
for(const s of b.artSlots){const prev=old.artSlots.find(x=>x.id===s.id);assert.ok(prev,s.id);const c=moved.get(s.id);
 if(!c&&!groundIds.has(s.id))assert.deepEqual(s,prev);
 if(c){assert.deepEqual(s.size,prev.size);assert.equal(s.center.x,prev.center.x+c.delta.x);assert.equal(s.center.y,prev.center.y+c.delta.y);}
 assert.equal(s.textureScale,prev.textureScale);assert.equal(s.generatedSourceId,prev.generatedSourceId);
}
const targetChecks=[];
for(const key of ['hiddenObjectSlots','interactiveSlots','sceneDiscoveries'])for(const t of b[key]){
 const prev=old[key].find(x=>x.id===t.id),c=moved.get(t.supportArtSlotId);assert.ok(prev,t.id);
 if(!c){assert.deepEqual(t,prev);continue;}
 const expected=structuredClone(prev);expected.at.x+=c.delta.x;expected.at.y+=c.delta.y;
 if(expected.depthY!==undefined)expected.depthY+=c.delta.y;
 if(expected.surfaceContact){expected.surfaceContact.x+=c.delta.x;expected.surfaceContact.y+=c.delta.y;}
 if(t.supportArtSlotId==='lc9_craft_table'&&key==='hiddenObjectSlots'){expected.clue=t.clue;expected.semanticContext=t.semanticContext;assert.ok(t.clue.startsWith('花店南边'));}
 assert.deepEqual(t,expected,`${t.id}: attachment lost its original registration or interaction properties`);
 if(key==='hiddenObjectSlots'){
  const s=b.artSlots.find(s=>s.id===t.supportArtSlotId),runtime=`assets/bundles/city_${b.id}/simple2d_scene/${s.id}.png`,{data,info}=await pixels(runtime),at=t.surfaceContact??t.at;
  const x=Math.round(info.width/2+(at.x-s.center.x)*info.width/s.size.width),y=Math.round(info.height/2-(at.y-s.center.y)*info.height/s.size.height),alpha=data[(y*info.width+x)*4+3];
  assert.ok(alpha>200,`${t.id}: no opaque support at authored contact`);
  targetChecks.push({id:t.id,support:s.id,at:t.at,contact:at,alpha,preservedClickRadius:t.clickRadiusWorld});
 }
}
for(const fp of b.physicalFootprints){const prev=old.physicalFootprints.find(x=>x.id===fp.id),c=moved.get(fp.artSlotId),expected=structuredClone(prev);if(c)expected.polygon=expected.polygon.map(([x,y])=>[x+c.delta.x,y+c.delta.y]);assert.deepEqual(fp,expected);}
for(const a of p.assets){assert.equal(hash(a.source),a.sourceSha256);assert.equal(hash(a.output),a.sha256);assert.equal(hash(a.runtime),a.sha256);const s=b.artSlots.find(s=>s.id===a.sceneSlotId);assert.deepEqual([a.width,a.height],[s.size.width*2,s.size.height*2]);}
const report={status:'passed',sceneBlueprintSha256:hash('design/street_block_01.json'),newContent:0,movedExistingPlacements:moved.size,resampledExistingGrounds:p.assets.length,unchangedResidentRoutes:16,preservedTargets:32,targetChecks,playerVisualApproval:'pending'};
fs.writeFileSync(`${review}/placement_review.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
