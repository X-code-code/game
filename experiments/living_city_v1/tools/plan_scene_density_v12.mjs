// Re-export retained AI originals at higher density. Never upscale old game PNGs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v12',read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const b=read('design/street_block_01.json'),entries=[],audit=[],registered=new Map();
for(let v=4;v<=11;v++){const f=`art/production/ai_image_v${v}/production_manifest.json`;if(fs.existsSync(f))for(const a of read(f).assets)if(!a.runtimeIsHistorical)registered.set(a.runtime,a);}
for(const s of b.artSlots){
 const runtime=`assets/bundles/city_living_city_street_block_01/simple2d_scene/${s.id}.png`,a=registered.get(runtime);assert.ok(a,s.id);
 const {data,info}=await pixels(a.source),box=bounds(data,info,a.alphaFloor??32),nativeFactor=Math.min(box.width/a.alphaBounds.width,box.height/a.alphaBounds.height);
 const density=Math.max(1,Math.min(3,Math.floor(2048/Math.max(s.size.width,s.size.height)),Math.floor(nativeFactor)));
 audit.push({id:s.id,source:a.source,sourceSha256:a.sourceSha256,worldSize:s.size,previousTextureSize:{width:a.width,height:a.height},textureScale:density,nativeFactor,previous:a});
 if(density===1)continue;
 s.textureScale=density;
 const entry={...a,name:`${s.id}_hd_v12`,sourcePath:a.source,source:a.name,stage:'scene_hd',sceneSlotId:s.id,
  width:s.size.width*density,height:s.size.height*density,inset:(a.inset??4)*density,runtime:`simple2d_scene/${s.id}.png`,textureScale:density,worldSize:{...s.size},reexportedFrom:a.output,reusedSourceBatch:a.source.split('/')[2]};
 if(a.footpoint)entry.footpoint={x:a.footpoint.x*density,y:a.footpoint.y*density};
 if(a.figureHeight)entry.figureHeight=a.figureHeight*density;
 if(a.maxVisualHeight)entry.maxVisualHeight=a.maxVisualHeight*density;
 delete entry.deriveFrom;
 entries.push(entry);
}
write(`${base}/scene_import_plan.json`,{batchId:'ai_image_v12',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets:entries});
write(`${base}/scene_density_plan.json`,{scope:'existing_generated_originals_only',newSceneSlots:0,slots:audit});write('design/street_block_01.json',b);
const combined=fs.existsSync(`${base}/import_plan.json`)?read(`${base}/import_plan.json`):{batchId:'ai_image_v12',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',assets:[]};combined.assets=[...combined.assets.filter(a=>a.stage!=='scene_hd'),...entries];write(`${base}/import_plan.json`,combined);
console.log(JSON.stringify({existingScenes:b.artSlots.length,higherResolution:entries.length,scales:audit.reduce((m,a)=>(m[a.textureScale]=(m[a.textureScale]??0)+1,m),{})}));
