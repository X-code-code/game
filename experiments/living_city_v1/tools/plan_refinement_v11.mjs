// Mechanical preparation only. Existing targets retain identity and click area.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v11',read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint_v10.json`),jobs=read(`${base}/generation_plan.json`).jobs;
const placement={reading_glasses:{width:32,center:{x:-830,y:485}},postcard:{width:27,center:{x:1038,y:492}},yarn_ball:{width:27,contact:{x:549,y:-142}},laundry_peg:{width:8,contact:{x:735,y:-810}}};
const assets=[],imported=fs.existsSync(`${base}/production_manifest.json`)?read(`${base}/production_manifest.json`).assets:[];
for(const j of jobs){
 const {data,info}=await pixels(`${base}/sources/${j.id}.png`),box=bounds(data,info,32),t=b.hiddenObjectSlots.find(t=>t.id===j.targetId),p=placement[t.id];
 const scale=256/Math.max(box.width,box.height),width=Math.max(96,Math.round(box.width*scale)),height=Math.max(96,Math.round(box.height*scale));
 assets.push({name:j.id,source:j.id,stage:'target',targetId:t.id,width,height,inset:4,runtime:`targets/${t.id}.png`});
 t.visualWorldSize={width:p.width,height:p.width*height/width};t.at=p.center??{x:p.contact.x,y:p.contact.y+t.visualWorldSize.height*(.5-4/height)};
 const actual=imported.find(a=>a.name===j.id&&a.width===width&&a.height===height);
 if(p.contact&&actual)t.at.y=p.contact.y+(actual.alphaBounds.top+actual.alphaBounds.height-height/2)*t.visualWorldSize.height/height;
 t.generatedSourceBatch='ai_image_v11';t.generatedSourceId=j.id;t.surfaceContact=p.contact??p.center;
 t.surfacePlacement=p.center?'flat_object_center_on_surface':'visible_bottom_on_authored_surface';
 t.placementReview='v11 refinement: source pixels and final in-game placement reviewed separately.';
}
const descriptions={postcard:'糖果店旁的公告板下方，贴着一张蓝屋顶的小镇明信片。',yarn_ball:'喷泉旁前侧的小木箱上，毛线球留着一截短线头。'};
for(const [id,clue] of Object.entries(descriptions)){const t=b.hiddenObjectSlots.find(t=>t.id===id);t.clue=clue;t.semanticContext=clue;}
assert.deepEqual(b.hiddenObjectSlots.map(t=>t.id),old.hiddenObjectSlots.map(t=>t.id));assert.equal(b.hiddenObjectSlots.length,32);
write(`${base}/import_plan.json`,{batchId:'ai_image_v11',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets});write('design/street_block_01.json',b);
const g=read(`${base}/generation_record.json`);fs.mkdirSync(`${base}/references`,{recursive:true});
for(const s of g.sources){const j=jobs.find(j=>j.id===s.id);s.references=j.references.map((f,i)=>{const bytes=fs.readFileSync(f),sha=createHash('sha256').update(bytes).digest('hex'),file=`${base}/references/${j.support}_${i+1}.png`;fs.writeFileSync(file,bytes);return {original:f,path:file,sha256:sha};});}
write(`${base}/generation_record.json`,g);console.log(JSON.stringify({existingTargetsRefined:assets.length,targetCount:b.hiddenObjectSlots.length}));
