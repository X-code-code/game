// Build placement/export records for generated pixels; never draw assets.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('C:/Users/24627/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const base='art/production/ai_image_v4';
const plan=JSON.parse(fs.readFileSync(`${base}/import_plan.json`,'utf8'));
const scene=JSON.parse(fs.readFileSync('design/street_block_01.json','utf8'));
const mapping={
 lc_ground_paving:['town_ground','town_ground'],
 lc_tea_patio_front:['tea_patio','tea_patio'],
 lc_chestnut_cart_back:['chestnut_cart','chestnut_cart'],
 lc_tree_front:['town_tree','town_tree'],
 lc_planter_front:['flower_pot','street_planter'],
 lc_bench_front:['town_bench','town_bench'],
 lc_curb_flower_display:['flower_display','flower_display'],
 lc_tailor_goods:['sewing_goods','sewing_goods'],
 lc_tailor_work_rack:['tailor_rack','tailor_rack'],
 lc_crates_front:['wood_crates','wood_crates'],
 lc_shop_goods_east:['pottery_display','pottery_display'],
 lc_curb_pottery_west:['pottery_display','pottery_curb_display'],
 lc_curb_produce_east:['produce_display','produce_display'],
 lc_wayfinding_sign:['town_signpost','town_signpost'],
 lc_lantern_post_front:['lantern_post','lantern_post'],
 lc_street_banner_front:['street_banner','street_banner'],
 lc_crossing_pennants:['street_pennants','street_pennants'],
 lc_tea_steam_fx:['steam_fx','steam_fx'],
 lc_west_market_handcart:['town_handcart','town_handcart'],
 lc_street_water_station:['water_station','water_station'],
 lc_tea_delivery_nook:['wood_crates','tea_delivery_box'],
 lc_tailor_delivery_stool:['sewing_goods','tailor_delivery_stool'],
 lc_tea_flower_vine:['flower_pot','tea_flower_vine'],
 lc_tailor_flower_vine:['flower_pot','tailor_flower_vine'],
 lc_east_flower_vine:['flower_pot','east_flower_vine'],
 lc_post_flower_vine:['flower_pot','post_flower_vine'],
};
function add(entry){const i=plan.assets.findIndex(a=>a.name===entry.name);if(i>=0)plan.assets[i]=entry;else plan.assets.push(entry);}
for(const [id,[source,name]] of Object.entries(mapping)) {
 const slot=scene.artSlots.find(s=>s.id===id);
 const entry={name,source,stage:'scene',...slot.size,align:'bottom',runtime:`simple2d_scene/${id}.png`};
 if(slot.layer==='ground')Object.assign(entry,{transparent:false,keepFullCanvas:true});
 if(slot.layer==='depth')entry.footpoint={x:slot.size.width/2,y:Math.round(Math.min(slot.size.height-4,slot.size.height/2+slot.center.y-slot.footY))};
 add(entry);
}
add({name:'chestnut_cart_front',source:'chestnut_cart',deriveFrom:'chestnut_cart',stage:'scene',width:185,height:110,crop:{left:0,top:95,width:185,height:110},keepFullCanvas:true,runtime:'simple2d_scene/lc_chestnut_cart_front.png'});
// Tiny generated-image fragments overlap only the lower target silhouette.
for(const [id,source,name] of [
 ['lc_tea_whistle_foreground','event_cup','tea_whistle_overlap'],
 ['lc_tailor_thimble_foreground','sewing_goods','tailor_thimble_overlap'],
 ['lc_banner_knot_foreground','street_banner','banner_knot_overlap'],
 ['lc_chestnut_tongs_foreground','chestnut_cart','chestnut_tongs_overlap']]) {
 const slot=scene.artSlots.find(s=>s.id===id);
 add({name,source,stage:'scene',...slot.size,maxVisualHeight:8,inset:1,align:'bottom',runtime:`simple2d_scene/${id}.png`});
}
for(const t of scene.hiddenObjectSlots)add({name:`target_${t.id}`,stage:'targets',width:256,height:256,inset:12,runtime:`targets/${t.id}.png`});
for(const i of scene.interactiveSlots) {
 const source=`${i.id}_states`,file=`${base}/sources/${source}.png`;
 if(!fs.existsSync(file))continue;
 const m=await sharp(file).metadata();
 for(let cell=0;cell<2;cell++)add({name:`${i.id}_${cell?'opened':'closed'}`,source,stage:'interactions',width:256,height:256,
  crop:{left:cell*Math.floor(m.width/2),top:0,width:Math.floor(m.width/2),height:m.height},keepFullCanvas:true,
  runtime:`interactions/${i.id}_${cell?'opened':'closed'}.png`});
}
add({name:'event_cup',stage:'extras',width:64,height:64,inset:4,runtime:'event_cup.png'});
for(const name of ['ui_panel','ui_button','ui_hint_ring'])add({name,stage:'ui',width:256,height:256,inset:0,
 ...(name!=='ui_hint_ring'?{nineSliceBorder:40}:{}),runtime:`ui/${name}.png`});
add({name:'ui_backdrop',source:'town_ground',stage:'ui',width:128,height:128,
 crop:{left:20,top:20,width:200,height:200},keepFullCanvas:true,transparent:false,runtime:'ui/ui_backdrop.png'});
fs.writeFileSync(`${base}/import_plan.json`,JSON.stringify(plan,null,2)+'\n');
console.log(`${plan.assets.length} generated PNG exports planned`);
