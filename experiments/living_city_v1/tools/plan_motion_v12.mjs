// Mechanical cropping and registration of actual generated animation sheets.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v12',bundle='assets/bundles/city_living_city_street_block_01',read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const plan=read(`${base}/generation_plan.json`);for(const file of fs.readdirSync(base).filter(f=>f.endsWith('_fix.json'))){const fix=read(`${base}/${file}`);if(!plan.jobs.some(j=>j.id===fix.id))plan.jobs.push(fix);}write(`${base}/generation_plan.json`,plan);
const jobs=plan.jobs.filter(j=>!plan.jobs.some(k=>k.supersedes===j.id)),entries=[],b=read('design/street_block_01.json'),audit=[];
function sheetCrops(data,info,cols,rows){
 const seams=(axis,count,from=0,to=axis==='x'?info.height:info.width)=>{const length=axis==='x'?info.width:info.height,edges=[0];
  for(let i=1;i<count;i++){const expected=length*i/count,reach=length/count*.25,runs=[];let start=null;
   for(let k=Math.floor(expected-reach);k<=Math.ceil(expected+reach);k++){let empty=true;for(let q=from;q<to;q++){const x=axis==='x'?k:q,y=axis==='x'?q:k;if(data[(y*info.width+x)*4+3]>32){empty=false;break;}}
    if(empty&&start===null)start=k;if((!empty||k===Math.ceil(expected+reach))&&start!==null){if(k-start>=2)runs.push([start,k-1]);start=null;}}
   assert.ok(runs.length,`No transparent ${axis} gutter ${i}`);runs.sort((a,b)=>Math.abs((a[0]+a[1])/2-expected)-Math.abs((b[0]+b[1])/2-expected));edges.push(Math.round((runs[0][0]+runs[0][1])/2));}
  return [...edges,length];};
 const xs=seams('x',cols),ys=Array.from({length:cols},(_,x)=>seams('y',rows,xs[x],xs[x+1]));return Array.from({length:cols*rows},(_,i)=>{const x=i%cols,y=Math.floor(i/cols);return{left:xs[x],top:ys[x][y],width:xs[x+1]-xs[x],height:ys[x][y+1]-ys[x][y]};});
}
function cellBounds(data,info,c){const raw=Buffer.alloc(c.width*c.height*4);for(let y=0;y<c.height;y++)data.copy(raw,y*c.width*4,((y+c.top)*info.width+c.left)*4,((y+c.top)*info.width+c.left+c.width)*4);const bb=bounds(raw,{width:c.width,height:c.height},32);assert.ok(bb.left>0&&bb.top>0&&bb.left+bb.width<c.width&&bb.top+bb.height<c.height,`Clipped generated cell ${JSON.stringify({c,bb})}`);return bb;}
for(const j of jobs){
 console.log(`Inspecting ${j.actor}`);
 const {data,info}=await pixels(`${base}/sources/${j.id}.png`),cs=sheetCrops(data,info,4,j.rows),bs=cs.map(c=>cellBounds(data,info,c)),scale=186/Math.max(...bs.map(bb=>bb.height)),names=[];
 for(let i=0;i<cs.length;i++){const name=`chicken_${j.actor}_v12_frame_${String(i+1).padStart(2,'0')}`;names.push(name);entries.push({name,source:j.id,stage:'character',actor:j.actor,frameIndex:i+1,crop:cs[i],width:384,height:256,footpoint:{x:192,y:215},figureHeight:Math.round(bs[i].height*scale),sharedSheetScale:scale,runtime:`cels/${j.actor}/${name}.png`});}
 const clip=(ids,d)=>ids.map(i=>({asset:names[i],durationSeconds:d}));
 const idle=[[0,1.4],[1,.07],[2,.1],[1,.07],[0,.65],[3,.35],[0,.35]].map(([i,d])=>({asset:names[i],durationSeconds:d}));
 const clips={idle_w:idle};if(j.moving)clips.walk_nw=clip([4,5,6,7],.1);if(j.vertical){clips.walk_n=clip([8,9,10,11],.1);clips.walk_ne=clip([12,13,14,15],.1);}
 const job=(j.rows-1)*4;clips.receive_w=clip([job,job+1,job+2,job+3],.18);
 write(`${bundle}/cels/${j.actor}/manifest.json`,{schemaVersion:2,actorId:j.actor,canvasPx:{width:384,height:256},footpointPx:{x:192,y:215},paintedHeightPx:186,clips,loopingClips:Object.keys(clips).filter(k=>k!=='receive_w'),staggerIdlePhase:true,sourceBatch:'ai_image_v12',generatedSourceId:j.id,registration:'common_whole_sheet_scale_fixed_footpoint',sourceCellGrid:{columns:4,rows:j.rows,width:info.width,height:info.height}});
 const n=b.npcPlans.find(n=>n.id===j.actor);n.generatedSourceBatch='ai_image_v12';n.generatedSourceId=j.id;
 audit.push({actor:j.actor,source:j.id,frames:cs.length,scale,sourceCellBounds:bs,sourceCrops:cs,walkingFrameSeconds:j.moving?.1:null,jobFrameSeconds:.18});
}
assert.equal(jobs.length,16);assert.equal(entries.length,220);
const combined=read(`${base}/import_plan.json`);combined.assets=[...combined.assets.filter(a=>a.stage!=='character'),...entries];write(`${base}/import_plan.json`,combined);write(`${base}/motion_registration.json`,{residents:16,frames:220,audit});write('design/street_block_01.json',b);
const g=read(`${base}/generation_record.json`);fs.mkdirSync(`${base}/references`,{recursive:true});
for(const s of g.sources){const j=plan.jobs.find(j=>j.id===s.id);const replacement=plan.jobs.find(k=>k.supersedes===s.id);s.status=replacement?(s.id.includes('flower_buyer')?'superseded_clipped_feet_candidate':'superseded_missing_glasses_candidate'):'generated_visual_review_pending';if(replacement)s.supersededBy=replacement.id;
 s.references=j.references.map((file,i)=>{const bytes=fs.readFileSync(file),p=`${base}/references/${j.id}_${i+1}.png`;fs.writeFileSync(p,bytes);return{original:file,path:p,sha256:createHash('sha256').update(bytes).digest('hex')};});}
write(`${base}/generation_record.json`,g);console.log(JSON.stringify({residents:16,newAnimationFrames:220,additionalResidents:0}));
