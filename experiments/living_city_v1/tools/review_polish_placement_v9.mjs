// Measure existing generated pixels and gameplay geometry; no image drawing.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pixels} from './import_generated_art.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const b=read('design/street_block_01.json'),p=read('art/production/ai_image_v9/production_manifest.json');
const rasters=new Map();
for(const a of p.assets){assert.equal(hash(a.runtime),a.sha256);assert.equal(hash(a.output),a.sha256);if(a.stage==='scene')rasters.set(a.sceneSlotId,{a,...await pixels(a.runtime)});}
function alphaAt(s,at){const {info,data}=rasters.get(s.id),x=Math.round(info.width/2+at.x-s.center.x),y=Math.round(info.height/2-at.y+s.center.y);return x<0||y<0||x>=info.width||y>=info.height?0:data[(y*info.width+x)*4+3];}
function route(n){const pts=[n.route[0]];for(let i=1;i<n.route.length;i++){const a=n.route[i-1],z=n.route[i],count=Math.max(1,Math.ceil(Math.hypot(z.x-a.x,z.y-a.y)/8));for(let j=1;j<=count;j++)pts.push({x:a.x+(z.x-a.x)*j/count,y:a.y+(z.y-a.y)*j/count});}return pts;}
const fixtures=b.artSlots.filter(s=>s.generatedSourceBatch==='ai_image_v9').map(s=>{
 const {a}=rasters.get(s.id);assert.equal(a.width,s.size.width);assert.equal(a.height,s.size.height);const headOverlaps=[],targetOverlaps=[];
 if(s.footY!==undefined){for(const n of b.npcPlans)for(const foot of route(n)){if(s.footY>=foot.y)continue;const head={x:foot.x,y:foot.y+n.actorHeight*.86};if(alphaAt(s,head)>=200)headOverlaps.push({id:n.id,foot,head});}
 for(const t of b.hiddenObjectSlots){const support=b.artSlots.find(a=>a.id===t.supportArtSlotId),depth=support.footY===undefined?t.at.y:support.footY-1;if(s.footY<depth&&alphaAt(s,t.at)>=200)targetOverlaps.push(t.id);}}
 assert.equal(headOverlaps.length,0,`${s.id}: hides resident head`);assert.equal(targetOverlaps.length,0,`${s.id}: hides target`);
 return{id:s.id,center:s.center,size:s.size,footY:s.footY,output:a.output,sha256:a.sha256,alphaBounds:a.alphaBounds,headOverlaps,targetOverlaps};
});
const supports=b.hiddenObjectSlots.filter(t=>rasters.has(t.supportArtSlotId)).map(t=>{const s=b.artSlots.find(s=>s.id===t.supportArtSlotId),a=p.assets.find(a=>a.targetId===t.id);return{id:t.id,at:t.at,support:s.id,centerSupportAlpha:alphaAt(s,t.at),worldSize:t.visualWorldSize,output:a?.output,visibleCondition:t.visibleCondition};});
const containers=b.interactiveSlots.filter(s=>s.generatedSourceBatch==='ai_image_v9').map(s=>{
 const states=p.assets.filter(a=>a.interactionId===s.id);assert.equal(states.length,2);assert.equal(states[0].sharedStateScale,states[1].sharedStateScale);
 const support=b.artSlots.find(a=>a.id===s.supportArtSlotId),foot={x:s.at.x,y:s.at.y-(238-128)*s.visualWorldSize.height/256};
 const supportAlpha=alphaAt(support,foot);assert.ok(supportAlpha>=200,`${s.id}: base misses table`);
 return{id:s.id,at:s.at,base:foot,support:support.id,supportAlpha,sharedScale:states[0].sharedStateScale,states:states.map(a=>({output:a.output,bounds:a.alphaBounds,footpoint:a.footpoint}))};
});
const actors=b.npcPlans.filter(n=>n.generatedSourceBatch==='ai_image_v9').map(n=>{
 const frames=p.assets.filter(a=>a.actor===n.id);assert.ok(frames.length===4||frames.length===10);assert.equal(new Set(frames.map(a=>a.sharedSheetScale)).size,1);
 for(const f of frames){assert.equal(f.width,384);assert.equal(f.height,256);assert.deepEqual(f.footpoint,{x:192,y:215});assert.ok(f.alphaBounds.top>0&&f.alphaBounds.top+f.alphaBounds.height<=216);}
 return{id:n.id,frames:frames.length,scale:frames[0].sharedSheetScale,footpoint:{x:192,y:215},crops:frames.map(f=>({frame:f.frameIndex,source:f.source,crop:f.crop,figureHeight:f.figureHeight}))};
});
const generatedFrontRims=[];
for(const i of b.interactiveSlots.filter(i=>i.openForegroundStart!==undefined)){
 const source=`assets/bundles/city_living_city_street_block_01/interactions/${i.id}_opened.png`,rim=await pixels(source),cut=Math.round(rim.info.height*i.openForegroundStart),targets=[];
 for(const t of b.hiddenObjectSlots.filter(t=>t.visibleCondition?.objectId===i.id)){
  const texture=await pixels(`assets/bundles/city_living_city_street_block_01/targets/${t.id}.png`);let visible=0,covered=0;
  for(let y=0;y<texture.info.height;y++)for(let x=0;x<texture.info.width;x++){
   if(texture.data[(y*texture.info.width+x)*4+3]<200)continue;visible++;
   const wx=t.at.x+(x+.5-texture.info.width/2)*t.visualWorldSize.width/texture.info.width,wy=t.at.y-(y+.5-texture.info.height/2)*t.visualWorldSize.height/texture.info.height;
   const rx=Math.floor(rim.info.width/2+(wx-i.at.x)*rim.info.width/i.visualWorldSize.width),ry=Math.floor(rim.info.height/2-(wy-i.at.y)*rim.info.height/i.visualWorldSize.height);
   if(rx>=0&&rx<rim.info.width&&ry>=cut&&ry<rim.info.height&&rim.data[(ry*rim.info.width+rx)*4+3]>=200)covered++;
  }
  assert.ok(visible>0&&covered/visible<.6,`${i.id}: hides too much of ${t.id}`);targets.push({id:t.id,visiblePixels:visible,coveredPixels:covered,occlusionFraction:covered/visible,hitRadius:t.clickRadiusWorld});
 }
 generatedFrontRims.push({id:i.id,generatedPng:source,sha256:hash(source),crop:{left:0,top:cut,width:rim.info.width,height:rim.info.height-cut},targets});
}
assert.equal(generatedFrontRims.length,6);
const result={status:'png_geometry_checks_passed',visualApproval:'pending',sceneBlueprintSha256:hash('design/street_block_01.json'),counts:{slots:b.artSlots.length,targets:b.hiddenObjectSlots.length,reveals:b.interactiveSlots.length,residents:b.npcPlans.length},fixtures,supports,containers,actors,generatedFrontRims,note:'Alpha probes and route sampling supplement actual runtime screenshot inspection; they do not establish player visual approval.'};
const pen=b.hiddenObjectSlots.find(t=>t.id==='fountain_pen'),table=b.artSlots.find(s=>s.id===pen.supportArtSlotId),file=`assets/bundles/city_living_city_street_block_01/simple2d_scene/${table.id}.png`,raster=await pixels(file);
const x=Math.round(raster.info.width/2+pen.at.x-table.center.x),y=Math.round(raster.info.height/2-pen.at.y+table.center.y),alpha=raster.data[(y*raster.info.width+x)*4+3];
assert.ok(alpha>=200,'Pen lacks an opaque support');result.finalPenSurface={target:pen.id,at:pen.at,worldSize:pen.visualWorldSize,support:table.id,png:file,sha256:hash(file),probePixel:{x,y,alpha},note:'Moved off canopy to the table; final built screenshot checked separately.'};
fs.writeFileSync('art/review/ai_image_v9/placement_review.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,counts:result.counts,containerBaseAlpha:containers.map(c=>c.supportAlpha)}));
