// Record the visual inspection of actual generator outputs, not visual approval.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/ai_image_v8',review='art/review/ai_image_v8';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const generation=read(`${base}/generation_record.json`),production=read(`${base}/production_manifest.json`);
const active=new Set(production.assets.map(a=>a.source.split('/').pop().replace(/\.png$/,'')));
const observed={
 courtyard_books_v8:['Complete flush warm-gray paved patch; quiet broad stone shapes; no baked people, furniture or building.'],
 courtyard_flowers_v8:['Complete flat terracotta brick patch; all outer edges transparent; no upright platform faces.'],
 courtyard_tea_v8:['Cream irregular coplanar stone patch; no table, cup or people baked in.'],
 courtyard_sweets_v8:['Pale cream and coral coplanar paving; independently placed below the sweets facade.'],
 courtyard_noodles_v8:['Dusty blue-gray quiet paved patch; no props or raised side faces.'],
 courtyard_sage_v8:['Pale earth apron with a few complete cream stepping stones; broad uncluttered shapes.'],
 courtyard_rose_v8:['Warm pale terracotta courtyard apron; transparent irregular edge, no baked laundry or residents.'],
 flower_border_v8:['Low three-mound flower strip, complete coral/cream/lavender flowers, no baked ground or planter.'],
 shrub_clump_v8:['Low two-mound leafy shrub, clear silhouette, no baked ground; generated near-transparent matte cleaned by alpha floor only.'],
 low_garden_fence_v8:['Four complete low rounded pickets with small end posts; no gate, planted scenery or ground.'],
 targets_tools_v8:['Four complete separate identifiable clay bird whistle, thimble, ribbon knot and tongs; solid fills replace old fragmented texture.'],
 targets_keepsakes_v8:['Four complete separate watch, scissors, horizontal blue feather and envelope. Actual first row crosses requested 512px split; mechanical split uses the clear gutter at y=580 to preserve complete silhouettes.'],
 targets_pantry_v8:['Four complete separate horizontal honey dipper, seed packet, apple and bun; clear primary color areas and sparse details.'],
 chicken_tea_vendor_sheet_v8:['Same coral-apron sage-headscarf chicken in four cells; two idle poses and two visibly different offer poses with one cup; complete feet.'],
 chicken_tea_regular_sheet_v8:['Ten figures retain sage cap and blue waistcoat; north rear view has no face; north/south footsteps alternate, two sip poses. Initial side pair lifts the same screen-right foot, so this source is retained as an unused candidate.'],
 chicken_tea_regular_sheet_walkfix_v8:['Selected edited sheet changes the lower side-step to a lifted screen-left foot. Real alternating side, north and south pairs; same outfit and cup; two sip poses, true rear view without face.'],
};
const sources=generation.sources.map(s=>{assert.equal(hash(s.source),s.sourceSha256);assert.ok(observed[s.id],`Unreviewed source ${s.id}`);
 return {id:s.id,source:s.source,sha256:s.sourceSha256,status:active.has(s.id)?'selected_runtime_trial_unapproved':'superseded_animation_candidate_unapproved',observations:observed[s.id]};});
const report={batchId:'ai_image_v8',reviewStatus:'source_visual_review_recorded',checkedSources:sources.length,activeSources:active.size,
 playerVisualApproval:'pending',reviewedSourceIds:sources.map(s=>s.id),activeSourceIds:[...active],sources,
 processing:{grounds:'Only the seven flat ground Alpha bounding boxes are mechanically resampled to authored footprints with a 4px transparent inset; generated stones are not repainted.',
 targets:'Individual generated objects cropped to independent PNGs. Transparent output canvas follows existing visualWorldSize ratio; object itself is scaled proportionally. HUD uses image aspect ratio.',
 characters:'Shared whole-sheet scale to maximum painted height186; complete generated figures cropped proportionally, canvas384x256, footpoint(192,215). Rounded cell boundaries preserve non-divisible actual source dimensions.'},
 limitations:['Source inspection is not game runtime verification or player visual approval.','Remaining six original residents and both later chapters retain their transitional v4 artwork.']};
fs.mkdirSync(review,{recursive:true});fs.writeFileSync(`${review}/source_review.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.reviewStatus,sources:sources.length,active:active.size,playerVisualApproval:'pending'}));
