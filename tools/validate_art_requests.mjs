import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const project = path.resolve(import.meta.dirname, '..');
const requests = path.join(project, 'art_requests');
const globalManifest = JSON.parse(fs.readFileSync(path.join(project, 'art/asset_manifest.json'), 'utf8'));
const snake = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const headings = ['【任务类型】', '【项目背景】', '【统一风格】', '【本批次目标】', '【数量】',
    '【输出规格】', '【逐项任务】', '【一致性要求】', '【禁止项】', '【验收标准】', '【最终执行要求】'];
const manifestsByBatch = new Map();
const batchesByAssetId = new Map();
let batches = 0;
let assets = 0;

for (const entry of fs.readdirSync(requests, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const folder = path.join(requests, entry.name);
    const get = name => fs.readFileSync(path.join(folder, name), 'utf8');
    const prompt = get('01_WEB_PROMPT.md');
    const manifest = JSON.parse(get('02_MANIFEST.json'));
    const acceptance = get('03_ACCEPTANCE.md');
    assert.equal(manifest.batchId, entry.name, `${entry.name}: batch ID mismatch`);
    assert.match(entry.name, snake);
    if (manifest.revisionOf !== undefined) {
        assert.match(manifest.revisionOf, snake, `${entry.name}: invalid revisionOf batch ID`);
    }
    manifestsByBatch.set(entry.name, manifest);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.styleId, globalManifest.styleId);
    assert.ok(manifest.total > 0 && Number.isInteger(manifest.total));
    assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
    assert.equal(manifest.assets.reduce((sum, item) => sum + item.quantity, 0), manifest.total);
    for (const heading of headings) assert.ok(prompt.includes(heading), `${entry.name}: missing ${heading}`);
    assert.ok(prompt.replace(/\*\*/g, '').includes('实际生成图片'),
        `${entry.name}: image generation instruction missing`);
    assert.ok(prompt.includes('Generation Spec') && prompt.includes('Final Game Asset Spec'),
        `${entry.name}: source and final specifications are not distinct`);
    assert.ok((acceptance.match(/- \[ \]/g) ?? []).length >= 8,
        `${entry.name}: acceptance checklist is incomplete`);
    assert.ok(!/\{(?:replace_|filename|具体|游戏角色)/.test(prompt), `${entry.name}: template placeholders remain`);
    if (manifest.referencesRequired) {
        assert.ok(fs.existsSync(path.join(folder, '04_REFERENCES.md')), `${entry.name}: missing references guide`);
        assert.ok(Array.isArray(manifest.referenceUploads) && manifest.referenceUploads.length > 0);
        const instructions = get('04_REFERENCES.md');
        for (const reference of manifest.referenceUploads) {
            assert.ok(instructions.includes(reference.filename) && prompt.includes(reference.filename),
                `${entry.name}: reference ${reference.filename} missing from prompt or upload guide`);
            assert.ok(reference.path && fs.existsSync(path.join(project, reference.path)),
                `${entry.name}: local approved reference file missing: ${reference.filename}`);
            assert.ok(globalManifest.assets.some(asset => asset.filename === reference.filename &&
                asset.status === 'approved'),
            `${entry.name}: reference ${reference.filename} has not been approved in art/asset_manifest.json`);
        }
    } else {
        assert.deepEqual(manifest.referenceUploads, []);
        assert.ok(!fs.existsSync(path.join(folder, '04_REFERENCES.md')),
            `${entry.name}: unnecessary references guide contradicts manifest`);
        assert.ok(prompt.includes('无需') || prompt.includes('不需要'),
            `${entry.name}: prompt must say that no reference upload is needed`);
    }
    const localIds = new Set();
    for (const item of manifest.assets) {
        assert.match(item.id, snake);
        assert.ok(!localIds.has(item.id), `${entry.name}: duplicate asset ID within batch: ${item.id}`);
        localIds.add(item.id);
        if (!batchesByAssetId.has(item.id)) batchesByAssetId.set(item.id, []);
        batchesByAssetId.get(item.id).push(entry.name);
        assert.equal(item.filename, `${item.id}.${item.finalGameAssetSpec.format.toLowerCase()}`);
        assert.ok(prompt.includes(item.id) && prompt.includes(item.filename), `${entry.name}: asset absent from prompt`);
        assert.ok(item.description?.trim() && item.category?.trim());
        assert.ok(item.quantity > 0 && Number.isInteger(item.quantity));
        assert.equal(typeof item.transparent, 'boolean');
        assert.ok(/^\d+:\d+$/.test(item.aspectRatio));
        assert.ok(/^\d+x\d+$/.test(item.generationSize));
        assert.equal(item.generationSize, item.generationSpec.recommendedSize);
        assert.ok(item.safeMarginPercent >= 0 && item.safeMarginPercent < 50);
        assert.equal(item.targetGameSize, item.finalGameAssetSpec.targetGameSize);
        assert.ok(item.targetGameSize === null || /^\d+x\d+$/.test(item.targetGameSize));
        assert.equal(item.finalGameAssetSpec.postProcessingOwner, 'Codex');
        assets += item.quantity;
    }
    batches++;
}

const visiting = new Set();
const visited = new Set();
function validateRevisionChain(batchId) {
    if (visited.has(batchId)) return;
    assert.ok(!visiting.has(batchId), `${batchId}: revisionOf cycle detected`);
    visiting.add(batchId);
    const parentId = manifestsByBatch.get(batchId).revisionOf;
    if (parentId !== undefined) {
        assert.ok(manifestsByBatch.has(parentId), `${batchId}: revisionOf batch does not exist: ${parentId}`);
        validateRevisionChain(parentId);
    }
    visiting.delete(batchId);
    visited.add(batchId);
}
for (const batchId of manifestsByBatch.keys()) validateRevisionChain(batchId);

for (const [assetId, batchIds] of batchesByAssetId) {
    if (batchIds.length === 1) continue;
    const roots = batchIds.filter(batchId => manifestsByBatch.get(batchId).revisionOf === undefined);
    assert.equal(roots.length, 1,
        `Duplicate asset ID ${assetId}: expected one original batch and explicit revisions`);
    for (const batchId of batchIds) {
        if (batchId === roots[0]) continue;
        const parentId = manifestsByBatch.get(batchId).revisionOf;
        assert.ok(batchIds.includes(parentId),
            `Duplicate asset ID ${assetId}: ${batchId} must revise a batch containing that asset`);
    }
}
assert.ok(batches > 0, 'No concrete art requests were found');
console.log(`Art request validation passed: ${batches} batch, ${assets} asset(s), all required sections and manifests consistent.`);
