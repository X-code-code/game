/** Derive the Cocos city config and bundle data from design/street_block_01.json. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designPath = path.join(root, 'design/street_block_01.json');
const bundleName = 'city_living_city_street_block_01';
const bundleDir = path.join(root, 'assets/bundles', bundleName);
const catalogPath = path.join(root, 'assets/resources/configs/city_catalog.json');
const source = readFileSync(designPath, 'utf8');
const scene = JSON.parse(source);
assert.equal(scene.id, 'living_city_street_block_01');
assert.equal(scene.schemaVersion, 1);
const taskLabels = {
    tea_clay_whistle: '茶摊陶哨',
    tailor_thimble: '裁缝顶针',
    banner_knot: '横幅绳结',
    chestnut_tongs: '栗子夹',
};

const worldToNormalized = (p) => ({
    x: Number(((p.x + scene.map.width / 2) / scene.map.width).toFixed(8)),
    y: Number(((p.y + scene.map.height / 2) / scene.map.height).toFixed(8)),
});
const city = {
    schemaVersion: 1,
    cityId: scene.id,
    cityName: '茶摊街区',
    background: 'simple2d_scene/lc_ground_paving',
    sceneBlueprint: 'street_block_01',
    chapterIndex: 1,
    chapterCount: 3,
    mapSize: { width: scene.map.width, height: scene.map.height },
    view: { minZoom: scene.camera.minZoom, maxZoom: scene.camera.maxZoom,
        initialZoom: scene.camera.initialZoom },
    hiddenObjects: scene.hiddenObjectSlots.map(target => ({
        id: target.id,
        asset: `targets/${target.id}`,
        ...worldToNormalized(target.at),
        scale: 1,
        rotation: 0,
        clickArea: { shape: 'circle', radius: target.clickRadiusWorld },
        depthY: (() => {
            const support = scene.artSlots.find(slot => slot.id === target.supportArtSlotId);
            return support?.footY === undefined ? target.at.y : support.footY - 1;
        })(),
        tags: [target.id, 'generated_target'],
        targetable: true,
        visualSize: target.visualWorldSize,
        displayName: target.label ?? taskLabels[target.id] ?? target.id,
        clue: target.clue ?? target.semanticContext,
        ...(target.visibleCondition ? { visibleCondition: target.visibleCondition } : {}),
    })),
    chickens: [],
    interactiveObjects: (scene.interactiveSlots ?? []).map(item => ({
        id: item.id, asset: `interactions/${item.id}_closed`, openAsset: `interactions/${item.id}_opened`,
        ...worldToNormalized(item.at), scale: 1, rotation: 0,
        clickArea: { shape: 'rect', width: item.visualWorldSize.width, height: item.visualWorldSize.height },
        visualSize: item.visualWorldSize, depthY: item.depthY, label: item.label,
        initialState: 'closed', actions: [{ type: 'setState', objectId: item.id, state: 'opened' }],
        tags: ['reveal'], targetable: true,
    })),
    foregroundSprites: [],
    tasks: scene.hiddenObjectSlots.map(target => ({
        id: `find_${target.id}`,
        type: 'hiddenObject',
        targetId: target.id,
        label: `找到${target.label ?? taskLabels[target.id] ?? target.id}`,
        required: true,
    })),
    nextCityId: scene.nextCityId ?? null,
    travelType: 'other',
};

function writeJson(file, data) {
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function ensureJsonMeta(file) {
    const meta = `${file}.meta`;
    if (existsSync(meta)) return;
    writeJson(meta, { ver: '2.0.1', importer: 'json', imported: true,
        uuid: randomUUID(), files: ['.json'], subMetas: {}, userData: {} });
}

mkdirSync(bundleDir, { recursive: true });
const bundleMeta = `${bundleDir}.meta`;
if (!existsSync(bundleMeta)) {
    writeJson(bundleMeta, { ver: '1.2.0', importer: 'directory', imported: true,
        uuid: randomUUID(), files: [], subMetas: {}, userData: {
            bundleConfigID: 'wechat_city_subpackage', bundleName, priority: 7, isBundle: true,
        } });
}
const cityPath = path.join(bundleDir, 'city.json');
const blueprintCopy = path.join(bundleDir, 'street_block_01.json');
writeJson(cityPath, city);
writeFileSync(blueprintCopy, source, 'utf8');
ensureJsonMeta(cityPath);
ensureJsonMeta(blueprintCopy);

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
catalog.initialCityId = scene.id;
const entry = { cityId: scene.id, bundleName };
catalog.cities = [entry, ...catalog.cities.filter(item => item.cityId !== scene.id)];
writeJson(catalogPath, catalog);

console.log(`Synced ${scene.id} from design/street_block_01.json to ${bundleName}`);
