// Cuts AI-generated sheets into registered PNG cels. No anatomical drawing.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { importEntry } from './import_generated_art.mjs';
const require=createRequire(import.meta.url);
const sharp=require(process.env.COCOS_SHARP_PATH??'C:/Users/24627/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir='art/production/ai_image_v4';
const cast=[
 ['messenger_customer','mailman','chicken_mailman_sheet',5],
 ['tea_vendor','tea_vendor','chicken_tea_vendor_sheet',4],
 ['crossing_shopper','shopper','chicken_shopper_sheet',4],
 ['chestnut_seller','chestnut_seller','chicken_chestnut_seller_sheet',4],
 ['lantern_watcher','watcher','chicken_watcher_sheet',4],
 ['tea_regular','tea_regular','chicken_tea_regular_sheet',4],
 ['flower_buyer','flower_buyer','chicken_flower_buyer_sheet',4],
 ['lane_child','child','chicken_child_sheet',4],
];
const write=(file,data)=>{fs.mkdirSync(file.substring(0,file.lastIndexOf('/')),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');};
const manifest=fs.existsSync(`${dir}/production_manifest.json`)?JSON.parse(fs.readFileSync(`${dir}/production_manifest.json`,'utf8')):{assets:[]};
for(const [actor,role,source,rows] of cast) {
 if(process.argv[2]&&process.argv[2]!==actor)continue;
 const meta=await sharp(`${dir}/sources/${source}.png`).metadata();
 const names=[];
 for(let i=0;i<4*rows;i++) {
    const column=i%4,row=Math.floor(i/4);
    const left=Math.round(column*meta.width/4),right=Math.round((column+1)*meta.width/4);
    const top=Math.round(row*meta.height/rows),bottom=Math.round((row+1)*meta.height/rows);
    const name=`chicken_${role}_frame_${String(i+1).padStart(2,'0')}`;names.push(name);
    const entry={name,source,stage:'characters',actor,frameIndex:i,width:384,height:256,
        figureHeight:186,footpoint:{x:192,y:215},crop:{left,top,width:right-left,height:bottom-top},
        runtime:`cels/${actor}/${name}.png`};
    const result=await importEntry(entry);
    const index=manifest.assets.findIndex(a=>a.name===name);
    if(index<0)manifest.assets.push(result);else manifest.assets[index]=result;
 }
 const frames=(indexes,durationSeconds=.12)=>indexes.map(i=>({asset:names[i],durationSeconds}));
 const courier=actor==='messenger_customer';
 const clips=courier?{
    walk_n:frames([0,1,2,3]),walk_nw:frames([4,5,6,7]),walk_ne:frames([8,9,10,11]),
    idle_w:frames([16,17],.38),receive_w:frames([12,13,14,15],.25),
    turn_nw_w:frames([4,16],.16),turn_w_ne:frames([18,19],.16),idle_ne:frames([19],.5),
 }:{
    walk_n:frames([4,5,6,7]),walk_nw:frames([0,1,2,3]),walk_ne:frames([8,9,10,11]),
    idle_w:frames([12,13],.4),receive_w:frames([14,15],.45),
    turn_nw_w:frames([0,12],.15),turn_w_ne:frames([12,0],.15),idle_ne:frames([12,13],.4),
 };
 const output=`assets/bundles/city_living_city_street_block_01/cels/${actor}/manifest.json`;
 write(output,{schemaVersion:1,actorId:actor,canvasPx:{width:384,height:256},
    footpointPx:{x:192,y:215},paintedHeightPx:186,clips});
 if(!fs.existsSync(output+'.meta'))write(output+'.meta',{ver:'2.0.1',importer:'json',imported:true,
    uuid:randomUUID(),files:['.json'],subMetas:{},userData:{}});
 write(`${dir}/production_manifest.json`,manifest);
 console.log(JSON.stringify({actor,cels:names.length,source,canvas:[384,256],footpoint:[192,215]}));
}
