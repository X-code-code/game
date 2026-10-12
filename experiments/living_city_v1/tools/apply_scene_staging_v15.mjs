// Reposition existing generated PNG instances; never draw or modify their pixels.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/scene_staging_v15';
fs.mkdirSync(base,{recursive:true});
const file='design/street_block_01.json',baseline=`${base}/baseline_blueprint_v14.json`;
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(!fs.existsSync(baseline))fs.copyFileSync(file,baseline);
const b=JSON.parse(fs.readFileSync(baseline)),current=JSON.parse(fs.readFileSync(file));
assert.ok(hash(file)===hash(baseline)||current.stagingRevision==='functional_frontages_v15');
const plan=[
 ['lc5_street_water_station',-610,145,'Put the roadside washstand beside the flower shop, clear of its entrance and the crossing.'],
 ['lc6_central_water',-565,-820,'Put the second washstand inside the gardening courtyard, away from the crossing.'],
 ['lc5_east_storefront_back',535,745,'Align the blue shop entrance with the existing sweets courtyard instead of leaving the facade isolated on grass.'],
 ['lc6_central_table',700,540,'Group the loose cafe table on the shared paved frontage beside the blue shop, leaving the door and courtyard entry clear.'],
 ['lc8_sweets_shrub',590,325,'Move the shrub out of the relocated blue shop entrance and to the courtyard edge.'],
 ['lc5_curb_produce_east',505,-795,'Move the fruit stand beside the bakery frontage while leaving its doorway clear.'],
 ['lc5_curb_flower_display',-1015,-90,'Group the seed display with the existing flower courtyard.'],
 ['lc5_street_banner_front',-400,620,'Hang the existing garland from the tea shop awning instead of unsupported across the street.'],
];
const moves=[];
for(const [id,x,y,reason]of plan){
 const slot=b.artSlots.find(s=>s.id===id);assert.ok(slot,id);
 const before=structuredClone(slot),dx=x-slot.center.x,dy=y-slot.center.y;
 slot.center={x,y};if(slot.footY!==undefined)slot.footY+=dy;
 const attachments=[];
 for(const key of ['hiddenObjectSlots','interactiveSlots','sceneDiscoveries'])for(const item of b[key].filter(t=>t.supportArtSlotId===id)){
  item.at.x+=dx;item.at.y+=dy;if(item.depthY!==undefined)item.depthY+=dy;
  if(item.surfaceContact){item.surfaceContact.x+=dx;item.surfaceContact.y+=dy;}
  attachments.push({kind:key,id:item.id});
 }
 for(const fp of b.physicalFootprints.filter(p=>p.artSlotId===id))fp.polygon=fp.polygon.map(([px,py])=>[px+dx,py+dy]);
 if(id==='lc5_street_banner_front'){slot.size={width:285,height:45};slot.textureScale=4;}
 moves.push({id,before,after:structuredClone(slot),delta:{x:dx,y:dy},reason,attachments});
}
const clues={seed_packet:'花店庭院西侧的花架上，拨开叶片看看。',orchard_apple:'面包店右侧的果蔬篮里，红彤彤的果子等人带回家。',pink_watering_can:'园艺小屋右边的洗手台下层，放着一只小水壶。'};
for(const [id,clue]of Object.entries(clues)){const t=b.hiddenObjectSlots.find(t=>t.id===id);t.clue=t.semanticContext=clue;}
b.stagingRevision='functional_frontages_v15';
fs.writeFileSync(file,JSON.stringify(b,null,2)+'\n');
fs.writeFileSync(`${base}/layout_changes.json`,JSON.stringify({scope:'existing placements only',newContent:0,newGenerationCalls:0,pixelFilesChanged:0,baselineSha256:hash(baseline),sceneBlueprintSha256:hash(file),moves,clues,playerVisualApproval:'pending'},null,2)+'\n');
console.log(JSON.stringify({moved:moves.length,attachedTargets:moves.flatMap(m=>m.attachments).filter(a=>a.kind==='hiddenObjectSlots').length,newContent:0}));
