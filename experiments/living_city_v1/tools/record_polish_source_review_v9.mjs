// Record inspection and immutable provenance of actual built-in generator outputs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v9',review='art/review/ai_image_v9';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const g=read(`${base}/generation_record.json`),p=read(`${base}/production_manifest.json`),jobs=read(`${base}/generation_plan.json`).jobs;
const active=new Set(p.assets.map(a=>a.source));
const notes={
 chicken_messenger_customer_sheet_v9:'Unused initial candidate: both side-walk cells lift the same foot.',
 chicken_crossing_shopper_sheet_v9:'Unused initial candidate: side and front walk pairs repeat the raised foot.',
 chicken_flower_buyer_sheet_v9:'Unused initial candidate: both side-walk cells lift the same foot.',
 chicken_messenger_customer_sheet_walkfix_v9:'Selected edit: lower side cell raises the opposite foot. Same postal cap, waistcoat and satchel. True rear view; front and side walk pairs alternate. Envelope only in job cells.',
 chicken_crossing_shopper_sheet_walkfix_v9:'Selected edit: lower side and front cells raise opposite feet. Same basket and waistcoat across the sheet; true rear view without a face.',
 chicken_flower_buyer_sheet_walkfix_v9:'Selected edit: alternating side steps, true rear and front pairs; same headscarf, apron and flowers. Two flower-smelling job poses.',
 chicken_lane_child_sheet_v9:'Same red scarf and small cream chicken; alternating side, front and rear steps; two different waving poses. Idle pair is near-identical, so no distinct painted breathing motion is claimed.',
 chicken_chestnut_seller_sheet_v9:'Four complete brown-cap/ochre-apron figures, two resting and two bowl-working poses. Stationary actor; no walking clip invented.',
 chicken_lantern_watcher_sheet_v9:'Four complete blue-cap/lavender-cape figures, resting and waving poses. Stationary actor; no walking clip invented.',
 refreshment_cart_v9:'Complete pale wood cart with sage wheels, lemon pictogram, restrained flowers and clear countertop. No baked findable bottle or candy.',
 craft_table_v9:'Complete low wood tabletop with blue legs, cloth at rear and fabric rolls below; broad clear work surface.',
 post_kiosk_v9:'Complete blue-roof cream postal facade and envelope pictogram; no lettering or baked people.',
 tailor_rack_v9:'Complete wooden rack, coral hanging cloth and blue folded fabric. Independent transparent asset.',
 tailor_goods_v9:'Complete low bench with green floral and coral check cloth, clear front work edge.',
 everyday_targets_v9:'Four complete pen, paper boat, knit hat and enamel mug. Row boundary at y=450 preserves hat pompom; no repainting.',
 craft_snack_targets_v9:'Four complete thread spool, key, bottle and wrapped lemon candy. Row boundary at y=490 preserves bottle cap.',
 biscuit_tin_states_v9:'Matching closed/opened round floral tin. Empty open cavity allows separately loaded candy.',
 trinket_box_states_v9:'Matching closed/opened blue floral box, same base; empty open cavity allows separate key.'
};
fs.mkdirSync(`${base}/references`,{recursive:true});
const sources=g.sources.map(s=>{
 assert.ok(notes[s.id]);assert.equal(hash(s.source),s.sourceSha256);assert.equal(hash(s.originalToolOutput),s.sourceSha256);
 const j=jobs.find(j=>j.id===s.id);
 s.references=j.references.map((original,i)=>{const h=hash(original),copy=`${base}/references/${h.slice(0,12)}_${path.basename(original)}`;fs.copyFileSync(original,copy);assert.equal(hash(copy),h);return{index:i+1,original,path:copy,sha256:h};});
 return{id:s.id,source:s.source,sha256:s.sourceSha256,status:active.has(s.source)?'selected_runtime_trial_unapproved':'superseded_animation_candidate_unapproved',observations:[notes[s.id]],references:s.references};
});
const report={batchId:'ai_image_v9',reviewStatus:'source_visual_review_recorded',checkedSources:sources.length,activeSources:active.size,playerVisualApproval:'pending',sources,
 processing:{scene:'Only crop alpha bounds, scale proportionally, and pad with transparent pixels.',targets:'Transparent output canvas follows world-size aspect ratio; generated object scales proportionally. Explicit blank row gutters preserve complete silhouettes.',characters:'Find transparent sheet gutters; crop complete figures; one sheet scale, 384x256 canvas and footpoint (192,215). No flipped pixels or redrawn anatomy.',interactions:'Common scale and bottom registration across opened/closed states; original generated cavity preserved.'},
 limitations:['Inspection is not player visual approval.','Eight v7 residents and two v8 tea residents remain in their existing generated batches; later chapters retain v4 transition art.','Small differences between generated animation poses remain; no continuous hand-drawn animation claim.']};
fs.mkdirSync(review,{recursive:true});fs.writeFileSync(`${review}/source_review.json`,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(`${base}/generation_record.json`,JSON.stringify(g,null,2)+'\n');
console.log(JSON.stringify({sources:sources.length,activeSources:active.size,referenceCopies:sources.reduce((n,s)=>n+s.references.length,0)}));
