import type { LocalStorageAdapter } from '../platform/LocalStorageAdapter';

export const SAVE_VERSION = 1 as const;
export const DEFAULT_SAVE_KEY = 'chicken_city_exploration_save';
/** This independent playable slice must never overwrite the original project's save. */
export const LIVING_CITY_SAVE_KEY = 'chriken_living_city_v1_save_v1';

/** Names match MapBrowserDemo's serializable progress DTO. */
export interface CityProgressSnapshot {
    completedTaskIds: string[];
    foundHiddenObjectIds: string[];
    discoveredChickenIds: string[];
}

export interface CitySaveState extends CityProgressSnapshot {
    interactiveStates: Record<string, string>;
}

export interface SaveSettings {
    musicEnabled: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
}

export interface SaveDataV1 {
    version: typeof SAVE_VERSION;
    currentCityId: string;
    unlockedCityIds: string[];
    completedCityIds: string[];
    cities: Record<string, CitySaveState>;
    collectibleIds: string[];
    souvenirIds: string[];
    settings: SaveSettings;
}

export type SaveLoadStatus = 'new' | 'loaded' | 'reset' | 'unavailable';

function validId(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
        && value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
}

function uniqueIds(values: readonly string[]): string[] {
    // Creator's script transpilation does not reliably spread a Set in the Web
    // Mobile target. Keep this as an array loop so persisted IDs stay strings.
    const result: string[] = [];
    for (const value of values) {
        if (validId(value) && result.indexOf(value) < 0) result.push(value);
    }
    return result;
}

function stringRecord(): Record<string, string> {
    return Object.create(null) as Record<string, string>;
}

function cityRecord(): Record<string, CitySaveState> {
    return Object.create(null) as Record<string, CitySaveState>;
}

function emptyCity(): CitySaveState {
    return {
        completedTaskIds: [], foundHiddenObjectIds: [], discoveredChickenIds: [],
        interactiveStates: stringRecord(),
    };
}

function freshSave(initialCityId: string): SaveDataV1 {
    return {
        version: SAVE_VERSION,
        currentCityId: initialCityId,
        unlockedCityIds: [initialCityId], completedCityIds: [],
        cities: cityRecord(), collectibleIds: [], souvenirIds: [],
        settings: { musicEnabled: true, soundEnabled: true, vibrationEnabled: true },
    };
}

function cloneCity(city: CitySaveState): CitySaveState {
    const interactiveStates = stringRecord();
    for (const id of Object.keys(city.interactiveStates)) interactiveStates[id] = city.interactiveStates[id];
    return {
        completedTaskIds: [...city.completedTaskIds],
        foundHiddenObjectIds: [...city.foundHiddenObjectIds],
        discoveredChickenIds: [...city.discoveredChickenIds], interactiveStates,
    };
}

function cloneSave(data: SaveDataV1): SaveDataV1 {
    const cities = cityRecord();
    for (const id of Object.keys(data.cities)) cities[id] = cloneCity(data.cities[id]);
    return {
        version: SAVE_VERSION, currentCityId: data.currentCityId,
        unlockedCityIds: [...data.unlockedCityIds], completedCityIds: [...data.completedCityIds],
        cities, collectibleIds: [...data.collectibleIds], souvenirIds: [...data.souvenirIds],
        settings: { ...data.settings },
    };
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function idArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(validId);
}

function decodeCity(value: unknown): CitySaveState | null {
    if (!object(value) || !idArray(value.completedTaskIds)
        || !idArray(value.foundHiddenObjectIds) || !idArray(value.discoveredChickenIds)
        || !object(value.interactiveStates)) return null;
    const interactiveStates = stringRecord();
    for (const id of Object.keys(value.interactiveStates)) {
        const state = value.interactiveStates[id];
        if (!validId(id) || typeof state !== 'string') return null;
        interactiveStates[id] = state;
    }
    return {
        completedTaskIds: uniqueIds(value.completedTaskIds),
        foundHiddenObjectIds: uniqueIds(value.foundHiddenObjectIds),
        discoveredChickenIds: uniqueIds(value.discoveredChickenIds), interactiveStates,
    };
}

function decodeSave(raw: unknown, initialCityId: string): SaveDataV1 | null {
    if (!object(raw) || raw.version !== SAVE_VERSION || !validId(raw.currentCityId)
        || !idArray(raw.unlockedCityIds) || !idArray(raw.completedCityIds)
        || !object(raw.cities) || !idArray(raw.collectibleIds) || !idArray(raw.souvenirIds)
        || !object(raw.settings) || typeof raw.settings.musicEnabled !== 'boolean'
        || typeof raw.settings.soundEnabled !== 'boolean'
        || typeof raw.settings.vibrationEnabled !== 'boolean') return null;
    const cities = cityRecord();
    for (const id of Object.keys(raw.cities)) {
        const value = raw.cities[id];
        if (!validId(id)) return null;
        const city = decodeCity(value);
        if (!city) return null;
        cities[id] = city;
    }
    return {
        version: SAVE_VERSION, currentCityId: raw.currentCityId,
        unlockedCityIds: uniqueIds([initialCityId, ...raw.unlockedCityIds,
            ...raw.completedCityIds, raw.currentCityId]),
        completedCityIds: uniqueIds(raw.completedCityIds), cities,
        collectibleIds: uniqueIds(raw.collectibleIds), souvenirIds: uniqueIds(raw.souvenirIds),
        settings: {
            musicEnabled: raw.settings.musicEnabled,
            soundEnabled: raw.settings.soundEnabled,
            vibrationEnabled: raw.settings.vibrationEnabled,
        },
    };
}

/** Owns all persistent progress. Every mutation is written before becoming active in memory. */
export class SaveManager {
    private data: SaveDataV1;
    private readonly storage: LocalStorageAdapter;
    private readonly key: string;
    public readonly loadStatus: SaveLoadStatus;

    public constructor(storage: LocalStorageAdapter, initialCityId: string,
        key = DEFAULT_SAVE_KEY) {
        if (!validId(initialCityId)) throw new Error('An initial city ID is required');
        this.storage = storage;
        this.key = key;
        this.data = freshSave(initialCityId);
        let status: SaveLoadStatus = 'new';
        try {
            const raw = storage.loadLocal(key);
            if (raw !== null && raw !== '') {
                try {
                    const decoded = decodeSave(JSON.parse(raw) as unknown, initialCityId);
                    if (decoded) {
                        this.data = decoded;
                        status = 'loaded';
                    } else status = 'reset';
                } catch { status = 'reset'; }
            }
        } catch { status = 'unavailable'; }
        this.loadStatus = status;
    }

    public getSnapshot(): SaveDataV1 { return cloneSave(this.data); }
    public getCurrentCityId(): string { return this.data.currentCityId; }
    public isCityUnlocked(cityId: string): boolean { return this.data.unlockedCityIds.indexOf(cityId) >= 0; }
    public isCityCompleted(cityId: string): boolean { return this.data.completedCityIds.indexOf(cityId) >= 0; }

    /** Unknown cities have empty progress; callers can pass this directly to a city view. */
    public getCityProgress(cityId: string): CitySaveState {
        return cloneCity(this.data.cities[cityId] ?? emptyCity());
    }

    /** Merge monotonic task and discovery progress; repeated reports cause no extra writes. */
    public recordCityProgress(cityId: string, progress: CityProgressSnapshot): boolean {
        this.requireId(cityId);
        return this.commit(data => {
            const city = data.cities[cityId] ?? (data.cities[cityId] = emptyCity());
            city.completedTaskIds = uniqueIds([...city.completedTaskIds, ...progress.completedTaskIds]);
            city.foundHiddenObjectIds = uniqueIds([...city.foundHiddenObjectIds, ...progress.foundHiddenObjectIds]);
            city.discoveredChickenIds = uniqueIds([...city.discoveredChickenIds, ...progress.discoveredChickenIds]);
        });
    }

    /** Completion and unlocking happen together; the active city changes only after travel succeeds. */
    public recordCityCompletion(cityId: string, nextCityId?: string | null): boolean {
        this.requireId(cityId);
        if (nextCityId != null) this.requireId(nextCityId);
        return this.commit(data => {
            data.completedCityIds = uniqueIds([...data.completedCityIds, cityId]);
            data.unlockedCityIds = uniqueIds([...data.unlockedCityIds, cityId,
                ...(nextCityId ? [nextCityId] : [])]);
        });
    }

    /** Call only after CityManager successfully mounts the destination. */
    public setCurrentCity(cityId: string): boolean {
        this.requireId(cityId);
        if (!this.isCityUnlocked(cityId)) throw new Error(`City is locked: ${cityId}`);
        return this.commit(data => { data.currentCityId = cityId; });
    }

    public setInteractiveState(cityId: string, objectId: string, state: string): boolean {
        this.requireId(cityId); this.requireId(objectId);
        if (typeof state !== 'string') throw new Error('Interactive state must be a string');
        return this.commit(data => {
            const city = data.cities[cityId] ?? (data.cities[cityId] = emptyCity());
            city.interactiveStates[objectId] = state;
        });
    }

    public addCollectible(id: string): boolean {
        this.requireId(id);
        return this.commit(data => { data.collectibleIds = uniqueIds([...data.collectibleIds, id]); });
    }

    public addSouvenir(id: string): boolean {
        this.requireId(id);
        return this.commit(data => { data.souvenirIds = uniqueIds([...data.souvenirIds, id]); });
    }

    public setSettings(patch: Partial<SaveSettings>): boolean {
        for (const key of Object.keys(patch) as (keyof SaveSettings)[]) {
            const value = patch[key];
            if (typeof value !== 'boolean') throw new Error('Save setting must be boolean');
        }
        return this.commit(data => { data.settings = { ...data.settings, ...patch }; });
    }

    private requireId(id: string): void {
        if (!validId(id)) throw new Error('A nonempty, safe ID is required');
    }

    private commit(change: (data: SaveDataV1) => void): boolean {
        const next = cloneSave(this.data);
        change(next);
        const serialized = JSON.stringify(next);
        if (serialized === JSON.stringify(this.data)) return false;
        this.storage.saveLocal(this.key, serialized);
        this.data = next;
        return true;
    }
}

/** A saved city may disappear from a later catalog; then start at the catalog's entry city. */
export function chooseStartupCityId(save: SaveManager, availableCityIds: readonly string[],
    initialCityId: string): string {
    const savedId = save.getCurrentCityId();
    return availableCityIds.indexOf(savedId) >= 0 && save.isCityUnlocked(savedId) ? savedId : initialCityId;
}
