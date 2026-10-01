/** Idempotent authoring patch: keep existing geometry, add local details and search stories. */
import fs from 'node:fs';
const file = 'design/street_block_01.json';
const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
const originals = {
    tea_clay_whistle: ['陶哨', '茶摊的杯盏附近'],
    tailor_thimble: ['顶针', '裁缝铺的针线盘里'],
    banner_knot: ['绳结', '抬头看看街口的横幅'],
    chestnut_tongs: ['栗子夹', '栗子车上的纸包旁'],
};
for (const target of scene.hiddenObjectSlots) {
    if (originals[target.id]) [target.label, target.clue] = originals[target.id];
}
const additions = [
    ['pocket_watch', '怀表', '茶桌上，有位茶客忘了时间', 'lc_tea_patio_front', -402, 153, 29, 34],
    ['sewing_scissors', '剪刀', '裁缝的布料工作架上', 'lc_tailor_work_rack', -505, -306, 37, 29],
    ['blue_feather', '蓝羽毛', '长凳上有一片旅人的羽毛', 'lc_bench_front', -478, -176, 36, 22],
    ['sealed_letter', '信封', '南边邮舍的包裹箱，试着打开它', 'lc_south_post_house_back', -430, -826, 36, 26, 'parcel_chest'],
    ['honey_dipper', '蜜勺', '茶摊补给角的蜂蜜罐旁', 'lc_tea_delivery_nook', -347, -120, 34, 28],
    ['seed_packet', '种子袋', '花架的叶子后，拨开看看', 'lc_curb_flower_display', -337, -258, 30, 37, 'flower_leaves'],
    ['orchard_apple', '红苹果', '路边果蔬筐里的红果子', 'lc_curb_produce_east', 240, -230, 30, 31],
    ['golden_bun', '小包子', '热食车的蒸笼，掀开盖布', 'lc_east_bun_cart_back', 25, 581, 33, 28, 'bun_lid'],
];
for (const [id,label,clue,supportArtSlotId,x,y,width,height,interaction] of additions) {
    const target = { id, label, clue, supportArtSlotId, at: {x,y}, visualWorldSize: {width,height},
        clickRadiusWorld: 28, semanticContext: clue, occlusionTargetFraction: 0,
        canBeSeenAtInitialZoom: false,
        ...(interaction ? { visibleCondition: { objectId: interaction, state: 'opened' } } : {}) };
    const index = scene.hiddenObjectSlots.findIndex(item => item.id === id);
    if (index < 0) scene.hiddenObjectSlots.push(target); else scene.hiddenObjectSlots[index] = target;
}
scene.interactiveSlots = [
    {id:'parcel_chest',label:'打开包裹箱',supportArtSlotId:'lc_south_post_house_back',at:{x:-430,y:-835},visualWorldSize:{width:100,height:88},depthY:-886},
    {id:'flower_leaves',label:'拨开花叶',supportArtSlotId:'lc_curb_flower_display',at:{x:-337,y:-251},visualWorldSize:{width:76,height:85},depthY:-311},
    {id:'bun_lid',label:'掀开盖布',supportArtSlotId:'lc_east_bun_cart_back',at:{x:25,y:586},visualWorldSize:{width:76,height:62},depthY:469},
];
for (const [id,layer,x,y,width,height,purpose] of [
    ['lc_tea_flower_vine','street_back',-543,425,94,230,'Climbing tea-stall vine with cream blossoms, independent editable layer.'],
    ['lc_tailor_flower_vine','street_back',-600,-365,92,265,'Tailor doorway ivy and small terracotta flowering pots.'],
    ['lc_east_flower_vine','street_back',688,560,98,300,'Pottery shop timber-side climbing leaves with warm blossoms.'],
    ['lc_post_flower_vine','street_back',-650,-810,94,245,'Post-house doorway plants and soft flower clusters.'],
]) {
    const slot = {id,layer,center:{x,y},size:{width,height},alpha:true,purpose};
    const index = scene.artSlots.findIndex(item => item.id === id);
    if (index < 0) scene.artSlots.push(slot); else scene.artSlots[index] = slot;
}
scene.status = 'refined_2d_playable_candidate';
scene.reviewGates.status = '12 targets and 3 reveals; authored refinement pending runtime and player review.';
fs.writeFileSync(file, JSON.stringify(scene, null, 2) + '\n');
console.log(`Authored ${scene.artSlots.length} layers, ${scene.hiddenObjectSlots.length} targets and ${scene.interactiveSlots.length} reveals.`);
