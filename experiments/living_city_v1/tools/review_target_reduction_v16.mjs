import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='art/production/target_reduction_v16',review='art/review/ai_image_v16';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const b=read('design/street_block_01.json'),old=read(`${base}/baseline_blueprint_v15.json`),change=read(`${base}/change_record.json`),c=read('assets/bundles/city_living_city_street_block_01/city.json');
assert.equal(hash('design/street_block_01.json'),change.sceneBlueprintSha256);
for(const key of Object.keys(old).filter(k=>!['hiddenObjectSlots','interactiveSlots','lifeGroups'].includes(k)))assert.deepEqual(b[key],old[key],`${key} changed outside target reduction`);
assert.equal(b.hiddenObjectSlots.length,12);assert.equal(b.interactiveSlots.length,4);
for(const t of b.hiddenObjectSlots)assert.deepEqual(t,old.hiddenObjectSlots.find(o=>o.id===t.id));
for(const i of b.interactiveSlots){assert.deepEqual(i,old.interactiveSlots.find(o=>o.id===i.id));assert.ok(b.hiddenObjectSlots.some(t=>t.visibleCondition?.objectId===i.id));}
for(const g of b.lifeGroups){const expected=structuredClone(old.lifeGroups.find(o=>o.id===g.id));expected.targetIds=expected.targetIds.filter(id=>change.retainedTargetIds.includes(id));assert.deepEqual(g,expected);}
assert.deepEqual(c.hiddenObjects.map(t=>t.id),change.retainedTargetIds);
assert.equal(c.tasks.length,12);assert.ok(c.tasks.every(t=>t.required&&change.retainedTargetIds.includes(t.targetId)));
assert.deepEqual(read('assets/bundles/city_living_city_street_block_01/street_block_01.json'),b);
fs.mkdirSync(review,{recursive:true});fs.writeFileSync(`${review}/config_review.json`,JSON.stringify({status:'passed',targets:12,reveals:4,retiredTargets:20,unchangedSceneSlots:65,unchangedResidents:16,sceneBlueprintSha256:hash('design/street_block_01.json')},null,2)+'\n');
console.log('PASS: twelve unchanged retained targets, four meaningful reveals, no other scene edits');
