// Read actual PNG pixels to record support/registration evidence. No drawing.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pixels } from './import_generated_art.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const b=read('design/street_block_01.json'),p=read('art/production/ai_image_v6/production_manifest.json');
const scene=new Map(b.artSlots.map(slot=>[slot.id,slot]));
function sceneRecord(id){return p.assets.find(asset=>asset.sceneSlotId===id);}
async function sample(file,world,center,size) {
    const {data,info}=await pixels(file);
    const x=Math.round(info.width/2+(world.x-center.x)*info.width/size.width);
    const y=Math.round(info.height/2-(world.y-center.y)*info.height/size.height);
    assert.ok(x>=0&&y>=0&&x<info.width&&y<info.height,`Point outside ${file}`);
    const alpha=data[(y*info.width+x)*4+3];
    assert.ok(alpha>=200,`Point falls on transparent pixels in ${file}: ${x},${y},${alpha}`);
    return {file,pixel:{x,y},alpha};
}
const targets=[],containers=[];
for(const target of b.hiddenObjectSlots.filter(target=>b.contentPlan.newTargetIds.includes(target.id))) {
    let surface;
    if(target.visibleCondition) {
        const container=b.interactiveSlots.find(row=>row.id===target.visibleCondition.objectId);
        const record=p.assets.find(asset=>asset.name===`${container.id}_opened_v6`);
        surface=await sample(record.output,target.at,container.at,container.visualWorldSize);
    } else {
        const slot=scene.get(target.supportArtSlotId);
        surface=await sample(sceneRecord(slot.id).output,target.at,slot.center,slot.size);
    }
    targets.push({id:target.id,at:target.at,supportArtSlotId:target.supportArtSlotId,...surface});
}
for(const id of b.contentPlan.newRevealIds) {
    const container=b.interactiveSlots.find(row=>row.id===id),slot=scene.get(container.supportArtSlotId);
    const frames=p.assets.filter(asset=>asset.name===`${id}_closed_v6`||asset.name===`${id}_opened_v6`);
    assert.equal(frames.length,2);assert.deepEqual(frames[0].footpoint,frames[1].footpoint);
    assert.equal(frames[0].sharedStateScale,frames[1].sharedStateScale);
    const f=frames[0],base={x:container.at.x+(f.footpoint.x-f.width/2)*container.visualWorldSize.width/f.width,
        y:container.at.y+(f.height/2-f.footpoint.y)*container.visualWorldSize.height/f.height};
    assert.ok(container.depthY<slot.footY);
    containers.push({id,base,footpoint:f.footpoint,sharedStateScale:f.sharedStateScale,
        ...await sample(sceneRecord(slot.id).output,base,slot.center,slot.size)});
}
const report={status:'passed',sceneBlueprintSha256:createHash('sha256').update(fs.readFileSync('design/street_block_01.json')).digest('hex'),
    scope:'new_v6_target_support_pixels_and_two_state_container_registration',targets,containers,
    note:'Alpha evidence confirms real support pixels. Appearance and occlusion additionally reviewed in actual game screenshots; player visual approval remains pending.'};
fs.mkdirSync('art/review/ai_image_v6',{recursive:true});
fs.writeFileSync('art/review/ai_image_v6/placement_review.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,newTargets:targets.length,newContainers:containers.length,
    alphaRange:[Math.min(...targets.map(t=>t.alpha)),Math.max(...targets.map(t=>t.alpha))]}));
