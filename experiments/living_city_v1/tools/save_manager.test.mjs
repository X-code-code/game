import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager, DEFAULT_SAVE_KEY, LIVING_CITY_SAVE_KEY, chooseStartupCityId } from
    '../assets/scripts/save/SaveManager.ts';
import { WechatLocalStorageAdapter } from '../assets/scripts/platform/LocalStorageAdapter.ts';

function memoryStorage() {
    const data = new Map();
    return {
        data,
        saveLocal(key, value) { data.set(key, value); },
        loadLocal(key) { return data.get(key) ?? null; },
    };
}

test('reveals persist without counting a discovery and preserve progress from the four-target version', () => {
    const storage = memoryStorage();
    const save = new SaveManager(storage, 'living_city_street_block_01', LIVING_CITY_SAVE_KEY);
    save.recordCityProgress('living_city_street_block_01', {
        completedTaskIds: ['find_tea_clay_whistle'], foundHiddenObjectIds: ['tea_clay_whistle'], discoveredChickenIds: [],
    });
    save.recordCityProgress('living_city_street_block_01', {
        completedTaskIds: [], foundHiddenObjectIds: [], discoveredChickenIds: [],
        interactiveStates: { parcel_chest: 'opened', flower_leaves: 'closed' },
    });
    const restored = new SaveManager(storage, 'living_city_street_block_01', LIVING_CITY_SAVE_KEY).getCityProgress('living_city_street_block_01');
    assert.deepEqual(restored.completedTaskIds, ['find_tea_clay_whistle']);
    assert.deepEqual(restored.foundHiddenObjectIds, ['tea_clay_whistle']);
    assert.equal(restored.interactiveStates.parcel_chest, 'opened');
    assert.equal(restored.interactiveStates.flower_leaves, 'closed');
    assert.equal(save.recordCityProgress('living_city_street_block_01', restored), false);
});

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

test('independent living city key keeps progress per city and away from the original project', () => {
    const storage = memoryStorage();
    const original = new SaveManager(storage, 'demo_city');
    original.recordCityProgress('demo_city', {
        completedTaskIds: ['find_original'], foundHiddenObjectIds: ['original_prop'],
        discoveredChickenIds: [],
    });
    const living = new SaveManager(storage, 'living_city_street_block_01', LIVING_CITY_SAVE_KEY);
    assert.equal(chooseStartupCityId(living,
        ['living_city_street_block_01', 'demo_city'], 'living_city_street_block_01'),
    'living_city_street_block_01');
    living.recordCityProgress('living_city_street_block_01', {
        completedTaskIds: ['find_whistle'], foundHiddenObjectIds: ['tea_clay_whistle'],
        discoveredChickenIds: [],
    });
    living.recordCityProgress('living_city_street_block_01', {
        completedTaskIds: ['find_whistle'], foundHiddenObjectIds: ['tea_clay_whistle'],
        discoveredChickenIds: [],
    });
    living.recordCityCompletion('living_city_street_block_01', 'demo_city');
    living.setCurrentCity('demo_city');
    living.recordCityProgress('demo_city', {
        completedTaskIds: ['find_demo'], foundHiddenObjectIds: [], discoveredChickenIds: ['demo_chicken'],
    });

    const restored = new SaveManager(storage, 'living_city_street_block_01', LIVING_CITY_SAVE_KEY);
    assert.equal(chooseStartupCityId(restored,
        ['living_city_street_block_01', 'demo_city'], 'living_city_street_block_01'), 'demo_city');
    assert.deepEqual(restored.getCityProgress('living_city_street_block_01').completedTaskIds,
        ['find_whistle']);
    assert.deepEqual(restored.getCityProgress('demo_city').completedTaskIds, ['find_demo']);
    assert.deepEqual(restored.getCityProgress('demo_city').foundHiddenObjectIds, []);
    assert.deepEqual(original.getCityProgress('demo_city').completedTaskIds, ['find_original']);
    assert.notEqual(storage.data.get(DEFAULT_SAVE_KEY), storage.data.get(LIVING_CITY_SAVE_KEY));
});

test('corrupt or removed saved city falls back to the living city entry', () => {
    const storage = memoryStorage();
    storage.data.set(LIVING_CITY_SAVE_KEY, '{');
    const corrupt = new SaveManager(storage, 'living_city_street_block_01', LIVING_CITY_SAVE_KEY);
    assert.equal(corrupt.loadStatus, 'reset');
    assert.equal(chooseStartupCityId(corrupt, ['living_city_street_block_01'],
        'living_city_street_block_01'), 'living_city_street_block_01');

    corrupt.recordCityCompletion('living_city_street_block_01', 'removed_city');
    corrupt.setCurrentCity('removed_city');
    const stale = new SaveManager(storage, 'living_city_street_block_01', LIVING_CITY_SAVE_KEY);
    assert.equal(chooseStartupCityId(stale, ['living_city_street_block_01'],
        'living_city_street_block_01'), 'living_city_street_block_01');
});

function expandedStreetConfig() {
    const hiddenObjects = Array.from({ length: 24 }, (_, i) => ({ id: `street_item_${i}`, targetable: true }));
    return { cityId: 'living_city_street_block_01', hiddenObjects, chickens: [],
        tasks: hiddenObjects.map(object => ({ id: `find_${object.id}`, type: 'hiddenObject',
            targetId: object.id, required: true })) };
}

test('expanding a completed 12-object city to 24 recomputes tasks and preserves travel and other cities', () => {
    const config = expandedStreetConfig(), storage = memoryStorage();
    const save = new SaveManager(storage, config.cityId, LIVING_CITY_SAVE_KEY);
    const originalIds = config.hiddenObjects.slice(0, 12).map(object => object.id);
    save.recordCityProgress(config.cityId, {
        completedTaskIds: originalIds.map(id => `find_${id}`),
        foundHiddenObjectIds: originalIds, discoveredChickenIds: [],
        interactiveStates: { parcel_chest: 'opened', flower_leaves: 'opened', tea_tin: 'opened' },
    });
    save.recordCityCompletion(config.cityId, 'living_city_garden_market_02');
    save.setCurrentCity('living_city_garden_market_02');
    save.recordCityProgress('living_city_garden_market_02', {
        completedTaskIds: ['find_garden_item'], foundHiddenObjectIds: ['garden_item'],
        discoveredChickenIds: [], interactiveStates: { basket: 'opened' },
    });
    const otherCity = save.getCityProgress('living_city_garden_market_02');
    assert.equal(save.reconcileCityProgress(config), true);
    assert.equal(save.isCityCompleted(config.cityId), false);
    assert.equal(save.isCityUnlocked('living_city_garden_market_02'), true);
    assert.equal(save.getCurrentCityId(), 'living_city_garden_market_02');
    assert.deepEqual(save.getCityProgress('living_city_garden_market_02'), otherCity);
    const progress = save.getCityProgress(config.cityId);
    assert.deepEqual(progress.foundHiddenObjectIds, originalIds);
    assert.equal(progress.completedTaskIds.length, 12);
    assert.equal(Object.keys(progress.interactiveStates).length, 3);
    assert.equal(save.reconcileCityProgress(config), false);

    const fresh = new SaveManager(storage, config.cityId, LIVING_CITY_SAVE_KEY);
    assert.equal(fresh.isCityCompleted(config.cityId), false);
    assert.deepEqual(fresh.getCityProgress(config.cityId).completedTaskIds, progress.completedTaskIds);
    fresh.recordCityProgress(config.cityId, {
        completedTaskIds: config.tasks.map(task => task.id),
        foundHiddenObjectIds: config.hiddenObjects.map(object => object.id), discoveredChickenIds: [],
        interactiveStates: { book_satchel: 'opened', garden_toolbox: 'opened', picnic_basket: 'opened' },
    });
    fresh.recordCityCompletion(config.cityId, 'living_city_garden_market_02');
    fresh.reconcileCityProgress(config);
    const completed = new SaveManager(storage, config.cityId, LIVING_CITY_SAVE_KEY);
    assert.equal(completed.isCityCompleted(config.cityId), true);
    assert.equal(completed.getCityProgress(config.cityId).completedTaskIds.length, 24);
    assert.equal(Object.keys(completed.getCityProgress(config.cityId).interactiveStates).length, 6);
});

test('task reconciliation uses collected entities rather than stale or reused task IDs', () => {
    const config = expandedStreetConfig(), storage = memoryStorage();
    config.tasks[0].targetId = 'street_item_13'; // Existing ID now points at an uncollected entity.
    config.hiddenObjects[2].targetable = false;
    config.chickens = [{ id: 'resident', targetable: true, tags: ['gardener'] }];
    config.tasks.push({ id: 'meet_resident', type: 'chickenId', targetId: 'resident', required: false },
        { id: 'meet_gardener', type: 'chickenTag', targetTag: 'gardener', required: false });
    const save = new SaveManager(storage, config.cityId);
    save.recordCityProgress(config.cityId, {
        completedTaskIds: ['find_street_item_0', 'find_street_item_13', 'removed_task'],
        foundHiddenObjectIds: ['street_item_0', 'street_item_1', 'street_item_2'],
        discoveredChickenIds: ['resident'],
    });
    save.reconcileCityProgress(config);
    assert.deepEqual(save.getCityProgress(config.cityId).completedTaskIds,
        ['find_street_item_1', 'meet_resident', 'meet_gardener']);
    assert.deepEqual(save.getCityProgress(config.cityId).foundHiddenObjectIds,
        ['street_item_0', 'street_item_1', 'street_item_2']);
});

test('optional facility and delivery discoveries survive legacy saves and never consume collected objects', () => {
    const storage = memoryStorage(), save = new SaveManager(storage, 'street');
    save.recordCityProgress('street', { completedTaskIds: ['find_postcard'],
        foundHiddenObjectIds: ['postcard'], discoveredChickenIds: [] });
    const legacy = save.getSnapshot();
    delete legacy.cities.street.sceneDiscoveryIds;
    storage.data.set(DEFAULT_SAVE_KEY, JSON.stringify(legacy));
    const restored = new SaveManager(storage, 'street');
    assert.equal(restored.loadStatus, 'loaded');
    assert.deepEqual(restored.getCityProgress('street').sceneDiscoveryIds, []);
    restored.recordCityProgress('street', { completedTaskIds: [], foundHiddenObjectIds: [],
        discoveredChickenIds: [], sceneDiscoveryIds: ['water_station', 'postcard_delivery', 'water_station'] });
    restored.recordCityProgress('garden', { completedTaskIds: [], foundHiddenObjectIds: [],
        discoveredChickenIds: [], sceneDiscoveryIds: ['water_station'] });
    const fresh = new SaveManager(storage, 'street');
    assert.deepEqual(fresh.getCityProgress('street').sceneDiscoveryIds, ['water_station', 'postcard_delivery']);
    assert.deepEqual(fresh.getCityProgress('garden').sceneDiscoveryIds, ['water_station']);
    assert.deepEqual(fresh.getCityProgress('street').completedTaskIds, ['find_postcard']);
    assert.deepEqual(fresh.getCityProgress('street').foundHiddenObjectIds, ['postcard']);
    const detached = fresh.getCityProgress('street'); detached.sceneDiscoveryIds.push('fake');
    assert.equal(fresh.getCityProgress('street').sceneDiscoveryIds.includes('fake'), false);
    assert.equal(fresh.recordCityProgress('street', fresh.getCityProgress('street')), false);
});

test('failed reconciliation writes leave the completed save intact until a successful retry', () => {
    const config = expandedStreetConfig(), storage = memoryStorage();
    const save = new SaveManager(storage, config.cityId);
    save.recordCityProgress(config.cityId, { completedTaskIds: ['stale_task'],
        foundHiddenObjectIds: ['street_item_0'], discoveredChickenIds: [] });
    save.recordCityCompletion(config.cityId, 'garden');
    const before = save.getSnapshot();
    storage.saveLocal = () => { throw new Error('storage full'); };
    assert.throws(() => save.reconcileCityProgress(config), /storage full/);
    assert.deepEqual(save.getSnapshot(), before);
});

test('a completed city marker without entity progress is invalidated without relocking travel', () => {
    const config = expandedStreetConfig(), save = new SaveManager(memoryStorage(), config.cityId);
    save.recordCityCompletion(config.cityId, 'garden');
    assert.equal(save.reconcileCityProgress(config), true);
    assert.equal(save.isCityCompleted(config.cityId), false);
    assert.equal(save.isCityUnlocked('garden'), true);
    assert.deepEqual(save.getCityProgress(config.cityId).completedTaskIds, []);
});
