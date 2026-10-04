// Existing generated pixels only: proportional imports and authored contact points.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v10',read=f=>JSON.parse(fs.readFileSync(f));
const b=read('design/street_block_01.json'),jobs=read(`${base}/generation_plan.json`).jobs;
const placement={garden_glove:{width:34,center:{x:-1037,y:-831}},tiny_camera:{width:32,contact:{x:945,y:-28}},pink_watering_can:{width:34,contact:{x:-114,y:-220}},wooden_bird:{width:30,contact:{x:147,y:838}}};
const assets=[];
for(const j of jobs){const{data,info}=await pixels(`${base}/sources/${j.id}.png`),box=bounds(data,info,32),t=b.hiddenObjectSlots.find(t=>t.id===j.targetId),p=placement[t.id];
 const width=256,height=Math.round(256*box.height/box.width);
 assets.push({name:j.id,source:j.id,stage:'target',targetId:t.id,width,height,inset:4,runtime:`targets/${t.id}.png`});
 t.visualWorldSize={width:p.width,height:p.width*height/width};
 t.at=p.center??{x:p.contact.x,y:p.contact.y+t.visualWorldSize.height*(.5-4/height)};
 t.generatedSourceBatch='ai_image_v10';t.generatedSourceId=j.id;
 t.surfaceContact=p.contact??{...p.center};t.surfacePlacement=p.center?'flat_object_center_on_table':'visible_bottom_on_authored_surface';
 t.placementReview='Actual generated alpha and contact point; pending built screenshot verification.';
}
b.hiddenObjectSlots.find(t=>t.id==='pink_watering_can').clue='茶摊旁的洗手台下层，放着一只小水壶。';
b.hiddenObjectSlots.find(t=>t.id==='wooden_bird').clue='北边路旁的小木箱上，一只木头小鸟停在那里。';
for(const id of ['pink_watering_can','wooden_bird']){const t=b.hiddenObjectSlots.find(t=>t.id===id);t.semanticContext=t.clue;}
fs.writeFileSync(`${base}/import_plan.json`,JSON.stringify({batchId:'ai_image_v10',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets},null,2)+'\n');
fs.writeFileSync('design/street_block_01.json',JSON.stringify(b,null,2)+'\n');
const g=read(`${base}/generation_record.json`);fs.mkdirSync(`${base}/references`,{recursive:true});
for(const s of g.sources){const j=jobs.find(j=>j.id===s.id);s.references=j.references.map((f,i)=>{const bytes=fs.readFileSync(f),sha=createHash('sha256').update(bytes).digest('hex'),file=`${base}/references/${j.support}_${i+1}.png`;fs.writeFileSync(file,bytes);return{original:f,path:file,sha256:sha};});}
fs.writeFileSync(`${base}/generation_record.json`,JSON.stringify(g,null,2)+'\n');
console.log(JSON.stringify({assets:assets.length,targets:b.hiddenObjectSlots.filter(t=>t.generatedSourceBatch==='ai_image_v10').map(t=>({id:t.id,at:t.at,size:t.visualWorldSize,contact:t.surfaceContact}))}));
