import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager, DEFAULT_SAVE_KEY } from '../assets/scripts/save/SaveManager.ts';
import { WechatLocalStorageAdapter } from '../assets/scripts/platform/LocalStorageAdapter.ts';

function memoryStorage() {
    const data = new Map();
    return {
        data,
        saveLocal(key, value) { data.set(key, value); },
        loadLocal(key) { return data.get(key) ?? null; },
    };
}

test('progress, city travel, inventory and settings survive a fresh manager without duplicates', () => {
    const storage = memoryStorage();
    const first = new SaveManager(storage, 'city_demo');
    assert.equal(first.loadStatus, 'new');
    assert.deepEqual(first.getCityProgress('city_demo').completedTaskIds, []);
    assert.equal(first.recordCityProgress('city_demo', {
        completedTaskIds: ['find_banana', 'find_banana', 'find_blue'],
        foundHiddenObjectIds: ['banana_01', 'banana_01'],
        discoveredChickenIds: ['chick_blue'],
    }), true);
    assert.equal(first.recordCityProgress('city_demo', {
        completedTaskIds: ['find_banana'],
        foundHiddenObjectIds: ['banana_01'],
        discoveredChickenIds: ['chick_blue'],
    }), false);
    first.setInteractiveState('city_demo', 'door_01', 'open');
    first.addCollectible('postcard_01');
    first.addCollectible('postcard_01');
    first.addSouvenir('demo_badge');
    first.setSettings({ soundEnabled: false });
    assert.throws(() => first.setCurrentCity('city_harbor'), /locked/);
    first.recordCityCompletion('city_demo', 'city_harbor');
    first.setCurrentCity('city_harbor');

    const restored = new SaveManager(storage, 'city_demo');
    assert.equal(restored.loadStatus, 'loaded');
    assert.equal(restored.getCurrentCityId(), 'city_harbor');
    assert.equal(restored.isCityCompleted('city_demo'), true);
    assert.equal(restored.isCityUnlocked('city_harbor'), true);
    assert.deepEqual(restored.getCityProgress('city_demo').completedTaskIds,
        ['find_banana', 'find_blue']);
    assert.deepEqual(restored.getCityProgress('city_demo').foundHiddenObjectIds, ['banana_01']);
    assert.deepEqual(restored.getCityProgress('city_demo').discoveredChickenIds, ['chick_blue']);
    assert.equal(restored.getCityProgress('city_demo').interactiveStates.door_01, 'open');
    assert.deepEqual(restored.getSnapshot().collectibleIds, ['postcard_01']);
    assert.deepEqual(restored.getSnapshot().souvenirIds, ['demo_badge']);
    assert.equal(restored.getSnapshot().settings.soundEnabled, false);

    const detached = restored.getSnapshot();
    detached.cities.city_demo.completedTaskIds.push('fake');
    assert.equal(restored.getCityProgress('city_demo').completedTaskIds.includes('fake'), false);
});

test('corrupt and unknown-version saves safely start at the catalog initial city', () => {
    const storage = memoryStorage();
    storage.data.set(DEFAULT_SAVE_KEY, '{');
    const corrupt = new SaveManager(storage, 'city_demo');
    assert.equal(corrupt.loadStatus, 'reset');
    assert.equal(corrupt.getCurrentCityId(), 'city_demo');
    storage.data.set(DEFAULT_SAVE_KEY, JSON.stringify({ version: 999, currentCityId: 'lost_city' }));
    const unknown = new SaveManager(storage, 'city_demo');
    assert.equal(unknown.loadStatus, 'reset');
    assert.deepEqual(unknown.getSnapshot().unlockedCityIds, ['city_demo']);
});

test('a failed local write leaves in-memory state unchanged and reports the failure', () => {
    const storage = {
        loadLocal() { return null; },
        saveLocal() { throw new Error('storage full'); },
    };
    const save = new SaveManager(storage, 'city_demo');
    assert.throws(() => save.recordCityProgress('city_demo', {
        completedTaskIds: ['find_banana'], foundHiddenObjectIds: ['banana_01'],
        discoveredChickenIds: [],
    }), /storage full/);
    assert.deepEqual(save.getCityProgress('city_demo').completedTaskIds, []);
});

test('the WeChat adapter maps empty and string values through synchronous storage', () => {
    const values = new Map();
    const adapter = new WechatLocalStorageAdapter({
        setStorageSync(key, value) { values.set(key, value); },
        getStorageSync(key) { return values.get(key) ?? ''; },
    });
    assert.equal(adapter.loadLocal('missing'), null);
    adapter.saveLocal('progress', '{"version":1}');
    assert.equal(adapter.loadLocal('progress'), '{"version":1}');
});
