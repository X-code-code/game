// Plan and record generated PNG exports. No drawing, image generation or pixel edits.
// Run only after the v5 generation record has finished receiving new tool outputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const BASE = 'art/production/ai_image_v5';
const OLD_BASE = 'art/production/ai_image_v4';
const BLUEPRINT = 'design/street_block_01.json';
const BUNDLE = 'assets/bundles/city_living_city_street_block_01';
const STYLE = 'cozy_flat_town_v5';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};

const NEW_SOURCES = {
    ground_paving: 'town_ground_wide_v5',
    west_storefront_back: 'shop_tea_v5',
    east_storefront_back: 'shop_blue_v5',
    west_tailor_back: 'shop_tailor_v5',
    east_food_shop_back: 'shop_bakery_v5',
    tea_counter_back: 'tea_stall_v5',
    bun_cart_back: 'bun_cart_v5',
    tree_front: 'town_tree_v5',
    bench_front: 'town_bench_v5',
    tea_patio_front: 'tea_patio_v5',
    curb_flower_display: 'flower_display_v5',
    curb_produce_east: 'produce_display_v5',
    crates_front: 'wood_crates_v5',
    street_water_station: 'water_station_v5',
    west_garden_tree_front: 'town_tree_v5',
    west_garden_bench_front: 'town_bench_v5',
    west_garden_flowers_front: 'flower_display_v5',
    east_courtyard_tree_front: 'town_tree_v5',
    east_courtyard_patio_front: 'tea_patio_v5',
    east_courtyard_water_front: 'water_station_v5',
};
const REUSED_NEW_EXPORTS = {
    west_garden_tree_front: 'town_tree_west_garden_v5',
    west_garden_bench_front: 'town_bench_west_garden_v5',
    west_garden_flowers_front: 'flower_display_west_garden_v5',
    east_courtyard_tree_front: 'town_tree_east_courtyard_v5',
    east_courtyard_patio_front: 'tea_patio_east_courtyard_v5',
    east_courtyard_water_front: 'water_station_east_courtyard_v5',
};

function sourceRecord(record, source) {
    return record.sources.find(item => slash(item.source) === slash(source));
}

function checkSource(record, file, prompt) {
    assert.ok(record, `No actual generation provenance for ${file}`);
    assert.ok(fs.existsSync(file), `Generated source missing: ${file}`);
    assert.ok(fs.existsSync(prompt), `Actual generation prompt missing: ${prompt}`);
    const sha256 = hash(file);
    assert.equal(sha256, record.sourceSha256 ?? record.sha256, `Source hash differs: ${file}`);
    assert.ok(record.originalToolOutput, `Original built-in tool output not recorded: ${file}`);
    if (record.originalToolOutputSha256) assert.equal(sha256, record.originalToolOutputSha256);
    // Original tool paths are machine-local. They can be checked here when they
    // exist; repository clones still retain their exact path and verified hash.
    if (fs.existsSync(record.originalToolOutput)) assert.equal(hash(record.originalToolOutput), sha256);
    return sha256;
}

function exportEntry(slot, source, prompt, extra = {}) {
    assert.match(slot.id, /^lc5_[a-z0-9_]+$/);
    assert.match(source, /^[a-z][a-z0-9_]*_v5$/);
    const { width, height } = slot.size;
    assert.ok(Number.isInteger(width) && Number.isInteger(height) && width > 8 && height > 8);
    const entry = { name: extra.name ?? source, source, prompt, stage: 'scene', width, height,
        align: 'bottom', runtime: `simple2d_scene/${slot.id}.png`, sceneSlotId: slot.id, ...extra };
    if (slot.layer === 'ground') Object.assign(entry, { transparent: false, keepFullCanvas: true });
    if (slot.layer === 'depth') {
        assert.ok(Number.isFinite(slot.footY), `Depth slot has no authored footY: ${slot.id}`);
        const y = height / 2 + slot.center.y - slot.footY;
        assert.ok(Number.isFinite(y) && y > 4 && y <= height, `Footpoint outside canvas: ${slot.id}`);
        entry.footpoint = { x: width / 2, y };
    }
    return entry;
}

function copyUnchanged(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination)) {
        assert.equal(hash(destination), hash(source), `Refusing to overwrite a different source/prompt: ${destination}`);
        return;
    }
    fs.copyFileSync(source, destination);
    assert.equal(hash(destination), hash(source), `Unchanged-copy check failed: ${destination}`);
}

function planScene() {
    const scene = read(BLUEPRINT);
    assert.equal(scene.id, 'living_city_street_block_01');
    assert.equal(scene.layoutVersion, 'street_screen_overhaul_v5_wide');
    assert.equal(scene.artSlots.length, 25, 'Wide Stage 1 must explicitly account for all 25 scene slots');
    const generation = read(`${BASE}/generation_record.json`);
    const oldGeneration = read(`${OLD_BASE}/generation_record.json`);
    const oldManifest = read(`${OLD_BASE}/production_manifest.json`);
    assert.equal(generation.batchId, 'ai_image_v5');
    const entries = [], copies = [], reusedSources = [];
    let newSourceCount = 0;
    for (const slot of scene.artSlots) {
        const key = slot.id.slice(4);
        if (NEW_SOURCES[key]) {
            const source = NEW_SOURCES[key], file = `${BASE}/sources/${source}.png`;
            const provenance = sourceRecord(generation, file);
            const prompt = provenance?.prompt;
            checkSource(provenance, file, prompt);
            entries.push(exportEntry(slot, source, prompt, { sourceBatch: 'ai_image_v5',
                ...(REUSED_NEW_EXPORTS[key] ? { name: REUSED_NEW_EXPORTS[key], reusedSceneSource: source } : {}) }));
            if (!REUSED_NEW_EXPORTS[key]) newSourceCount++;
            continue;
        }
        assert.equal(slot.reusedGeneratedSourceBatch, 'ai_image_v4', `Unknown new slot: ${slot.id}`);
        const oldRuntime = `${BUNDLE}/simple2d_scene/lc_${key}.png`;
        const previous = oldManifest.assets.find(asset => slash(asset.runtime) === oldRuntime);
        assert.ok(previous, `No previous generated scene source for ${oldRuntime}`);
        const provenance = sourceRecord(oldGeneration, previous.source);
        const sourceSha256 = checkSource(provenance, previous.source, previous.prompt);
        assert.equal(sourceSha256, previous.sourceSha256, `Previous import provenance differs: ${slot.id}`);
        const source = `legacy_${path.basename(previous.source, '.png')}_v5`;
        const file = `${BASE}/sources/${source}.png`, prompt = `${BASE}/prompts/${source}.md`;
        copies.push([previous.source, file], [previous.prompt, prompt]);
        const reused = { id: source, source: file, prompt,
            sourceType: 'codex_builtin_image_gen', sourceSha256,
            originalToolOutput: provenance.originalToolOutput,
            originalToolOutputSha256: sourceSha256,
            sourceSize: previous.sourceSize,
            reusedGeneratedSourceBatch: 'ai_image_v4', reusedSource: previous.source,
            reusedPrompt: previous.prompt, sourceGenerationRecordPath: `${OLD_BASE}/generation_record.json`,
            method: 'unchanged_copy_of_existing_builtin_image_gen_source_no_new_generation_call',
            status: 'reused_source_unapproved' };
        reusedSources.push(reused);
        entries.push(exportEntry(slot, source, prompt, { sourceBatch: 'ai_image_v4',
            reusedGeneratedSourceBatch: 'ai_image_v4', reusedSource: previous.source,
            reusedPrompt: previous.prompt }));
    }
    assert.equal(newSourceCount, 14);
    assert.equal(reusedSources.length, 5);
    assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
    // Validate every new output and source before writing any planned artifacts.
    for (const entry of entries) {
        assert.ok(!oldManifest.assets.some(asset => asset.output === `assets/generated/${entry.name}.png` ||
            slash(asset.runtime) === `${BUNDLE}/${entry.runtime}`), `Would overwrite v4 runtime art: ${entry.name}`);
    }
    for (const [source, destination] of copies) copyUnchanged(source, destination);
    for (const reused of reusedSources) {
        const index = generation.sources.findIndex(source => source.source === reused.source);
        if (index < 0) generation.sources.push(reused);
        else generation.sources[index] = reused;
    }
    generation.styleId = STYLE;
    generation.visualApproval = 'pending';
    generation.sceneExportPlan = { blueprint: BLUEPRINT, blueprintSha256: hash(BLUEPRINT),
        importPlanPath: `${BASE}/import_plan.json`, newGeneratedSceneSources: 14,
        unchangedHistoricalGeneratedSources: 5, repeatedNewSourceExports: 6, finalScenePngsPlanned: 25,
        sharedCharacterTargetUiBatch: 'ai_image_v4' };
    write(`${BASE}/generation_record.json`, generation);
    write(`${BASE}/import_plan.json`, { schemaVersion: 1, batchId: 'ai_image_v5',
        sourceType: 'codex_builtin_image_gen', styleId: STYLE, blueprint: BLUEPRINT,
        visualApproval: 'pending', assets: entries });
    const manifestFile = `${BASE}/production_manifest.json`;
    const manifest = fs.existsSync(manifestFile) ? read(manifestFile) : { assets: [] };
    assert.ok(Array.isArray(manifest.assets));
    // Retain the first narrower-ground export as history, while its runtime
    // registration is replaced by the separately generated wide ground.
    const retired = manifest.assets.filter(asset => asset.name === 'town_ground_v5');
    manifest.assets = manifest.assets.filter(asset => asset.name !== 'town_ground_v5');
    if (retired.length > 0) manifest.historicalExports = [
        ...(manifest.historicalExports ?? []).filter(asset => asset.name !== 'town_ground_v5'),
        ...retired.map(asset => ({ ...asset, status: 'superseded_after_width_expansion', runtimeIsHistorical: true }))];
    Object.assign(manifest, { batchId: 'ai_image_v5', sourceType: 'codex_builtin_image_gen', styleId: STYLE,
        blueprint: BLUEPRINT, visualApproval: 'pending', newGeneratedSceneSources: 14,
        unchangedHistoricalGeneratedSources: 5, repeatedNewSourceExports: 6,
        sharedCharacterTargetUiBatch: 'ai_image_v4' });
    write(manifestFile, manifest);
    console.log(JSON.stringify({ status: 'planned', sceneExports: entries.length,
        newGeneratedSources: newSourceCount, unchangedReusedSources: reusedSources.length,
        production: BASE, importerRequiresActualPromptField: true }));
}

function finalizeCandidateRecords() {
    const plan = read(`${BASE}/import_plan.json`), production = read(`${BASE}/production_manifest.json`);
    assert.equal(plan.batchId, 'ai_image_v5');
    assert.equal(plan.assets.length, 25);
    const candidateRecords = plan.assets.map(entry => {
        const imported = production.assets.find(asset => asset.name === entry.name);
        assert.ok(imported, `Run the PNG importer before finalizing ${entry.name}`);
        assert.equal(imported.runtime, `${BUNDLE}/${entry.runtime}`);
        assert.equal(imported.output, `assets/generated/${entry.name}.png`);
        assert.equal(imported.prompt, entry.prompt, `Importer used a different actual prompt: ${entry.name}`);
        assert.equal(imported.width, entry.width); assert.equal(imported.height, entry.height);
        assert.equal(hash(imported.output), imported.sha256);
        assert.equal(hash(imported.runtime), imported.sha256);
        assert.equal(hash(imported.source), imported.sourceSha256);
        return { id: entry.sceneSlotId, filename: path.basename(imported.output),
            category: 'scene_asset_candidate', batchId: 'ai_image_v5',
            sourceType: 'codex_builtin_image_gen', status: 'runtime_trial_unapproved',
            styleId: entry.reusedGeneratedSourceBatch ? 'cozy_handdrawn_ai_v4' : STYLE,
            productionStyleId: STYLE, path: imported.output, runtimePath: imported.runtime,
            format: 'PNG', size: `${entry.width}x${entry.height}`, transparent: entry.transparent !== false,
            sourcePath: imported.source, promptPath: imported.prompt,
            sourceSha256: imported.sourceSha256, sha256: imported.sha256,
            generationRecordPath: `${BASE}/generation_record.json`,
            idManifestPath: `${BASE}/production_manifest.json`,
            ...(entry.reusedGeneratedSourceBatch ? { reusedGeneratedSourceBatch: 'ai_image_v4',
                reusedSource: entry.reusedSource, reusedPrompt: entry.reusedPrompt } : {}),
            description: entry.reusedGeneratedSourceBatch
                ? 'Temporary historical generated support, copied unchanged into v5 provenance and mechanically re-exported to a new runtime ID. Runtime and player visual review pending.'
                : 'New built-in generated scene PNG, mechanically imported for the first chapter overhaul. Runtime and player visual review pending.' };
    });
    const global = read('art/asset_manifest.json');
    for (const candidate of candidateRecords) {
        const index = global.assets.findIndex(asset => asset.id === candidate.id);
        if (index < 0) global.assets.push(candidate); else global.assets[index] = candidate;
    }
    // The caller publishes currentProductionId and verified statuses only after
    // actual runtime review. Appending candidates does not approve their visuals.
    write('art/asset_manifest.json', global);
    console.log(JSON.stringify({ status: 'imported_candidates_recorded', sceneCandidates: candidateRecords.length,
        playerVisualApproval: 'pending', runtimeVerification: 'pending' }));
}

assert.ok(process.argv.slice(2).every(argument => argument === '--finalize'), 'Supported argument: --finalize');
if (process.argv.includes('--finalize')) finalizeCandidateRecords(); else planScene();
