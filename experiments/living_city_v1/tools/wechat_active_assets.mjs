import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UI_NAMES = [
    'ui_panel', 'ui_button', 'ui_hint_ring', 'ui_backdrop',
    'ui_journal_panel_v17', 'ui_journal_card_v17',
];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const slash = value => value.replaceAll('\\', '/');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

function requireArray(value, context) {
    if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
    return value;
}

function assetPath(value, context) {
    if (typeof value !== 'string' || !value || isAbsolute(value) ||
        value.includes('\\') || value.split('/').some(part => !part || part === '..' || part === '.')) {
        throw new Error(`${context} is not a safe relative asset path: ${String(value)}`);
    }
    return value.replace(/\/spriteFrame$/, '');
}

/** Images contain both a texture and SpriteFrame UUID in their .meta file. */
function metadataUuids(meta) {
    const result = new Set();
    const visit = entry => {
        if (!entry || typeof entry !== 'object') return;
        if (typeof entry.uuid === 'string' && entry.uuid) result.add(entry.uuid);
        for (const child of Object.values(entry.subMetas ?? {})) visit(child);
    };
    visit(meta);
    return [...result].sort();
}

async function filesUnder(directory) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await filesUnder(path));
        else if (entry.isFile() && !entry.name.endsWith('.meta')) result.push(path);
    }
    return result.sort();
}

async function inspectBundle(projectRoot, relativeRoot) {
    const root = join(projectRoot, relativeRoot);
    const meta = await readJson(`${root}.meta`);
    if (!meta.userData?.isBundle || !meta.uuid || !meta.userData.bundleName) {
        throw new Error(`${relativeRoot}.meta is not a registered asset bundle`);
    }
    const files = await filesUnder(root);
    const records = await Promise.all(files.map(async path => {
        const metadata = await readJson(`${path}.meta`);
        if (!metadata.uuid) throw new Error(`Asset has no UUID: ${slash(relative(projectRoot, path))}`);
        return {
            path: slash(relative(projectRoot, path)),
            bundlePath: slash(relative(root, path)),
            bytes: (await stat(path)).size,
            uuids: metadataUuids(metadata),
        };
    }));
    return {
        name: meta.userData.bundleName,
        rootUuid: meta.uuid,
        relativeRoot: slash(relativeRoot),
        priority: meta.userData.priority ?? 7,
        records,
    };
}

async function activePathsForCity(projectRoot, bundle, entry) {
    const root = join(projectRoot, bundle.relativeRoot);
    const files = new Set(bundle.records.map(record => record.bundlePath));
    const active = new Set();
    const addFile = path => {
        assetPath(path, `${bundle.name} required file`);
        if (!files.has(path)) throw new Error(`Required active asset is missing: ${bundle.relativeRoot}/${path}`);
        active.add(path);
    };
    const addImage = (value, context) => {
        const path = assetPath(value, context);
        const candidates = IMAGE_EXTENSIONS.map(extension => `${path}${extension}`).filter(file => files.has(file));
        if (candidates.length !== 1) {
            throw new Error(`${context} must resolve to one image in ${bundle.name}: ${value}`);
        }
        addFile(candidates[0]);
    };
    addFile('city.json');
    const config = await readJson(join(root, 'city.json'));
    if (config.cityId !== entry.cityId) throw new Error(`${bundle.name}/city.json has a different city ID`);
    const blueprintPath = `${assetPath(config.sceneBlueprint, `${entry.cityId} sceneBlueprint`)}.json`;
    addFile(blueprintPath);
    const blueprint = await readJson(join(root, blueprintPath));
    if (blueprint.id !== entry.cityId) throw new Error(`${blueprintPath} has a different city ID`);
    if (config.background) addImage(config.background, `${entry.cityId} background`);
    for (const slot of requireArray(blueprint.artSlots, `${entry.cityId} artSlots`)) {
        addImage(`simple2d_scene/${assetPath(slot.id, 'art slot ID')}`, `${entry.cityId} art slot ${slot.id}`);
    }
    for (const target of requireArray(config.hiddenObjects, `${entry.cityId} hiddenObjects`)) {
        addImage(target.asset, `${entry.cityId} target ${target.id}`);
    }
    for (const reveal of requireArray(config.interactiveObjects, `${entry.cityId} interactiveObjects`)) {
        addImage(reveal.asset, `${entry.cityId} reveal ${reveal.id} closed`);
        if (reveal.openAsset) addImage(reveal.openAsset, `${entry.cityId} reveal ${reveal.id} opened`);
    }
    for (const foreground of config.foregroundSprites ?? []) {
        addImage(foreground.asset, `${entry.cityId} foreground ${foreground.id}`);
    }
    for (const chicken of config.chickens ?? []) {
        addImage(chicken.skin, `${entry.cityId} chicken ${chicken.id}`);
        for (const frame of chicken.animation?.frames ?? []) addImage(frame, `${entry.cityId} chicken animation`);
    }
    for (const name of UI_NAMES) addImage(`ui/${name}`, `${entry.cityId} UI ${name}`);
    for (const actor of requireArray(blueprint.npcPlans, `${entry.cityId} npcPlans`)) {
        const folder = `cels/${assetPath(actor.id, 'NPC ID')}`;
        const manifestPath = `${folder}/manifest.json`;
        addFile(manifestPath);
        const manifest = await readJson(join(root, manifestPath));
        if (manifest.actorId !== actor.id || !manifest.clips || typeof manifest.clips !== 'object') {
            throw new Error(`Invalid active actor manifest: ${bundle.relativeRoot}/${manifestPath}`);
        }
        for (const [clipName, frames] of Object.entries(manifest.clips)) {
            for (const frame of requireArray(frames, `${actor.id} clip ${clipName}`)) {
                addImage(`${folder}/${assetPath(frame.asset, 'cel asset')}`, `${entry.cityId} ${actor.id} ${clipName}`);
            }
        }
    }
    for (const event of blueprint.sceneEvents ?? []) {
        if (event.prop?.asset) addImage(event.prop.asset, `${entry.cityId} event ${event.id}`);
        else if (event.id === 'tea_exchange' && blueprint.standingSpots?.some(spot => spot.id === 'tea_cup_handoff')) {
            addImage('event_cup', `${entry.cityId} tea handoff`);
        }
    }
    // CityContentLoader preloads this optional asset when the bundle contains it.
    if (files.has('event_cup.png')) addFile('event_cup.png');
    return { active, config, blueprint };
}

function summarizeRecords(records) {
    return {
        paths: records.map(record => record.path).sort(),
        uuids: [...new Set(records.flatMap(record => record.uuids))].sort(),
        bytes: records.reduce((total, record) => total + record.bytes, 0),
    };
}

/**
 * Derive the build filter from the live catalog, city configs and animation manifests.
 * Only reports assets: it never removes or rewrites artwork, metadata or saved progress.
 * Paths are project-relative; UUID arrays include root assets and every subMeta.
 */
export async function auditActiveAssets(projectRoot) {
    projectRoot = resolve(projectRoot);
    const catalog = await readJson(join(projectRoot, 'assets/resources/configs/city_catalog.json'));
    requireArray(catalog.cities, 'city catalog cities');
    const bundleRoots = ['assets/generated', ...(await readdir(join(projectRoot, 'assets/bundles'),
        { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => `assets/bundles/${entry.name}`)];
    const inspected = await Promise.all(bundleRoots.map(root => inspectBundle(projectRoot, root)));
    const byName = new Map(inspected.map(bundle => [bundle.name, bundle]));
    if (byName.size !== inspected.length) throw new Error('Two directories use the same bundle name');
    const bundles = [];
    for (const entry of catalog.cities) {
        const bundle = byName.get(entry.bundleName);
        if (!bundle) throw new Error(`Catalog bundle is missing: ${entry.bundleName}`);
        const { active, config, blueprint } = await activePathsForCity(projectRoot, bundle, entry);
        const activeRecords = bundle.records.filter(record => active.has(record.bundlePath));
        const inactiveRecords = bundle.records.filter(record => !active.has(record.bundlePath));
        const kept = summarizeRecords(activeRecords), omitted = summarizeRecords(inactiveRecords);
        const activeUuidSet = new Set(kept.uuids);
        if (omitted.uuids.some(uuid => activeUuidSet.has(uuid))) {
            throw new Error(`${bundle.name} has shared active/inactive UUIDs; exclusion would be unsafe`);
        }
        const categories = {};
        for (const record of inactiveRecords) {
            const category = record.bundlePath.split('/')[0];
            categories[category] ??= { files: 0, bytes: 0, uuids: 0 };
            categories[category].files++;
            categories[category].bytes += record.bytes;
            categories[category].uuids += record.uuids.length;
        }
        bundles.push({
            name: bundle.name, cityId: entry.cityId, rootUuid: bundle.rootUuid,
            relativeRoot: bundle.relativeRoot, priority: bundle.priority,
            activePaths: kept.paths, inactivePaths: omitted.paths,
            activeUuids: kept.uuids, inactiveUuids: omitted.uuids,
            activeBytes: kept.bytes, inactiveBytes: omitted.bytes, totalBytes: kept.bytes + omitted.bytes,
            counts: {
                activeFiles: kept.paths.length, inactiveFiles: omitted.paths.length,
                activeUuids: kept.uuids.length, inactiveUuids: omitted.uuids.length,
                artSlots: blueprint.artSlots.length, residents: blueprint.npcPlans.length,
                targets: config.hiddenObjects.length, reveals: config.interactiveObjects.length,
            },
            categories,
        });
    }
    const activeNames = new Set(bundles.map(bundle => bundle.name));
    const excludedBundles = inspected.filter(bundle => !activeNames.has(bundle.name)).map(bundle => ({
        name: bundle.name, rootUuid: bundle.rootUuid, relativeRoot: bundle.relativeRoot,
        priority: bundle.priority, ...summarizeRecords(bundle.records),
    }));
    const allActiveUuids = new Set(bundles.flatMap(bundle => bundle.activeUuids));
    for (const bundle of excludedBundles) {
        if (bundle.uuids.some(uuid => allActiveUuids.has(uuid))) {
            throw new Error(`Excluded bundle ${bundle.name} shares active city UUIDs`);
        }
    }
    return {
        catalog, bundles, excludedBundles,
        totals: {
            activeFiles: bundles.reduce((n, bundle) => n + bundle.counts.activeFiles, 0),
            activeBytes: bundles.reduce((n, bundle) => n + bundle.activeBytes, 0),
            inactiveFiles: bundles.reduce((n, bundle) => n + bundle.counts.inactiveFiles, 0),
            inactiveBytes: bundles.reduce((n, bundle) => n + bundle.inactiveBytes, 0),
            excludedBundleFiles: excludedBundles.reduce((n, bundle) => n + bundle.paths.length, 0),
            excludedBundleBytes: excludedBundles.reduce((n, bundle) => n + bundle.bytes, 0),
        },
    };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const projectRoot = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
    const report = await auditActiveAssets(projectRoot);
    const summary = {
        ...report.totals,
        bundles: report.bundles.map(({ activePaths, inactivePaths, activeUuids, inactiveUuids, ...bundle }) => bundle),
        excludedBundles: report.excludedBundles.map(({ paths, uuids, ...bundle }) => ({
            ...bundle, files: paths.length, uuidCount: uuids.length,
        })),
    };
    console.log(JSON.stringify(summary, null, 2));
}
