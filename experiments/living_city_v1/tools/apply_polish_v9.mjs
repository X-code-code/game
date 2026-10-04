// Scene configuration only. Artwork is loaded from built-in generated PNGs.
import fs from 'node:fs';
const file='design/street_block_01.json',b=JSON.parse(fs.readFileSync(file));
const pending='Authored candidate; generated alpha placement and runtime visual verification pending.';
const replacements={lc5_south_post_house_back:'post_kiosk_v9',lc5_tailor_work_rack:'tailor_rack_v9',lc5_tailor_goods:'tailor_goods_v9'};
for(const s of b.artSlots)if(replacements[s.id]){s.generatedSourceBatch='ai_image_v9';s.generatedSourceId=replacements[s.id];s.placementReview=pending;}
const newSlots=[
 {id:'lc9_refreshment_cart',layer:'depth',center:{x:565,y:-445},size:{width:210,height:160},footY:-520,lifeGroupId:'east_fountain_rest',generatedSourceId:'refreshment_cart_v9'},
 {id:'lc9_craft_table',layer:'depth',center:{x:-680,y:-460},size:{width:220,height:160},footY:-535,lifeGroupId:'west_gardening_corner',generatedSourceId:'craft_table_v9'},
];
for(const s of newSlots){s.alpha=true;s.generatedSourceBatch='ai_image_v9';s.purpose='A useful neighborhood work surface with separate findable PNG objects.';s.placementReview=pending;}
b.artSlots=b.artSlots.filter(s=>!s.id.startsWith('lc9_')).concat(newSlots);
const rows=[
 ['fountain_pen','钢笔','lc6_reading_stall',-785,545,40,26,'书摊上翻开的书旁，压着一支蓝色钢笔。','west_reading_garden'],
 ['paper_boat','纸船','lc6_fountain',650,5,40,30,'喷泉下层的水边，停着一只折好的小纸船。','east_fountain_rest'],
 ['knit_hat','绒线帽','lc5_bench_front',-550,-167,38,36,'花店下方的长椅上，留下了一顶浅紫色绒线帽。','west_reading_garden'],
 ['enamel_mug','搪瓷杯','lc6_picnic_blanket',909,-888,36,36,'玫瑰小屋前的野餐垫边，放着一只绿色搪瓷杯。','southeast_picnic_yard'],
 ['thread_spool','线轴','lc9_craft_table',-735,-438,34,36,'裁缝铺左边的手作台上，一卷蓝线正等着收好。','west_gardening_corner'],
 ['brass_key','小铜钥匙','lc9_craft_table',-635,-445,40,26,'裁缝铺左边的手作台上，打开蓝色收纳盒看看。','west_gardening_corner','trinket_box'],
 ['lemonade_bottle','柠檬汽水','lc9_refreshment_cart',520,-431,30,44,'东侧住宅上方的小茶点车上，有瓶还没开封的柠檬汽水。','east_fountain_rest'],
 ['lemon_candy','柠檬糖','lc9_refreshment_cart',605,-444,40,27,'小茶点车上的圆铁盒里，留着一颗柠檬糖。','east_fountain_rest','biscuit_tin'],
];
const targetIds=new Set(rows.map(r=>r[0]));
b.hiddenObjectSlots=b.hiddenObjectSlots.filter(t=>!targetIds.has(t.id));
for(const[id,label,supportArtSlotId,x,y,width,height,clue,lifeGroupId,container]of rows)b.hiddenObjectSlots.push({id,label,supportArtSlotId,at:{x,y},visualWorldSize:{width,height},clickRadiusWorld:32,semanticContext:clue,clue,lifeGroupId,occlusionTargetFraction:0,canBeSeenAtInitialZoom:false,generatedSourceBatch:'ai_image_v9',placementReview:pending,...(container?{visibleCondition:{objectId:container,state:'opened'}}:{})});
b.interactiveSlots=b.interactiveSlots.filter(s=>!['biscuit_tin','trinket_box'].includes(s.id));
for(const[id,label,support,x,y,size]of [['biscuit_tin','点心铁盒','lc9_refreshment_cart',605,-449,80],['trinket_box','蓝色收纳盒','lc9_craft_table',-635,-449,82]]){
 const s=b.artSlots.find(s=>s.id===support);b.interactiveSlots.push({id,label,supportArtSlotId:support,at:{x,y},visualWorldSize:{width:size,height:size},depthY:s.footY-.5,generatedSourceBatch:'ai_image_v9'});
}
const actors=['messenger_customer','crossing_shopper','chestnut_seller','lantern_watcher','flower_buyer','lane_child'];
for(const n of b.npcPlans.filter(n=>actors.includes(n.id))){n.generatedSourceBatch='ai_image_v9';n.generatedSourceId=`chicken_${n.id}_sheet_v9`;if(n.id==='messenger_customer')n.idleActions=['inspect_letter','short_pause'];}
b.sceneEvents=b.sceneEvents.filter(e=>!['flower_scent','child_wave'].includes(e.id));
for(const[id,npcId]of [['flower_scent','flower_buyer'],['child_wave','lane_child']])b.sceneEvents.push({id,trigger:{npcId,waypointIndex:0},tapTriggerNpcId:npcId,participants:[npcId],repeat:true,cooldownSeconds:8,resumeRouteAfterSeconds:1.6,discoveryId:id,actorBeats:[{npcId,clip:'receive_w',atSeconds:0,durationSeconds:1.6,facing:1}]});
b.npcClues.flower_buyer=['你闻闻，\n像不像刚下过雨？','这束想放在窗边，\n早上起来就能看见。'];
b.npcClues.lane_child=['嘿，你也在散步呀！','我刚走到街角，\n又想回来看看。'];
b.sceneDiscoveries=b.sceneDiscoveries.filter(d=>!['snack_cart_pause','craft_table_pause'].includes(d.id));
b.sceneDiscoveries.push({id:'snack_cart_pause',supportArtSlotId:'lc9_refreshment_cart',at:{x:565,y:-495},clickRadiusWorld:30,message:'街坊留了些茶点，\n路过就歇歇脚吧。'},
 {id:'craft_table_pause',supportArtSlotId:'lc9_craft_table',at:{x:-680,y:-502},clickRadiusWorld:30,message:'布料刚裁了一半，\n主人一会儿就回来。'});
for(const g of b.lifeGroups??[]){g.artSlotIds=g.artSlotIds.filter(id=>!id.startsWith('lc9_'));g.artSlotIds.push(...newSlots.filter(s=>s.lifeGroupId===g.id).map(s=>s.id));}
b.layoutVersion='street_polish_v9';b.status='v9_generated_asset_candidate';
b.contentPlan={...b.contentPlan,currentProductionId:'ai_image_v9',scenePlacementCount:b.artSlots.length,targetCount:b.hiddenObjectSlots.length,revealCount:b.interactiveSlots.length,renewedOriginalResidents:actors};
b.reviewGates.status='V9 authored candidate, 65 scene slots, 11 buildings, 16 residents, 32 targets, 8 reveals. Actual PNG placement and runtime verification pending.';
fs.writeFileSync(file,JSON.stringify(b,null,2)+'\n');console.log(JSON.stringify({slots:b.artSlots.length,targets:b.hiddenObjectSlots.length,reveals:b.interactiveSlots.length,residents:b.npcPlans.length}));
