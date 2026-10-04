// Persist actual regeneration instructions for existing residents only.
import fs from 'node:fs';
const root='E:/workspace/chriken/experiments/living_city_v1',base='art/production/ai_image_v12',bundle='assets/bundles/city_living_city_street_block_01',read=f=>JSON.parse(fs.readFileSync(f));
const b=read('design/street_block_01.json'),jobs=[];
for(const n of b.npcPlans){
 const m=read(`${bundle}/cels/${n.id}/manifest.json`),moving=!!m.clips.walk_nw,vertical=!!m.clips.walk_n&&!!m.clips.walk_ne;
 const rows=vertical?5:moving?3:2;
 const refNames=[m.clips.idle_w[0].asset,m.clips.receive_w[0].asset];
 const rowsText=[
 'ROW 1: four genuine expressive idle poses: 1 relaxed open eyes and small smile; 2 eyes half closed starting a blink; 3 fully closed eyelids and gentle happy cheeks; 4 open eyes looking slightly up with a curious head tilt and friendly beak smile. Both feet on the same baseline.',
 ...(moving?['ROW 2: FOUR ordered RIGHT-facing SIDE-VIEW WALK phases: 1 left foot forward contacting ground and right foot behind; 2 body passes over left planted foot, right foot bending and swinging through; 3 right foot forward contacting ground and left foot behind; 4 body passes over right planted foot, left foot bending and swinging through. Four different leg silhouettes, both legs anatomically clear, slight head/body bob, never merely four duplicates.']:[]),
 ...(vertical?['ROW 3: FOUR NORTH walking phases, true BACK VIEW, back of head/clothes/tail, NO visible eyes or beak. Left contact, right foot passing, right contact, left foot passing.','ROW 4: FOUR SOUTH walking phases, true FRONT VIEW, both eyes visible. Left contact, right foot passing, right contact, left foot passing.']:[]),
 `ROW ${rows}: FOUR stages of the SAME job/gesture shown in reference 2: preparation, movement halfway, full gesture with an engaged happy expression, relaxed finish. Keep exactly the same prop and role. Do not invent a new activity or object.`
 ];
 const prompt=`Generate a production animation sprite sheet for this ONE EXISTING chicken resident. Reference 1 is the exact character identity, outfit, body proportion and hand-drawn style to preserve. Reference 2 is the exact existing job gesture and prop to animate; keep its identity. No new character or game content. Cozy 2D cartoon, cream feathers, same cap/scarf/clothing/props as references, soft low saturation colours, clean fine warm-brown outlines and restrained flat shading. No glossy lighting, extra clothing or realistic feathers.\nExactly FOUR columns and ${rows} rows, ${4*rows} complete full-body frames, evenly spaced cells. EVERY cell is the SAME character at the SAME scale, feet near an identical baseline inside each cell. Give each cell 15% transparent margin on all sides and generous fully empty gutters. Full head, wings, props, and both feet must remain inside each cell.\n${rowsText.join('\n')}\nOnly character animation frames, genuine transparent alpha background. No grid lines, labels, text, ground, shadow, glow or border. Preserve small recognizable expressions at mobile scale. Wings remain feather wings, never human fingers. Clear intermediate poses, not two repeated drawings. Sprite sheet will be mechanically cropped and uniformly registered without repainting.`;
 jobs.push({id:`chicken_${n.id}_motion_v12`,actor:n.id,stage:'character',columns:4,rows,moving,vertical,references:refNames.map(name=>`${root}/${bundle}/cels/${n.id}/${name}.png`),prompt});
}
fs.mkdirSync(`${base}/prompts`,{recursive:true});fs.mkdirSync(`${base}/sources`,{recursive:true});fs.mkdirSync(`${base}/previous_manifests`,{recursive:true});
for(const j of jobs){fs.writeFileSync(`${base}/prompts/${j.id}.md`,j.prompt+'\n');const dest=`${base}/previous_manifests/${j.actor}.json`;if(!fs.existsSync(dest))fs.copyFileSync(`${bundle}/cels/${j.actor}/manifest.json`,dest);}
fs.writeFileSync(`${base}/generation_plan.json`,JSON.stringify({batchId:'ai_image_v12',scope:'existing_scene_resolution_and_existing_resident_motion_only',jobs},null,2)+'\n');
if(!fs.existsSync(`${base}/baseline_blueprint.json`))fs.copyFileSync('design/street_block_01.json',`${base}/baseline_blueprint.json`);
console.log(JSON.stringify({residents:jobs.length,frames:jobs.reduce((n,j)=>n+j.rows*4,0),jobs}));
