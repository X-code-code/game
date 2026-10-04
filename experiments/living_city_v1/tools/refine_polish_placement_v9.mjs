// Placement of existing generated PNGs only; never redraw artwork.
import fs from 'node:fs';
const file='design/street_block_01.json',b=JSON.parse(fs.readFileSync(file));
const table=b.artSlots.find(s=>s.id==='lc9_craft_table');
table.center={x:-825,y:-325};table.footY=-400;
for(const [id,x,y] of [['thread_spool',-880,-303],['brass_key',-780,-288],['lemon_candy',605,-422],['tailor_thimble',-260,-672],['sewing_scissors',-385,-695]]){
 const t=b.hiddenObjectSlots.find(t=>t.id===id);t.at={x,y};
}
const thimble=b.hiddenObjectSlots.find(t=>t.id==='tailor_thimble');
thimble.visualWorldSize={width:22,height:22*37/36};
thimble.clue='裁缝铺门口叠好的布料旁，落着一只小顶针。';thimble.semanticContext=thimble.clue;
// Keep the fountain's optional chat clear of the newly placed paper boat.
b.sceneDiscoveries.find(d=>d.id==='fountain_rest_stop').at={x:590,y:35};
for(const t of b.hiddenObjectSlots.filter(t=>t.supportArtSlotId===table.id)){t.clue=t.clue.replace('裁缝铺左边的手作台上','裁缝铺左侧小巷的手作台上');t.semanticContext=t.clue;}
const tin=b.interactiveSlots.find(s=>s.id==='biscuit_tin');tin.at={x:605,y:-411};
const box=b.interactiveSlots.find(s=>s.id==='trinket_box');box.at={x:-780,y:-277};box.depthY=-400.5;
const d=b.sceneDiscoveries.find(d=>d.id==='craft_table_pause');d.at={x:-825,y:-367};
for(const id of ['lc9_craft_table','lc9_refreshment_cart']){
 const s=b.artSlots.find(s=>s.id===id),half=s.size.width*.42,y=s.footY;
 b.physicalFootprints=b.physicalFootprints.filter(p=>p.artSlotId!==id);
 b.physicalFootprints.push({id:`${id}_occupied_base`,artSlotId:id,polygon:[[s.center.x-half,y],[s.center.x+half,y],[s.center.x+half,y+45],[s.center.x-half,y+45]],purpose:'Keep resident feet outside the generated fixture base.'});
}
b.status='v9_runtime_candidate';
fs.writeFileSync(file,JSON.stringify(b,null,2)+'\n');
console.log('Aligned generated containers with table surfaces; moved craft table clear of the sage-house facade.');
