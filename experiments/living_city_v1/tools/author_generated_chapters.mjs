// Authored level layout and gameplay data. No raster/vector drawing.
import fs from 'node:fs';
const base=JSON.parse(fs.readFileSync('design/street_block_01.json','utf8'));
const point=(x,y)=>({x,y});
function chapter(id,name,index){return {schemaVersion:1,id,name,chapterIndex:index,map:{width:1536,height:2048},
 camera:{minZoom:1,maxZoom:2.25,initialZoom:1.4,initialFocus:point(-180,180)},
 artSlots:[],hiddenObjectSlots:[],interactiveSlots:[],npcPlans:[],npcClues:{},sceneEvents:[],
 walkableRegions:[{id:'main_lane',access:'public',polygon:[[-170,-960],[170,-960],[170,960],[-170,960]]}],
 physicalFootprints:[],standingSpots:[]};}
function slot(c,id,source,x,y,w,h,layer='depth',footY=y-h/2+4){
 c.artSlots.push({id:`lc_${id}`,source,center:point(x,y),size:{width:w,height:h},layer,
 ...(layer==='depth'?{footY}:{}),alpha:layer!=='ground'});return `lc_${id}`;
}
function item(c,id,label,x,y,support,clue,condition){c.hiddenObjectSlots.push({id,label,at:point(x,y),
 supportArtSlotId:`lc_${support}`,semanticContext:clue,clue,clickRadiusWorld:36,
 visualWorldSize:{width:38,height:36},...(condition?{visibleCondition:{objectId:condition,state:'opened'}}:{})});}
function reveal(c,id,label,x,y,w,h,support){c.interactiveSlots.push({id,label,at:point(x,y),
 visualWorldSize:{width:w,height:h},supportArtSlotId:`lc_${support}`,depthY:y-h/2-4});}
function cast(c,harbor=false){
 const routes=harbor?[
 [[-120,-650],[-120,-180],[-150,160],[-145,520],[-120,790]],
 [[215,-230]],[[110,-480],[100,-120],[110,320],[110,680],[100,120]],
 [[250,-490]],[[30,510]],[[-250,40],[-200,130],[-250,40]],
 [[-110,-590],[-100,-230],[-115,200],[-100,-230]],[[40,-180],[30,160],[60,410],[40,170]]
 ]:[
 [[-120,-630],[-125,-240],[-130,120],[-125,570],[-110,810]],
 [[-420,400]],[[100,-500],[120,-170],[100,130],[120,650],[100,130]],
 [[240,-120]],[[10,470]],[[-220,80],[-230,190],[-220,80]],
 [[-110,-560],[-100,-210],[-110,150],[-100,-210]],[[30,-160],[45,160],[20,460],[45,160]]
 ];
 c.npcPlans=base.npcPlans.map((p,i)=>({...p,route:routes[i].map(([x,y])=>point(x,y)),
 loop:i!==0&&routes[i].length>1,speedWorldUnitsPerSecond:i===0?95:55+i*3,
 pauseSecondsAtWaypoints:{'1':1.2,'2':1.6}}));
}
const garden=chapter('living_city_garden_market_02','花园集市',2);
slot(garden,'garden_ground','garden_ground',0,0,1536,2048,'ground');
slot(garden,'greenhouse','garden_greenhouse',-500,640,490,500,'building_back');
slot(garden,'flower_shop','garden_flower_shop',490,530,455,510,'building_back');
slot(garden,'garden_cafe','shop_red',-505,-580,420,460,'building_back');
slot(garden,'garden_workshop','pottery_annex',510,-550,340,360,'building_back');
slot(garden,'garden_barn','grain_house',490,-860,370,280,'building_back');
slot(garden,'herb_workstand','herb_stand',-330,420,185,225);
slot(garden,'flower_display','flower_display',-335,-120,210,190);
slot(garden,'orchard_produce','produce_display',350,155,185,170);
slot(garden,'tea_table','tea_patio',340,-90,200,160);
slot(garden,'garden_bench','town_bench',-465,-330,230,115);
slot(garden,'tool_crates','wood_crates',-330,-820,165,145);
slot(garden,'hat_basket','wood_crates',320,-615,170,155);
slot(garden,'garden_sign','town_signpost',-190,600,85,165);
slot(garden,'garden_tree_west','town_tree',-585,120,260,350);
slot(garden,'garden_tree_east','town_tree',660,-130,220,310);
slot(garden,'flower_pots_nw','flower_pot',-675,550,125,240,'street_back');
slot(garden,'flower_pots_ne','flower_pot',675,470,120,235,'street_back');
slot(garden,'flower_pots_sw','flower_pot',-665,-615,115,220,'street_back');
slot(garden,'flower_pots_se','flower_pot',680,-790,110,215,'street_back');
slot(garden,'garden_cart','town_handcart',-360,60,180,130);
slot(garden,'garden_fountain','water_station',330,-390,140,195);
slot(garden,'garden_pottery','pottery_display',470,-730,145,140);
slot(garden,'flower_rack','tailor_rack',480,310,145,180);
slot(garden,'garden_lantern','lantern_post',320,700,110,240);
slot(garden,'garden_pennants','street_pennants',20,755,450,55,'overhead');
item(garden,'watering_can','浇水壶',-320,449,'herb_workstand','温室外的小工作台，有人刚浇完花。');
item(garden,'garden_gloves','园艺手套',-465,-316,'garden_bench','长椅上留着一双软软的手套。');
item(garden,'garden_trowel','小花铲',-330,-805,'tool_crates','先打开咖啡店旁的工具箱。','parcel_chest');
item(garden,'rose_bloom','玫瑰花',-337,-105,'flower_display','花摊的叶子下，藏着一朵特别的花。','flower_leaves');
item(garden,'yellow_pear','黄梨',352,185,'orchard_produce','水果篮里，找找像小葫芦的果子。');
item(garden,'honey_jar','蜂蜜罐',352,-63,'tea_table','喝茶的桌上，有一罐甜甜的东西。');
item(garden,'garden_key','温室钥匙',-513,440,'greenhouse','温室门槛旁，有把叶形的小钥匙。');
item(garden,'butterfly_badge','蝴蝶徽章',-186,650,'garden_sign','路牌上停着一只不会飞的蝴蝶。');
item(garden,'ribbon_spool','丝带卷',480,360,'flower_rack','花店外的货架上，找一卷紫色丝带。');
item(garden,'straw_hat','草帽',320,-590,'hat_basket','掀开南边藤篮的盖子，再看看里面。','bun_lid');
item(garden,'acorn','小橡果',-573,-45,'garden_tree_west','大树根旁的草地上，藏着一颗橡果。');
item(garden,'lavender_sachet','香草袋',500,-820,'garden_barn','南边的小屋窗口，有一只紫色香袋。');
reveal(garden,'parcel_chest','打开工具箱',-330,-818,110,98,'tool_crates');
reveal(garden,'flower_leaves','拨开花叶',-337,-108,100,90,'flower_display');
reveal(garden,'bun_lid','掀开藤篮',320,-600,100,82,'hat_basket');
garden.npcClues={tea_vendor:'温室钥匙还没还回去，\n也许落在门槛旁。',flower_buyer:'花叶里有一朵玫瑰，\n轻轻拨开就能看见。',lantern_watcher:'路牌上的蝴蝶只是徽章，\n它可不会飞走。',chestnut_seller:'工具箱里的小花铲，\n可以帮我们种新花。'};
cast(garden);
const harbor=chapter('living_city_harbor_walk_03','河畔码头',3);
harbor.camera.initialFocus=point(-210,290);
slot(harbor,'harbor_ground','harbor_ground',0,0,1536,2048,'ground');
slot(harbor,'ferry_house','harbor_ferry_house',-332,590,300,330,'building_back');
slot(harbor,'boathouse','harbor_boathouse',480,650,430,450,'building_back');
slot(harbor,'harbor_cafe','shop_blue',-332,-610,300,340,'building_back');
slot(harbor,'harbor_bakery','shop_bakery',510,-520,425,455,'building_back');
slot(harbor,'harbor_post','post_house',465,-875,390,270,'building_back');
slot(harbor,'quay_tree','town_tree',650,200,240,325);
slot(harbor,'ferry_lantern','lantern_post',-205,610,85,215);
slot(harbor,'quay_lantern','lantern_post',300,-600,105,245);
slot(harbor,'harbor_bench','town_bench',-350,135,225,120);
slot(harbor,'harbor_tea_table','tea_patio',350,130,200,165);
slot(harbor,'harbor_food_cart','bun_cart',315,-160,175,230,'street_back');
slot(harbor,'captain_crate','wood_crates',375,-535,155,145);
slot(harbor,'quay_flowers','flower_display',-320,-270,190,165);
slot(harbor,'dock_rope_goods','wood_crates',-387,-530,150,150);
slot(harbor,'harbor_pottery','pottery_display',350,-755,180,180);
slot(harbor,'quay_handcart','town_handcart',-315,360,180,135);
slot(harbor,'ferry_sign','town_signpost',190,310,85,160);
slot(harbor,'harbor_water','water_station',350,375,125,175);
slot(harbor,'pier_crates','wood_crates',-390,-740,155,155);
slot(harbor,'ferry_vine','flower_pot',-435,510,80,150,'street_back');
slot(harbor,'boathouse_vine','flower_pot',670,565,110,220,'street_back');
slot(harbor,'harbor_cafe_vine','flower_pot',-445,-615,85,170,'street_back');
slot(harbor,'quay_pennants','street_pennants',20,45,470,65,'overhead');
slot(harbor,'harbor_banner','street_banner',5,820,440,80,'overhead');
item(harbor,'seashell','贝壳',-330,-425,'quay_flowers','沿着花盆往河边看，有枚浅色贝壳。');
item(harbor,'compass','指南针',375,-518,'captain_crate','船长的箱子里，藏着一枚小指南针。','parcel_chest');
item(harbor,'boat_rope','船绳',-405,-494,'dock_rope_goods','河边的货箱上，找一圈船绳。');
item(harbor,'fishing_float','鱼漂',-315,393,'quay_handcart','搬货推车里，有个红白色的小鱼漂。');
item(harbor,'blue_mug','蓝杯子',365,162,'harbor_tea_table','露天茶桌上，找一只蓝色小杯子。');
item(harbor,'harbor_ticket','船票',-291,492,'ferry_house','候船小屋的窗口，留着一张小船票。');
item(harbor,'brass_bell','手摇铃',490,500,'boathouse','船屋门前，有个提醒开船的小铃铛。');
item(harbor,'starfish','海星',-320,-254,'quay_flowers','码头花叶下，还有一位五角的小客人。','flower_leaves');
item(harbor,'lemon','柠檬',315,-128,'harbor_food_cart','掀开点心车的盖子，找一颗柠檬。','bun_lid');
item(harbor,'folded_map','折叠地图',-350,149,'harbor_bench','候船长椅上，旅人忘记了自己的地图。');
item(harbor,'fish_charm','小鱼挂饰',355,-709,'harbor_pottery','陶器架上，有一条不能游泳的小鱼。');
item(harbor,'bottle_message','漂流瓶',-385,-701,'pier_crates','南边码头的木箱旁，有封装在瓶里的信。');
reveal(harbor,'parcel_chest','打开船长箱',375,-530,110,100,'captain_crate');
reveal(harbor,'flower_leaves','拨开码头花叶',-320,-258,105,95,'quay_flowers');
reveal(harbor,'bun_lid','掀开点心盖',315,-140,90,78,'harbor_food_cart');
harbor.npcClues={tea_vendor:'船票落在候船小屋，\n别误了下一班小船。',flower_buyer:'叶子下面有一颗海星，\n它正在这里歇脚。',lantern_watcher:'长椅上留着一张地图，\n河流弯弯很好认。',chestnut_seller:'我把指南针放进箱子里了，\n开盖看看就能找到。'};
cast(harbor,true);
for(const [file,c] of [['garden_market_02',garden],['harbor_walk_03',harbor]])fs.writeFileSync(`design/${file}.json`,JSON.stringify(c,null,2)+'\n');
console.log('Authored two distinct districts, 24 new targets and six reveals.');
