// Mechanical registration plan for built-in generated PNGs; no painted pixels.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v8',bundle='assets/bundles/city_living_city_street_block_01';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const blueprint=read('design/street_block_01.json'),jobs=read(`${base}/generation_plan.json`).jobs;
const entries=[];
function gridCrop(info,columns,rows,index){
 const col=index%columns,row=Math.floor(index/columns);
 const left=Math.round(col*info.width/columns),top=Math.round(row*info.height/rows);
 return {left,top,width:Math.round((col+1)*info.width/columns)-left,height:Math.round((row+1)*info.height/rows)-top};
}
function cellPixels(data,info,crop){
 const cell=Buffer.alloc(crop.width*crop.height*4);
 for(let y=0;y<crop.height;y++)data.copy(cell,y*crop.width*4,((y+crop.top)*info.width+crop.left)*4,((y+crop.top)*info.width+crop.left+crop.width)*4);
 return cell;
}
for(const slot of blueprint.artSlots.filter(s=>s.id.startsWith('lc8_'))){
 entries.push({name:slot.id.substring(4)+'_v8',source:slot.generatedSourceId,stage:'scene',sceneSlotId:slot.id,
  width:slot.size.width,height:slot.size.height,align:slot.layer==='ground'?'center':'bottom',
  ...(slot.layer==='ground'?{resizeFit:'fill',registration:'flat_ground_alpha_bbox_resampled_to_authored_footprint_no_repainting'}:{footpoint:{x:slot.size.width/2,y:slot.size.height/2+slot.center.y-slot.footY}}),
  runtime:`simple2d_scene/${slot.id}.png`});
}
for(const job of jobs.filter(j=>j.stage==='targets')){
 const {data,info}=await pixels(`${base}/sources/${job.id}.png`);
 for(let index=0;index<job.targets.length;index++){
  const targetId=job.targets[index],target=blueprint.hiddenObjectSlots.find(t=>t.id===targetId);
  assert.ok(target,`${targetId}: preserve existing identity`);
  const crop=gridCrop(info,2,2,index);
  // Actual keepsake artwork straddles the requested 512px row split. The empty
  // gutter at 580px cleanly separates all four complete generated objects.
  if(job.id==='targets_keepsakes_v8'){crop.top=index<2?0:580;crop.height=index<2?580:info.height-580;}
  const b=bounds(cellPixels(data,info,crop),{width:crop.width,height:crop.height,channels:4},32);
  assert.ok(b.left>2&&b.top>2&&b.left+b.width<crop.width-2&&b.top+b.height<crop.height-2,`${targetId}: item crosses cell`);
  const size=target.visualWorldSize,scale=256/Math.max(size.width,size.height);
  entries.push({name:`target_${targetId}_v8`,source:job.id,stage:'target',targetId,crop,
   width:Math.round(size.width*scale),height:Math.round(size.height*scale),inset:12,
   registration:'transparent_canvas_matches_existing_world_visual_ratio_no_object_distortion',
   runtime:`targets/${targetId}.png`});
 }
}
const actorJobs=jobs.filter(j=>j.actor&&!jobs.some(other=>other.supersedes===j.id));
for(const job of actorJobs){
 const {data,info}=await pixels(`${base}/sources/${job.id}.png`),frameBounds=[],crops=[];
 for(let i=0;i<job.columns*job.rows;i++){
  const crop=gridCrop(info,job.columns,job.rows,i),b=bounds(cellPixels(data,info,crop),{width:crop.width,height:crop.height,channels:4},32);
  assert.ok(b.left>2&&b.top>2&&b.left+b.width<crop.width-2&&b.top+b.height<crop.height-2,`${job.id}: figure crosses cell ${i}`);
  crops.push(crop);frameBounds.push(b);
 }
 const sharedSheetScale=186/Math.max(...frameBounds.map(b=>b.height)),names=[];
 for(let i=0;i<crops.length;i++){
  const name=`chicken_${job.actor}_v8_frame_${String(i+1).padStart(2,'0')}`;names.push(name);
  entries.push({name,source:job.id,stage:'character',actor:job.actor,frameIndex:i+1,crop:crops[i],
   width:384,height:256,footpoint:{x:192,y:215},figureHeight:Math.round(frameBounds[i].height*sharedSheetScale),
   sharedSheetScale,runtime:`cels/${job.actor}/${name}.png`});
 }
 const clip=(indices,durationSeconds)=>indices.map(i=>({asset:names[i],durationSeconds}));
 const clips=job.actor==='tea_vendor'?{idle_w:clip([0,2],.45),receive_w:clip([1,3],.20)}:
  {idle_w:clip([0,5],.45),walk_nw:clip([1,6],.14),walk_n:clip([2,7],.14),walk_ne:clip([3,8],.14),receive_w:clip([4,9],.45)};
 const manifest={schemaVersion:2,actorId:job.actor,canvasPx:{width:384,height:256},footpointPx:{x:192,y:215},paintedHeightPx:186,
  clips,loopingClips:Object.keys(clips).filter(name=>name!=='receive_w'),sourceBatch:'ai_image_v8',generatedSourceId:job.id,
  registration:'common_whole_sheet_scale_fixed_footpoint',sourceCellGrid:{columns:job.columns,rows:job.rows,width:info.width,height:info.height}};
 const file=`${bundle}/cels/${job.actor}/manifest.json`;write(file,manifest);
 if(!fs.existsSync(file+'.meta'))write(file+'.meta',{ver:'1.0.0',importer:'json',imported:true,uuid:randomUUID(),files:['.json'],subMetas:{},userData:{}});
}
assert.equal(entries.length,40);assert.equal(new Set(entries.map(e=>e.name)).size,40);
const generation=read(`${base}/generation_record.json`);
for(const source of generation.sources){const replacement=jobs.find(j=>j.supersedes===source.id);
 if(replacement){source.status='superseded_animation_candidate_unapproved';source.supersededBy=replacement.id;}}
generation.sceneBlueprintSha256=hash('design/street_block_01.json');
generation.contentSummary={newSceneInstances:14,newGrounds:7,newLowScenerySources:3,renewedTargets:12,renewedActors:2,newCels:14,
 totalSceneSlots:blueprint.artSlots.length,totalBuildings:blueprint.artSlots.filter(s=>s.layer==='building_back').length,
 totalActors:blueprint.npcPlans.length,preservedTargets:blueprint.hiddenObjectSlots.length,preservedReveals:blueprint.interactiveSlots.length};
write(`${base}/generation_record.json`,generation);
write(`${base}/import_plan.json`,{batchId:'ai_image_v8',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets:entries});
console.log(JSON.stringify({imports:entries.length,sources:generation.sources.length,...generation.contentSummary}));
