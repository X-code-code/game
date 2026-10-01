import { assetManager, AssetManager, JsonAsset, resources, SpriteFrame } from 'cc';
import type { CityCatalog, CityConfig } from './CityTypes';
import { validateCityCatalog, validateCityConfig } from './CityConfigValidator';

const CATALOG_PATH = 'configs/city_catalog';
const CITY_CONFIG_PATH = 'city';

function failure(context: string, reason: unknown): Error {
    const detail = reason instanceof Error ? reason.message : String(reason);
    return new Error(`${context}: ${detail}`);
}

function loadCatalog(): Promise<CityCatalog> {
    return new Promise((resolve, reject) => {
        resources.load(CATALOG_PATH, JsonAsset, (loadError, asset) => {
            if (loadError || !asset) {
                reject(failure(`Cannot load resources/${CATALOG_PATH}.json`, loadError ?? 'empty asset'));
                return;
            }
            try {
                resolve(validateCityCatalog(asset.json));
            } catch (validationError) {
                reject(failure(`Invalid resources/${CATALOG_PATH}.json`, validationError));
            }
        });
    });
}

function loadCityBundle(bundleName: string): Promise<AssetManager.Bundle> {
    return new Promise((resolve, reject) => {
        assetManager.loadBundle(bundleName, (loadError, bundle) => {
            if (loadError || !bundle) {
                reject(failure(`Cannot load city bundle "${bundleName}"`, loadError ?? 'empty bundle'));
                return;
            }
            resolve(bundle);
        });
    });
}

function loadCityJson(bundle: AssetManager.Bundle, cityId: string): Promise<JsonAsset> {
    return new Promise((resolve, reject) => {
        bundle.load(CITY_CONFIG_PATH, JsonAsset, (loadError, asset) => {
            if (loadError || !asset) {
                reject(failure(`Cannot load city "${cityId}" from ${bundle.name}/${CITY_CONFIG_PATH}.json`,
                    loadError ?? 'empty asset'));
                return;
            }
            // Hold the asset until the city's nodes and references have been destroyed.
            asset.addRef();
            resolve(asset);
        });
    });
}

/** Finish dependency downloads while the city's lease is still reserved.
 * A restored completed city can be left immediately after mounting. */
async function loadGeneratedCityArt(bundle: AssetManager.Bundle, config: CityConfig): Promise<void> {
    if (!config.sceneBlueprint) return;
    const finish = async (requests: Promise<void>[]): Promise<void> => {
        const failures: unknown[] = [];
        await Promise.all(requests.map(request => request.catch(reason => { failures.push(reason); })));
        if (failures.length) throw failures[0];
    };
    const json = (assetPath: string): Promise<JsonAsset> => new Promise((resolve, reject) => {
        bundle.load(assetPath, JsonAsset, (error, asset) => {
            if (error || !asset) reject(failure(`Cannot load ${bundle.name}/${assetPath}`, error));
            else resolve(asset);
        });
    });
    const blueprint = (await json(config.sceneBlueprint)).json as {
        artSlots: { id: string }[]; npcPlans: { id: string }[];
    };
    const paths = new Set<string>(blueprint.artSlots.map(slot => `simple2d_scene/${slot.id}/spriteFrame`));
    for (const target of config.hiddenObjects) paths.add(`${target.asset}/spriteFrame`);
    for (const reveal of config.interactiveObjects) {
        paths.add(`${reveal.asset}/spriteFrame`);
        if (reveal.openAsset) paths.add(`${reveal.openAsset}/spriteFrame`);
    }
    for (const name of ['ui_panel', 'ui_button', 'ui_hint_ring', 'ui_backdrop']) paths.add(`ui/${name}/spriteFrame`);
    const cup = 'event_cup/spriteFrame';
    if (bundle.getInfoWithPath(cup, SpriteFrame)) paths.add(cup);
    await finish(blueprint.npcPlans.map(async actor => {
        const folder = `cels/${actor.id}`;
        const manifest = (await json(`${folder}/manifest`)).json as {
            clips: Record<string, { asset: string }[]>;
        };
        for (const clip of Object.keys(manifest.clips)) {
            for (const cel of manifest.clips[clip]) paths.add(`${folder}/${cel.asset}/spriteFrame`);
        }
    }));
    // Keep the bundle registered until every dependency request has
    // finished, including the error path. No old, unreferenced artwork is loaded.
    await finish(Array.from(paths).map(assetPath => new Promise<void>((resolve, reject) => {
        bundle.load(assetPath, SpriteFrame, (error, frame) => {
            if (error || !frame) reject(failure(`Cannot load ${bundle.name}/${assetPath}`, error));
            else resolve();
        });
    })));
}

export interface LoadedCity {
    readonly config: CityConfig;
    /** The city's JSON and art share one bundle/lease. */
    readonly bundle: AssetManager.Bundle;
    /** Idempotent: each successful load owns one reference. */
    release(): void;
}

interface BundleLease {
    promise: Promise<AssetManager.Bundle>;
    users: number;
    owned: boolean;
    bundle?: AssetManager.Bundle;
}

/** One loader per journey. Concurrent/cancelled requests share bundle loading safely. */
export class CityContentLoader {
    private readonly bundles = new Map<string, BundleLease>();

    private constructor(public readonly catalog: CityCatalog) {}

    public static async create(): Promise<CityContentLoader> {
        return new CityContentLoader(await loadCatalog());
    }

    public async load(cityId: string): Promise<LoadedCity> {
        const entry = this.catalog.cities.find(candidate => candidate.cityId === cityId);
        if (!entry) throw new Error(`City catalog has no entry for "${cityId}"`);
        let lease = this.bundles.get(entry.bundleName);
        if (!lease) {
            const existing = assetManager.getBundle(entry.bundleName);
            lease = { promise: existing ? Promise.resolve(existing) : loadCityBundle(entry.bundleName),
                users: 0, owned: !existing };
            this.bundles.set(entry.bundleName, lease);
        }
        const reservation = lease;
        reservation.users++;
        let asset: JsonAsset | null = null;
        let released = false;
        const release = (): void => {
            if (released) return;
            released = true;
            asset?.decRef();
            asset = null;
            reservation.users--;
            if (reservation.users === 0) {
                if (reservation.owned && reservation.bundle) assetManager.removeBundle(reservation.bundle);
                this.bundles.delete(entry.bundleName);
            }
        };
        try {
            const bundle = await reservation.promise;
            reservation.bundle = bundle;
            asset = await loadCityJson(bundle, cityId);
            const config = validateCityConfig(asset.json, this.catalog, cityId);
            await loadGeneratedCityArt(bundle, config);
            return { config, bundle, release };
        } catch (loadError) {
            release();
            throw failure(`Cannot prepare city "${cityId}" in ${entry.bundleName}`, loadError);
        }
    }
}
