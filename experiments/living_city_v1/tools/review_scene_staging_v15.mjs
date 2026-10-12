import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels} from './import_generated_art.mjs';
const base='art/production/scene_staging_v15',review='art/review/ai_image_v15';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint_v14.json`),changes=read(`${base}/layout_changes.json`);
assert.equal(changes.sceneBlueprintSha256,hash('design/street_block_01.json'));
const moved=new Map(changes.moves.map(m=>[m.id,m]));
for(const key of Object.keys(old).filter(k=>!['artSlots','hiddenObjectSlots','interactiveSlots','sceneDiscoveries','physicalFootprints','stagingRevision'].includes(k)))assert.deepEqual(b[key],old[key],`${key} changed outside placement scope`);
assert.deepEqual([b.artSlots.length,b.hiddenObjectSlots.length,b.npcPlans.length,b.interactiveSlots.length],[65,32,16,8]);
for(const slot of b.artSlots){const before=old.artSlots.find(s=>s.id===slot.id),move=moved.get(slot.id);assert.ok(before);
 const expected=structuredClone(before);
 if(move){expected.center.x+=move.delta.x;expected.center.y+=move.delta.y;if(expected.footY!==undefined)expected.footY+=move.delta.y;
  if(slot.id==='lc5_street_banner_front'){expected.size={width:285,height:45};expected.textureScale=4;assert.ok(Math.abs(slot.size.width/slot.size.height-before.size.width/before.size.height)<1e-8);}}
 assert.deepEqual(slot,expected,`${slot.id} has an unexpected edit`);
 if(moved.has(slot.id)){const {info}=await pixels(`assets/bundles/city_${b.id}/simple2d_scene/${slot.id}.png`);
  assert.deepEqual([info.width,info.height],[slot.size.width*slot.textureScale,slot.size.height*slot.textureScale],`${slot.id} does not match runtime texture registration`);}
}
const supports=[];
for(const key of ['hiddenObjectSlots','interactiveSlots','sceneDiscoveries'])for(const item of b[key]){
 const before=old[key].find(t=>t.id===item.id),move=moved.get(item.supportArtSlotId),expected=structuredClone(before);
 if(move){expected.at.x+=move.delta.x;expected.at.y+=move.delta.y;if(expected.depthY!==undefined)expected.depthY+=move.delta.y;
  if(expected.surfaceContact){expected.surfaceContact.x+=move.delta.x;expected.surfaceContact.y+=move.delta.y;}}
 if(key==='hiddenObjectSlots'&&changes.clues[item.id])expected.clue=expected.semanticContext=changes.clues[item.id];
 assert.deepEqual(item,expected,`${item.id} lost registration, click area or saved identity`);
 if(move&&key==='hiddenObjectSlots'){
  const slot=b.artSlots.find(s=>s.id===item.supportArtSlotId),file=`assets/bundles/city_${b.id}/simple2d_scene/${slot.id}.png`;
  const {data,info}=await pixels(file),point=item.surfaceContact??item.at;
  const x=Math.round(info.width/2+(point.x-slot.center.x)*info.width/slot.size.width),y=Math.round(info.height/2-(point.y-slot.center.y)*info.height/slot.size.height);
  const alpha=data[(y*info.width+x)*4+3];assert.ok(alpha>200,`${item.id} has no opaque support`);
  supports.push({id:item.id,at:item.at,alpha,clickRadius:item.clickRadiusWorld});
 }
}
for(const fp of b.physicalFootprints){const before=old.physicalFootprints.find(p=>p.id===fp.id),move=moved.get(fp.artSlotId),expected=structuredClone(before);
 if(move)expected.polygon=expected.polygon.map(([x,y])=>[x+move.delta.x,y+move.delta.y]);assert.deepEqual(fp,expected);}
assert.deepEqual(read('assets/bundles/city_living_city_street_block_01/street_block_01.json'),b);
fs.mkdirSync(review,{recursive:true});
fs.writeFileSync(`${review}/placement_review.json`,JSON.stringify({status:'passed',sceneBlueprintSha256:hash('design/street_block_01.json'),moved:8,additionalContent:0,unchangedResidentRoutes:16,preservedTargets:32,preservedInteractions:8,translatedSupports:supports,visualApproval:'pending'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',moved:8,supports:supports.length,routesUnchanged:16}));
