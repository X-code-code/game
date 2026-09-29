import { assetManager, AssetManager, JsonAsset, resources } from 'cc';
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
            return { config, bundle, release };
        } catch (loadError) {
            release();
            throw failure(`Cannot prepare city "${cityId}" in ${entry.bundleName}`, loadError);
        }
    }
}
