// Build PNG import records from existing generated pixels. No drawing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pixels, bounds } from './import_generated_art.mjs';
const base='art/production/ai_image_v6',previous='art/production/ai_image_v5';
const bundle='assets/bundles/city_living_city_street_block_01';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const blueprint=read('design/street_block_01.json');
assert.equal(blueprint.hiddenObjectSlots.length,24);
const generation=read(`${base}/generation_record.json`),oldGeneration=read(`${previous}/generation_record.json`);
const oldManifest=read(`${previous}/production_manifest.json`);
const slots=new Map(blueprint.artSlots.map(slot=>[slot.id,slot])),entries=[];
const clonedSources=new Map();
function resolve(slot,seen=new Set()) {
    assert.ok(slot&&!seen.has(slot.id),'Cyclic/missing source slot'); seen.add(slot.id);
    if(slot.generatedSourceId)return {source:slot.generatedSourceId,prompt:`${base}/prompts/${slot.generatedSourceId}.md`};
    if(slot.instanceOfSlotId)return resolve(slots.get(slot.instanceOfSlotId),seen);
    const previousAsset=oldManifest.assets.find(asset=>asset.sceneSlotId===slot.id);
    assert.ok(previousAsset,`No generated source for ${slot.id}`);
    const key=previousAsset.source;
    if(!clonedSources.has(key)) {
        const source=`reuse_${path.basename(key,'.png')}_v6`,file=`${base}/sources/${source}.png`,prompt=`${base}/prompts/${source}.md`;
        fs.copyFileSync(key,file);fs.copyFileSync(previousAsset.prompt,prompt);
        const original=oldGeneration.sources.find(record=>record.source===key);
        assert.ok(original&&hash(file)===previousAsset.sourceSha256);
        const record={id:source,source:file,prompt,sourceType:'codex_builtin_image_gen',
            sourceSha256:hash(file),originalToolOutput:original.originalToolOutput,
            originalToolOutputSha256:original.originalToolOutputSha256,
            sourceSize:previousAsset.sourceSize,reusedFromProduction:'ai_image_v5',
            reusedSource:key,reusedPrompt:previousAsset.prompt,
            method:'unchanged_generated_source_copy_no_new_generation_call',status:'reused_source_unapproved'};
        generation.sources=generation.sources.filter(row=>row.id!==source);generation.sources.push(record);
        clonedSources.set(key,{source,prompt,reusedSource:key});
    }
    return clonedSources.get(key);
}
for(const slot of blueprint.artSlots.filter(slot=>slot.id.startsWith('lc6_'))) {
    const source=resolve(slot),entry={name:`${slot.id.slice(4)}_content_v6`,...source,stage:'scene',
        width:slot.size.width,height:slot.size.height,align:'bottom',sceneSlotId:slot.id,
        runtime:`simple2d_scene/${slot.id}.png`};
    if(slot.layer==='depth')entry.footpoint={x:entry.width/2,y:entry.height/2+slot.center.y-slot.footY};
    entries.push(entry);
}
const groups={
 reading_targets_sheet_v6:['reading_glasses','bookmark','wooden_bird','garden_glove'],
 garden_mail_targets_sheet_v6:['seedling_spade','pink_watering_can','postcard','stamp_roll'],
 picnic_targets_sheet_v6:['tiny_camera','picnic_cookie','yarn_ball','laundry_peg'],
};
for(const [source,ids] of Object.entries(groups)) {
    const {info}=await pixels(`${base}/sources/${source}.png`);
    const w=Math.floor(info.width/2),h=Math.floor(info.height/2);
    for(let index=0;index<ids.length;index++)entries.push({name:`${ids[index]}_target_v6`,source,
        stage:'target',width:256,height:256,inset:16,align:'center',runtime:`targets/${ids[index]}.png`,
        crop:{left:(index%2)*w,top:Math.floor(index/2)*h,width:w,height:h}});
}
for(const id of ['book_satchel','garden_toolbox','picnic_basket']) {
    const source=`${id}_states_v6`,{data,info}=await pixels(`${base}/sources/${source}.png`);
    const w=Math.floor(info.width/2),h=info.height,frameBounds=[];
    for(let index=0;index<2;index++) {
        const cropped=Buffer.alloc(w*h*4);
        for(let y=0;y<h;y++)data.copy(cropped,y*w*4,(y*info.width+index*w)*4,(y*info.width+index*w+w)*4);
        frameBounds.push(bounds(cropped,{width:w,height:h,channels:4},32));
    }
    const scale=Math.min(228/Math.max(...frameBounds.map(b=>b.width)),224/Math.max(...frameBounds.map(b=>b.height)));
    for(let index=0;index<2;index++)entries.push({name:`${id}_${index?'opened':'closed'}_v6`,source,
        stage:'interaction',width:256,height:256,inset:14,align:'bottom',
        footpoint:{x:128,y:238},figureHeight:Math.round(frameBounds[index].height*scale),
        sharedStateScale:scale,runtime:`interactions/${id}_${index?'opened':'closed'}.png`,
        crop:{left:index*w,top:0,width:w,height:h}});
}
assert.equal(new Set(entries.map(entry=>entry.name)).size,entries.length);
for(const entry of entries)assert.ok(fs.existsSync(`${base}/sources/${entry.source}.png`));
generation.sceneBlueprintSha256=hash('design/street_block_01.json');
generation.contentSummary={newTargets:12,newRevealPoints:3,newSceneSlots:entries.filter(e=>e.stage==='scene').length,
    lifeGroups:blueprint.lifeGroups?.length??0,sharedCharacterBatch:'ai_image_v4'};
const jobs=read(`${base}/generation_plan.json`).jobs;
for(const record of generation.sources) {
    const job=jobs.find(job=>job.id===record.id);
    if(job)record.referencedImagePaths=job.references;
}
write(`${base}/generation_record.json`,generation);
write(`${base}/import_plan.json`,{batchId:'ai_image_v6',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets:entries});
if(!fs.existsSync(`${base}/production_manifest.json`))write(`${base}/production_manifest.json`,{
    batchId:'ai_image_v6',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',visualApproval:'pending',assets:[]});
console.log(JSON.stringify({imports:entries.length,scene:entries.filter(e=>e.stage==='scene').length,targets:12,states:6,reusedSources:clonedSources.size}));
