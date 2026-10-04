// Arrange existing AI PNGs; only resample the six existing flat ground cutouts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importEntry,pixels,bounds} from './import_generated_art.mjs';
const base='art/production/ai_image_v13',review='art/review/ai_image_v13';
const read=f=>JSON.parse(fs.readFileSync(f)),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.mkdirSync(base,{recursive:true});fs.mkdirSync(`${review}/before`,{recursive:true});
const blueprint='design/street_block_01.json',baseline=`${base}/baseline_blueprint_v12.json`;
if(!fs.existsSync(baseline)){
 fs.copyFileSync(blueprint,baseline);fs.copyFileSync('art/asset_manifest.json',`${base}/baseline_asset_manifest_v12.json`);
 for(const name of fs.readdirSync('art/review/ai_image_v12/three_chapters').filter(n=>/^chapter_1_.*\.png$/.test(n)))fs.copyFileSync(`art/review/ai_image_v12/three_chapters/${name}`,`${review}/before/${name}`);
}
const b=read(baseline),current=read(blueprint);
assert.ok(hash(blueprint)===hash(baseline)||current.stagingRevision==='existing_neighborhood_v13','Do not overwrite unrelated layout changes');
const moves={
 lc7_book_shop_back:[45,0],
 lc9_craft_table:[-25,75],
 lc5_east_courtyard_tree_front:[195,250],
 lc5_east_courtyard_patio_front:[-40,40],
 lc6_fountain_crates:[-45,15],
 lc8_flowers_flower_border:[-5,-50],
 lc8_inner_lane_flower_border:[-10,-70],
 lc8_sweets_shrub:[25,160],
 lc8_tea_shrub:[25,55],
 lc6_mail_flowers:[0,30],
};
const translated=[];
for(const [id,[dx,dy]]of Object.entries(moves)){
 const s=b.artSlots.find(s=>s.id===id);assert.ok(s,id);const before=structuredClone(s.center);
 s.center.x+=dx;s.center.y+=dy;if(s.footY!==undefined)s.footY+=dy;
 const attachments=[];
 for(const list of [b.hiddenObjectSlots,b.interactiveSlots,b.sceneDiscoveries])for(const item of list.filter(t=>t.supportArtSlotId===id)){
  item.at.x+=dx;item.at.y+=dy;if(item.depthY!==undefined)item.depthY+=dy;
  if(item.surfaceContact){item.surfaceContact.x+=dx;item.surfaceContact.y+=dy;}
  attachments.push(item.id);
 }
 for(const fp of b.physicalFootprints.filter(p=>p.artSlotId===id))fp.polygon=fp.polygon.map(([x,y])=>[x+dx,y+dy]);
 translated.push({id,before,after:s.center,delta:{x:dx,y:dy},attachments});
}
for(const target of b.hiddenObjectSlots.filter(t=>t.supportArtSlotId==='lc9_craft_table')){
 target.clue=target.semanticContext=target.id==='thread_spool'?'花店南边的小桌上，蓝线还没收好。':'花店南边的手作台上，看看蓝色收纳盒。';
}
const grounds=[
 ['books',-790,430,550,360],
 ['flowers',-815,-65,550,300],
 ['sweets',815,440,550,340],
 ['noodles',770,-60,640,420],
 ['sage',-690,-802,800,320],
 ['rose',730,-800,720,320],
];
const prior=read('art/production/ai_image_v12/production_manifest.json'),assets=[],groundChanges=[];
for(const [name,x,y,width,height]of grounds){
 const id=`lc8_${name}_courtyard_ground`,s=b.artSlots.find(s=>s.id===id),a=prior.assets.find(a=>a.sceneSlotId===id);
 const previous={center:structuredClone(s.center),size:structuredClone(s.size)};
 s.center={x,y};s.size={width,height};
 const source=await pixels(a.source),bb=bounds(source.data,source.info,a.alphaFloor);
 const nativePixelsPerWorldUnit=Math.min(bb.width/width,bb.height/height);
 // Refit flat paving to its authored footprint. Keep native detail above the
 // 1.055 screen-pixels/world-unit detail view; exporting at 2x adds no detail.
 assert.ok(nativePixelsPerWorldUnit>=1.35,`${id}: source is too small for the enlarged world footprint`);
 const result=await importEntry({name:`${id}_staged_v13`,stage:'scene_hd',sceneSlotId:id,sourcePath:a.source,prompt:a.prompt,source:a.source,
  width:width*2,height:height*2,resizeFit:'fill',align:'center',inset:8,alphaFloor:32,textureScale:2,worldSize:{...s.size},
  reusedSourceBatch:'ai_image_v8',reexportedFrom:a.output,runtime:`simple2d_scene/${id}.png`,registration:'existing_flat_ground_resampled_to_authored_footprint_no_drawing'});
 assert.equal(result.uuid,a.uuid);assets.push(result);groundChanges.push({id,before:previous,after:{center:s.center,size:s.size},nativeAlphaSize:{width:bb.width,height:bb.height},nativePixelsPerWorldUnit});
}
b.stagingRevision='existing_neighborhood_v13';
write(blueprint,b);
write(`${base}/production_manifest.json`,{batchId:'ai_image_v13',sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',newGenerationCalls:0,note:'Existing v8 generated ground originals mechanically re-exported for existing scene placements. No new artwork generated.',assets});
write(`${base}/generation_record.json`,{batchId:'ai_image_v13',newGenerationCalls:0,sources:[],reusedSources:assets.map(a=>({source:a.source,sha256:a.sourceSha256,prompt:a.prompt})),visualApproval:'pending'});
write(`${base}/layout_changes.json`,{scope:'existing_assets_only',baselineSha256:hash(baseline),sceneBlueprintSha256:hash(blueprint),translated,groundChanges,additionalTargets:0,additionalResidents:0,additionalSceneSlots:0});
console.log(JSON.stringify({existingPlacementsMoved:translated.length,existingGroundsResampled:assets.length,newContent:0}));
