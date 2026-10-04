// World placement and reuse of existing generated PNG regions, not art drawing.
import fs from 'node:fs';
const file='design/street_block_01.json',b=JSON.parse(fs.readFileSync(file));
const widths={tea_clay_whistle:26,pocket_watch:25,chestnut_tongs:30,sewing_scissors:30,blue_feather:30,sealed_letter:28,honey_dipper:28,seed_packet:28,orchard_apple:28,golden_bun:30,bookmark:23,seedling_spade:27,picnic_cookie:26,fountain_pen:30,paper_boat:30,knit_hat:30,enamel_mug:25,thread_spool:27,brass_key:28,lemonade_bottle:26,lemon_candy:28};
for(const t of b.hiddenObjectSlots)if(widths[t.id]){const ratio=t.visualWorldSize.height/t.visualWorldSize.width;t.visualWorldSize={width:widths[t.id],height:widths[t.id]*ratio};}
const rims={parcel_chest:147,book_satchel:162,garden_toolbox:175,picnic_basket:150,biscuit_tin:177,trinket_box:175};
for(const i of b.interactiveSlots)if(rims[i.id])i.openForegroundStart=rims[i.id]/256;
b.hiddenObjectSlots.find(t=>t.id==='sealed_letter').at.y=-864;
b.hiddenObjectSlots.find(t=>t.id==='fountain_pen').at={x:-788,y:484};
fs.writeFileSync(file,JSON.stringify(b,null,2)+'\n');
console.log('Preserved PNG aspect and finger hit areas; authored six generated container front rims.');
