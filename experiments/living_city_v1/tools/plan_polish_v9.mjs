// Mechanical cropping, aspect-preserving scaling and registration only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v9',bundle='assets/bundles/city_living_city_street_block_01';
const read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const b=read('design/street_block_01.json'),jobs=read(`${base}/generation_plan.json`).jobs,entries=[];
function crop(info,cols,rows,i){const x=i%cols,y=Math.floor(i/cols),left=Math.round(x*info.width/cols),top=Math.round(y*info.height/rows);return{left,top,width:Math.round((x+1)*info.width/cols)-left,height:Math.round((y+1)*info.height/rows)-top};}
// Locate transparent gutters; generated sheets need not divide at exact equal cells.
function sheetCrops(data,info,cols,rows){
 const seams=(axis,count)=>{const length=axis==='x'?info.width:info.height,other=axis==='x'?info.height:info.width,edges=[0];
  for(let i=1;i<count;i++){const expected=length*i/count,reach=length/count*.18,runs=[];let start=null;
   for(let k=Math.floor(expected-reach);k<=Math.ceil(expected+reach);k++){let empty=true;for(let q=0;q<other;q++){const x=axis==='x'?k:q,y=axis==='x'?q:k;if(data[(y*info.width+x)*4+3]>32){empty=false;break;}}
    if(empty&&start===null)start=k;if((!empty||k===Math.ceil(expected+reach))&&start!==null){if(k-start>=5)runs.push([start,k-1]);start=null;}}
   assert.ok(runs.length,`No transparent ${axis} gutter ${i}`);runs.sort((a,b)=>Math.abs((a[0]+a[1])/2-expected)-Math.abs((b[0]+b[1])/2-expected));edges.push(Math.round((runs[0][0]+runs[0][1])/2));}
  return [...edges,length];};
 const xs=seams('x',cols),ys=seams('y',rows);return Array.from({length:cols*rows},(_,i)=>{const x=i%cols,y=Math.floor(i/cols);return{left:xs[x],top:ys[y],width:xs[x+1]-xs[x],height:ys[y+1]-ys[y]};});
}
function cellBounds(data,info,c){const raw=Buffer.alloc(c.width*c.height*4);for(let y=0;y<c.height;y++)data.copy(raw,y*c.width*4,((y+c.top)*info.width+c.left)*4,((y+c.top)*info.width+c.left+c.width)*4);const bb=bounds(raw,{width:c.width,height:c.height},32);assert.ok(bb.left>1&&bb.top>1&&bb.left+bb.width<c.width-1&&bb.top+bb.height<c.height-1,`Generated subject crosses cell boundary ${JSON.stringify({c,bb})}`);return bb;}
for(const s of b.artSlots.filter(s=>s.generatedSourceBatch==='ai_image_v9'))entries.push({name:s.generatedSourceId,source:s.generatedSourceId,stage:'scene',sceneSlotId:s.id,width:s.size.width,height:s.size.height,align:'bottom',...(s.footY!==undefined?{footpoint:{x:s.size.width/2,y:s.size.height/2+s.center.y-s.footY}}:{}),runtime:`simple2d_scene/${s.id}.png`});
for(const j of jobs.filter(j=>j.stage==='target')){const {data,info}=await pixels(`${base}/sources/${j.id}.png`);for(let i=0;i<j.targets.length;i++){const id=j.targets[i],t=b.hiddenObjectSlots.find(t=>t.id===id),c=crop(info,2,2,i);if(j.id==='everyday_targets_v9'){c.top=i<2?0:450;c.height=i<2?450:info.height-450;}if(j.id==='craft_snack_targets_v9'){c.top=i<2?0:490;c.height=i<2?490:info.height-490;}cellBounds(data,info,c);const scale=256/Math.max(t.visualWorldSize.width,t.visualWorldSize.height);entries.push({name:`target_${id}_v9`,source:j.id,stage:'target',targetId:id,crop:c,width:Math.round(t.visualWorldSize.width*scale),height:Math.round(t.visualWorldSize.height*scale),inset:12,runtime:`targets/${id}.png`});}}
for(const j of jobs.filter(j=>j.stage==='interaction')){const {data,info}=await pixels(`${base}/sources/${j.id}.png`);const cs=[0,1].map(i=>crop(info,2,1,i)),bs=cs.map(c=>cellBounds(data,info,c));const scale=Math.min(220/Math.max(...bs.map(b=>b.width)),220/Math.max(...bs.map(b=>b.height)));for(let i=0;i<2;i++)entries.push({name:`${j.interactionId}_${i?'opened':'closed'}_v9`,source:j.id,stage:'interaction',interactionId:j.interactionId,crop:cs[i],width:256,height:256,footpoint:{x:128,y:238},figureHeight:Math.round(bs[i].height*scale),sharedStateScale:scale,runtime:`interactions/${j.interactionId}_${i?'opened':'closed'}.png`});}
for(const j of jobs.filter(j=>j.stage==='character'&&!jobs.some(k=>k.supersedes===j.id))){const {data,info}=await pixels(`${base}/sources/${j.id}.png`),cs=sheetCrops(data,info,j.columns,j.rows),bs=cs.map(c=>cellBounds(data,info,c)),scale=186/Math.max(...bs.map(b=>b.height)),names=[];
 for(let i=0;i<cs.length;i++){const name=`chicken_${j.actor}_v9_frame_${String(i+1).padStart(2,'0')}`;names.push(name);entries.push({name,source:j.id,stage:'character',actor:j.actor,frameIndex:i+1,crop:cs[i],width:384,height:256,footpoint:{x:192,y:215},figureHeight:Math.round(bs[i].height*scale),sharedSheetScale:scale,runtime:`cels/${j.actor}/${name}.png`});}
 const clip=(ids,d)=>ids.map(i=>({asset:names[i],durationSeconds:d}));const clips=j.columns===2?{idle_w:clip([0,2],.45),receive_w:clip([1,3],.4)}:{idle_w:clip([0,5],.45),walk_nw:clip([1,6],.14),walk_n:clip([2,7],.14),walk_ne:clip([3,8],.14),receive_w:clip([4,9],.4)};
 write(`${bundle}/cels/${j.actor}/manifest.json`,{schemaVersion:2,actorId:j.actor,canvasPx:{width:384,height:256},footpointPx:{x:192,y:215},paintedHeightPx:186,clips,loopingClips:Object.keys(clips).filter(k=>k!=='receive_w'),sourceBatch:'ai_image_v9',generatedSourceId:j.id,registration:'common_whole_sheet_scale_fixed_footpoint',sourceCellGrid:{columns:j.columns,rows:j.rows,width:info.width,height:info.height}});
 const n=b.npcPlans.find(n=>n.id===j.actor);n.generatedSourceId=j.id;
}
assert.equal(entries.length,65);assert.equal(new Set(entries.map(e=>e.name)).size,65);
write(`${base}/import_plan.json`,{batchId:'ai_image_v9',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets:entries});
write('design/street_block_01.json',b);
const g=read(`${base}/generation_record.json`);for(const s of g.sources){const replacement=jobs.find(j=>j.supersedes===s.id);if(replacement){s.status='superseded_animation_candidate_unapproved';s.supersededBy=replacement.id;}}
write(`${base}/generation_record.json`,g);console.log(JSON.stringify({assets:entries.length,scenes:5,targets:8,interactionFrames:4,characterFrames:48}));
