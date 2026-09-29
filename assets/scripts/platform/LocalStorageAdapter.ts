import type { PlatformAdapter } from './PlatformAdapter';

/** The persistence capability used by SaveManager; other platform APIs stay independent. */
export type LocalStorageAdapter = Pick<PlatformAdapter, 'saveLocal' | 'loadLocal'>;

interface WechatStorageApi {
    setStorageSync(key: string, value: string): void;
    getStorageSync(key: string): unknown;
}

/** Browser and Cocos Web/Editor persistence. Storage failures propagate to the caller. */
export class WebLocalStorageAdapter implements LocalStorageAdapter {
    public saveLocal(key: string, value: string): void {
        this.storage().setItem(key, value);
    }

    public loadLocal(key: string): string | null {
        return this.storage().getItem(key);
    }

    private storage(): Storage {
        const storage = globalThis.localStorage;
        if (!storage) throw new Error('Browser localStorage is unavailable');
        return storage;
    }
}

/** WeChat Game synchronous storage; no wx API leaks into game systems. */
export class WechatLocalStorageAdapter implements LocalStorageAdapter {
    private readonly api: WechatStorageApi;

    public constructor(api: WechatStorageApi) { this.api = api; }

    public saveLocal(key: string, value: string): void {
        this.api.setStorageSync(key, value);
    }

    public loadLocal(key: string): string | null {
        const value = this.api.getStorageSync(key);
        // A missing WeChat key returns an empty string. SaveManager treats this as a new save.
        return typeof value === 'string' && value !== '' ? value : null;
    }
}

/** Select the storage backend once at startup. */
export function createLocalStorageAdapter(): LocalStorageAdapter {
    const maybeWx = (globalThis as { wx?: Partial<WechatStorageApi> }).wx;
    if (maybeWx && typeof maybeWx.getStorageSync === 'function'
        && typeof maybeWx.setStorageSync === 'function') {
        return new WechatLocalStorageAdapter(maybeWx as WechatStorageApi);
    }
    return new WebLocalStorageAdapter();
}
