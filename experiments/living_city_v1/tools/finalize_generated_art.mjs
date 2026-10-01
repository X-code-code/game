// Publish verified provenance/status only. Never creates or changes image pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const base = 'art/production/ai_image_v4';
const runtimeReport = 'art/review/ai_image_v4/three_chapters/runtime_report.json';
const integrityReport = 'art/review/ai_image_v4/asset_integrity_report.json';
const runtime = read(runtimeReport), integrity = read(integrityReport), manifest = read(`${base}/production_manifest.json`);
assert.equal(runtime.status, 'passed'); assert.equal(integrity.status, 'passed');
assert.equal(runtime.chapters.length, 3); assert.equal(runtime.totalUniqueCollected, 36);
assert.equal(runtime.runtimeErrors.length + runtime.runtimeWarnings.length + runtime.failedRequests.length, 0);
assert.equal(integrity.runtimeRegistrations, manifest.assets.length);
for (const record of manifest.assets) {
    assert.equal(hash(record.output), record.sha256);
    assert.equal(hash(record.runtime), record.sha256);
    record.status = 'runtime_verified_visual_unapproved';
}
manifest.verification = { verifiedAt: new Date().toISOString(), runtimeReport, integrityReport,
    runtimeReportSha256: hash(runtimeReport), integrityReportSha256: hash(integrityReport),
    playerVisualApproval: 'pending', wechatPhone: 'not_run' };
write(`${base}/production_manifest.json`, manifest);
const global = read('art/asset_manifest.json');
global.styleId = manifest.styleId;
global.styleStatus = 'generated_runtime_verified_visual_approval_pending';
global.currentProductionId = 'ai_image_v4';
for (const old of global.assets) if (old.sourceType === 'codex_authored_2d_code' || old.id.startsWith('simple_ambient_')) {
    if (old.status !== 'rejected') old.status = 'superseded';
    old.runtimeAsset = false; old.supersededBy = 'ai_image_v4';
    if (old.id === 'clean_cartoon_v3' && !old.description.includes('current runtime artwork is ai_image_v4'))
        old.description += ' Historical production only; current runtime artwork is ai_image_v4.';
}
const record = { id: 'ai_image_v4', category: 'three_chapter_generated_png_batch',
    status: 'runtime_verified_visual_unapproved', sourceType: 'codex_builtin_image_gen',
    styleId: manifest.styleId, styleReferenceId: global.selectedStyleReferenceId,
    sourcePath: `${base}/sources/`, promptPath: `${base}/prompts/`,
    generationRecordPath: `${base}/generation_record.json`,
    idManifestPath: `${base}/production_manifest.json`, finalFolder: 'assets/generated/',
    assetCount: manifest.assets.length,
    counts: { generatedSources: integrity.generatedSources, finalPngFiles: integrity.finalPngFiles,
        sceneLayers: integrity.chapters.reduce((sum, city) => sum + city.sceneLayers, 0),
        hiddenObjects: 36, revealActions: 9, interactionStateImages: 18,
        residentDesigns: 8, uniqueNpcCels: 132, registeredNpcCels: 396 },
    chapters: integrity.chapters, reviewPath: integrityReport, runtimeReviewPath: runtimeReport,
    description: 'Built-in generated PNGs only, mechanically cropped/resized/registered, loaded by Cocos. Three chapters verified with actual pointer input, reloads and travel; player visual approval and WeChat device testing pending.' };
const index = global.assets.findIndex(asset => asset.id === record.id);
if (index < 0) global.assets.push(record); else global.assets[index] = record;
write('art/asset_manifest.json', global);
console.log(JSON.stringify({ status: record.status, chapters: 3, registeredPngs: record.assetCount }));
