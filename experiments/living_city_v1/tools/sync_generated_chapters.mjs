// City JSON, generated PNG export plans and bundle registrations only.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const base='art/production/ai_image_v4',firstBundle='assets/bundles/city_living_city_street_block_01';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,j)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n');};
const jsonMeta=f=>{if(!fs.existsSync(f+'.meta'))write(f+'.meta',{ver:'2.0.1',importer:'json',imported:true,uuid:randomUUID(),files:['.json'],subMetas:{},userData:{}});};
const plan=read(`${base}/import_plan.json`),first=read('design/street_block_01.json');
first.nextCityId='living_city_garden_market_02';write('design/street_block_01.json',first);
const catalog=read('assets/resources/configs/city_catalog.json');
function add(entry){const i=plan.assets.findIndex(a=>a.name===entry.name);if(i>=0)plan.assets[i]=entry;else plan.assets.push(entry);}
function copyAsset(source,dest){
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
 if(!fs.existsSync(dest+'.meta')&&fs.existsSync(source+'.meta')){
  const m=read(source+'.meta'),uuid=randomUUID();
  write(dest+'.meta',JSON.parse(JSON.stringify(m).replaceAll(m.uuid,uuid)));
 }
}
const chapters=[['garden_market_02','living_city_harbor_walk_03'],['harbor_walk_03',null]];
for(const [file,nextCityId] of chapters){
 const c=read(`design/${file}.json`),bundle=`assets/bundles/city_${c.id}`;
 fs.mkdirSync(bundle,{recursive:true});
 if(!fs.existsSync(bundle+'.meta'))write(bundle+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:randomUUID(),files:[],subMetas:{},userData:{isBundle:true,bundleName:`city_${c.id}`,priority:7}});
 const normalized=p=>({x:(p.x+768)/1536,y:(p.y+1024)/2048});
 const city={schemaVersion:1,cityId:c.id,cityName:c.name,background:`simple2d_scene/${c.artSlots[0].id}`,
  sceneBlueprint:file,chapterIndex:c.chapterIndex,chapterCount:3,mapSize:{width:1536,height:2048},
  view:{minZoom:c.camera.minZoom,maxZoom:c.camera.maxZoom,initialZoom:c.camera.initialZoom},
  hiddenObjects:c.hiddenObjectSlots.map(t=>({id:t.id,asset:`targets/${t.id}`,...normalized(t.at),scale:1,rotation:0,
   clickArea:{shape:'circle',radius:t.clickRadiusWorld},tags:[t.id,'generated_target'],targetable:true,
   displayName:t.label,clue:t.clue,visualSize:t.visualWorldSize,
   depthY:c.artSlots.find(s=>s.id===t.supportArtSlotId)?.footY!==undefined
    ?c.artSlots.find(s=>s.id===t.supportArtSlotId).footY-1:t.at.y,
   ...(t.visibleCondition?{visibleCondition:t.visibleCondition}:{})})),
  chickens:[],interactiveObjects:c.interactiveSlots.map(i=>({id:i.id,asset:`interactions/${i.id}_closed`,openAsset:`interactions/${i.id}_opened`,
   ...normalized(i.at),scale:1,rotation:0,clickArea:{shape:'rect',...i.visualWorldSize},visualSize:i.visualWorldSize,
   depthY:i.depthY,label:i.label,initialState:'closed',actions:[{type:'setState',objectId:i.id,state:'opened'}],tags:['reveal'],targetable:true})),
  foregroundSprites:[],tasks:c.hiddenObjectSlots.map(t=>({id:`find_${t.id}`,type:'hiddenObject',targetId:t.id,label:`找到${t.label}`,required:true})),
  nextCityId,travelType:nextCityId?'boat':'other'};
 write(`${bundle}/city.json`,city);jsonMeta(`${bundle}/city.json`);
 write(`${bundle}/${file}.json`,c);jsonMeta(`${bundle}/${file}.json`);
 const entry={cityId:c.id,bundleName:`city_${c.id}`};
 catalog.cities=[...catalog.cities.filter(e=>e.cityId!==c.id),entry];
 for(const slot of c.artSlots){
  const name=`${file}_${slot.id.substring(3)}`;
  const e={name,source:slot.source,stage:'chapters',bundle,...slot.size,align:'bottom',runtime:`simple2d_scene/${slot.id}.png`};
  if(slot.layer==='ground')Object.assign(e,{transparent:false,keepFullCanvas:true});
  add(e);
 }
 for(const t of c.hiddenObjectSlots)add({name:`${file}_target_${t.id}`,source:`target_${t.id}`,stage:'chapters',bundle,
  width:256,height:256,inset:12,runtime:`targets/${t.id}.png`});
 const manifest=read(`${base}/production_manifest.json`);
 for(const actor of c.npcPlans){
  const folder=`${bundle}/cels/${actor.id}`;
  fs.mkdirSync(folder,{recursive:true});
  for(const f of fs.readdirSync(`${firstBundle}/cels/${actor.id}`).filter(f=>f.startsWith('chicken_')&&f.endsWith('.png'))){
   const source=`${firstBundle}/cels/${actor.id}/${f}`,dest=`${folder}/${f}`;copyAsset(source,dest);
   const original=manifest.assets.find(a=>a.runtime===source);
   if(!original)throw new Error(`No generated provenance for ${source}`);
   const record={...original,name:`${file}_${original.name}`,runtime:dest,bundle,uuid:read(dest+'.meta').uuid,method:'generated_png_byte_copy_with_new_cocos_uuid'};
   const i=manifest.assets.findIndex(a=>a.name===record.name);if(i<0)manifest.assets.push(record);else manifest.assets[i]=record;
  }
  copyAsset(`${firstBundle}/cels/${actor.id}/manifest.json`,`${folder}/manifest.json`);
 }
 for(const id of ['parcel_chest','flower_leaves','bun_lid'])for(const state of ['closed','opened']){
  const source=`${firstBundle}/interactions/${id}_${state}.png`,dest=`${bundle}/interactions/${id}_${state}.png`;copyAsset(source,dest);
  const original=manifest.assets.find(a=>a.runtime===source),record={...original,name:`${file}_${id}_${state}`,runtime:dest,bundle,uuid:read(dest+'.meta').uuid,method:'generated_png_byte_copy_with_new_cocos_uuid'};
  const i=manifest.assets.findIndex(a=>a.name===record.name);if(i<0)manifest.assets.push(record);else manifest.assets[i]=record;
 }
 for(const name of ['ui_panel','ui_button','ui_hint_ring','ui_backdrop']){
  const source=`${firstBundle}/ui/${name}.png`,dest=`${bundle}/ui/${name}.png`;copyAsset(source,dest);
  const original=manifest.assets.find(a=>a.runtime===source),record={...original,name:`${file}_${name}`,runtime:dest,bundle,uuid:read(dest+'.meta').uuid,method:'generated_png_byte_copy_with_new_cocos_uuid'};
  const i=manifest.assets.findIndex(a=>a.name===record.name);if(i<0)manifest.assets.push(record);else manifest.assets[i]=record;
 }
 write(`${base}/production_manifest.json`,manifest);
}
// Retain old fixtures on disk, but never restore the retired procedural scenes.
const activeIds=['living_city_street_block_01','living_city_garden_market_02','living_city_harbor_walk_03'];
if(!fs.existsSync('design/history/city_catalog_v3.json'))write('design/history/city_catalog_v3.json',catalog);
catalog.cities=catalog.cities.filter(entry=>activeIds.includes(entry.cityId));
write('assets/resources/configs/city_catalog.json',catalog);write(`${base}/import_plan.json`,plan);
console.log('Three linked chapters: 36 targets, 9 reveal actions, independent progress.');
