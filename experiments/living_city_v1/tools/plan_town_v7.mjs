// Register generated PNG pixels only. Never draw or reconstruct artwork here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {pixels, bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v7';
const bundle='assets/bundles/city_living_city_street_block_01';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const blueprint=read('design/street_block_01.json');
const generation=read(`${base}/generation_record.json`),jobs=read(`${base}/generation_plan.json`).jobs;
const entries=[];
function folderMeta(folder){
    fs.mkdirSync(folder,{recursive:true});
    if(!fs.existsSync(folder+'.meta'))write(folder+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:randomUUID(),files:[],subMetas:{},userData:{}});
}
function jsonMeta(file){
    if(!fs.existsSync(file+'.meta'))write(file+'.meta',{ver:'1.0.0',importer:'json',imported:true,uuid:randomUUID(),files:['.json'],subMetas:{},userData:{}});
}
for(const slot of blueprint.artSlots.filter(s=>s.id.startsWith('lc7_'))){
    assert.equal(slot.layer,'building_back');
    entries.push({name:slot.generatedSourceId,source:slot.generatedSourceId,stage:'scene',sceneSlotId:slot.id,
        width:slot.size.width,height:slot.size.height,align:'bottom',
        footpoint:{x:slot.size.width/2,y:slot.size.height/2+slot.center.y-slot.footY},
        runtime:`simple2d_scene/${slot.id}.png`});
}
const actorJobs=jobs.filter(j=>j.actor&&j.supersedes);
assert.equal(actorJobs.length,8);
for(const job of actorJobs){
    const source=job.id,{data,info}=await pixels(`${base}/sources/${source}.png`);
    assert.equal(info.width%3,0,`${source}: grid width`);assert.equal(info.height%2,0,`${source}: grid height`);
    const cw=info.width/3,ch=info.height/2,frameBounds=[];
    for(let index=0;index<6;index++){
        const x=(index%3)*cw,y=Math.floor(index/3)*ch,cell=Buffer.alloc(cw*ch*4);
        for(let row=0;row<ch;row++)data.copy(cell,row*cw*4,((row+y)*info.width+x)*4,((row+y)*info.width+x+cw)*4);
        const b=bounds(cell,{width:cw,height:ch,channels:4},32);
        assert.ok(b.left>2&&b.top>2&&b.left+b.width<cw-2&&b.top+b.height<ch-2,`${source}: figure crosses cell ${index}`);
        frameBounds.push(b);
    }
    const sharedSheetScale=186/Math.max(...frameBounds.map(b=>b.height));
    const names=[];
    for(let index=0;index<6;index++){
        const name=`chicken_${job.actor}_v7_frame_${String(index+1).padStart(2,'0')}`;names.push(name);
        entries.push({name,source,stage:'character',actor:job.actor,frameIndex:index+1,
            width:384,height:256,footpoint:{x:192,y:215},figureHeight:Math.round(frameBounds[index].height*sharedSheetScale),
            sharedSheetScale,runtime:`cels/${job.actor}/${name}.png`,
            crop:{left:(index%3)*cw,top:Math.floor(index/3)*ch,width:cw,height:ch}});
    }
    const directory=`${bundle}/cels/${job.actor}`;folderMeta(directory);
    const clip=(indices,durationSeconds)=>indices.map(i=>({asset:names[i],durationSeconds}));
    const manifest={schemaVersion:2,actorId:job.actor,canvasPx:{width:384,height:256},
        footpointPx:{x:192,y:215},paintedHeightPx:186,
        clips:{idle_w:clip([0,3],.45),walk_nw:clip([1,4],.14),receive_w:clip([2,5],.45)},
        loopingClips:['idle_w','walk_nw','receive_w'],sourceBatch:'ai_image_v7',
        generatedSourceId:source,registration:'common_whole_sheet_scale_fixed_footpoint'};
    write(directory+'/manifest.json',manifest);jsonMeta(directory+'/manifest.json');
}
assert.equal(entries.length,54);assert.equal(new Set(entries.map(e=>e.name)).size,54);
for(const record of generation.sources){
    const job=jobs.find(j=>j.id===record.id);if(job)record.referencedImagePaths=job.references;
    const replacement=actorJobs.find(j=>j.supersedes===record.id);
    if(replacement){record.status='superseded_animation_candidate_unapproved';record.supersededBy=replacement.id;}
}
generation.sceneBlueprintSha256=hash('design/street_block_01.json');
generation.contentSummary={newBuildings:6,newActors:8,newCels:48,totalSceneSlots:blueprint.artSlots.length,
    totalBuildings:blueprint.artSlots.filter(s=>s.layer==='building_back').length,totalActors:blueprint.npcPlans.length,
    preservedTargets:blueprint.hiddenObjectSlots.length,preservedReveals:blueprint.interactiveSlots.length};
write(`${base}/generation_record.json`,generation);
write(`${base}/import_plan.json`,{batchId:'ai_image_v7',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets:entries});
if(!fs.existsSync(`${base}/production_manifest.json`))write(`${base}/production_manifest.json`,{
    batchId:'ai_image_v7',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',visualApproval:'pending',assets:[]});
console.log(JSON.stringify({imports:entries.length,buildings:6,actors:8,cels:48,...generation.contentSummary}));
