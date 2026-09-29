import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCityCatalog, validateCityConfig } from '../assets/scripts/config/CityConfigValidator.ts';

const catalogData = () => ({
    schemaVersion: 1,
    initialCityId: 'demo',
    cities: [
        { cityId: 'demo', bundleName: 'city_demo' },
        { cityId: 'next', bundleName: 'city_next' },
    ],
});

const cityData = () => ({
    schemaVersion: 1,
    cityId: 'demo',
    cityName: '测试城',
    background: 'demo_background',
    mapSize: { width: 2400, height: 1600 },
    view: { minZoom: 1, maxZoom: 3, initialZoom: 1.6 },
    hiddenObjects: [{
        id: 'banana', asset: 'demo_banana', x: 0.4, y: 0.5, scale: 1, rotation: 0,
        clickArea: { shape: 'circle', radius: 40 }, tags: ['food'], targetable: true,
        visibleCondition: { objectId: 'box', state: 'open' },
    }],
    chickens: [{
        id: 'chick', skin: 'demo_yellow', x: 0.5, y: 0.4, scale: 0.8, facing: 'left',
        behaviorType: 'walk', behaviorConfig: { pauseSeconds: 0.5 }, speed: 30,
        movementRange: { minX: 0.3, maxX: 0.7 },
        accessories: ['demo_hat'], tags: ['walking'], targetable: true,
        clickArea: { shape: 'rect', width: 80, height: 90, offset: { x: 1, y: 2 } },
    }],
    interactiveObjects: [{
        id: 'box', asset: 'demo_box', x: 0.2, y: 0.3, scale: 1, rotation: 0,
        clickArea: { shape: 'rect', width: 90, height: 80 }, tags: [], targetable: true,
        initialState: 'closed', actions: [{ type: 'setState', objectId: 'box', state: 'open' }],
    }],
    tasks: [
        { id: 'find_banana', type: 'hiddenObject', targetId: 'banana', label: '找香蕉', required: true },
        { id: 'find_chick', type: 'chickenId', targetId: 'chick', label: '找小鸡', required: true },
        { id: 'find_walker', type: 'chickenTag', targetTag: 'walking', label: '找走路的小鸡', required: false },
    ],
    nextCityId: 'next',
    travelType: 'train',
    souvenir: 'demo_ticket',
    optionalContent: { collectibleIds: ['banana'] },
});

const validatedCatalog = () => validateCityCatalog(catalogData());
const check = (city) => validateCityConfig(city, validatedCatalog(), 'demo');
const expectCityError = (mutate, path) => {
    const city = cityData();
    mutate(city);
    assert.throws(() => check(city), error =>
        error instanceof Error && error.message.includes('CityConfig demo') && error.message.includes(path));
};

test('accepts a coherent catalog and city with all stage-7 entity and task types', () => {
    const catalog = validatedCatalog();
    const city = cityData();
    assert.equal(catalog.initialCityId, 'demo');
    assert.equal(validateCityConfig(city, catalog, 'demo'), city);
});

test('all shipped city bundles validate and the trial links to the existing test journey', () => {
    const catalog = validateCityCatalog(JSON.parse(readFileSync(
        new URL('../assets/resources/configs/city_catalog.json', import.meta.url), 'utf8')));
    const configs = new Map();
    for (const entry of catalog.cities) {
        const raw = JSON.parse(readFileSync(new URL(`../assets/bundles/${entry.bundleName}/city.json`, import.meta.url), 'utf8'));
        configs.set(entry.cityId, validateCityConfig(raw, catalog, entry.cityId));
    }
    const trial = configs.get(catalog.initialCityId);
    assert.equal(trial.cityId, 'winter_market_block_trial_001');
    assert.equal(trial.tasks.length, 2);
    assert.equal(trial.mapSize.width, 1024);
    assert.equal(trial.mapSize.height, 1536);
    assert.equal(trial.nextCityId, 'demo_city');
    const city = configs.get(trial.nextCityId);
    assert.equal(city.tasks.length, 3);
    const second = configs.get(city.nextCityId);
    assert.ok(second, 'First city must link to a loadable second city');
    assert.equal(second.nextCityId, null);
    assert.ok(second.tasks.some(task => task.required));
    assert.ok(second.tasks.some(task => !task.required));
});

test('catalog rejects unsupported versions, empty entries, duplicate IDs, and a missing start city', () => {
    const data = catalogData();
    data.schemaVersion = 2;
    assert.throws(() => validateCityCatalog(data), /CityCatalog \$\.schemaVersion/);
    data.schemaVersion = 1;
    data.cities[0].bundleName = '';
    assert.throws(() => validateCityCatalog(data), /CityCatalog \$\.cities\[0\]\.bundleName/);
    data.cities[0].bundleName = 'city_demo';
    data.cities[1].cityId = 'demo';
    assert.throws(() => validateCityCatalog(data), /CityCatalog \$\.cities\[1\]\.cityId.*duplicate/);
    data.cities[1].cityId = 'next';
    data.initialCityId = 'missing';
    assert.throws(() => validateCityCatalog(data), /CityCatalog \$\.initialCityId.*unknown/);
    data.initialCityId = 'demo';
    data.cities = [];
    assert.throws(() => validateCityCatalog(data), /CityCatalog \$\.cities.*at least one/);
});

test('city identity and next destination must agree with the catalog', () => {
    expectCityError(city => { city.schemaVersion = 2; }, '$.schemaVersion');
    expectCityError(city => { city.cityId = 'other'; }, '$.cityId');
    expectCityError(city => { city.nextCityId = 'missing'; }, '$.nextCityId');
    assert.throws(() => validateCityConfig(cityData(), validatedCatalog(), 'missing'),
        /CityConfig missing \$\.cityId/);
});

test('map dimensions, zoom, coordinates, click areas, and numeric fields are bounded', () => {
    expectCityError(city => { city.mapSize.width = 0; }, '$.mapSize.width');
    expectCityError(city => { city.view.minZoom = 0.9; }, '$.view.minZoom');
    expectCityError(city => { city.view.initialZoom = 4; }, '$.view.initialZoom');
    expectCityError(city => { city.hiddenObjects[0].x = 1.1; }, '$.hiddenObjects[0].x');
    expectCityError(city => { city.hiddenObjects[0].scale = -1; }, '$.hiddenObjects[0].scale');
    expectCityError(city => { city.hiddenObjects[0].rotation = NaN; }, '$.hiddenObjects[0].rotation');
    expectCityError(city => { city.chickens[0].clickArea.width = 0; }, '$.chickens[0].clickArea.width');
});

test('behavior parameters and movement ranges are checked before running the FSM', () => {
    expectCityError(city => { city.chickens[0].speed = 0; }, '$.chickens[0].speed');
    expectCityError(city => { city.chickens[0].movementRange.minX = 0.6; }, '$.chickens[0].x');
    expectCityError(city => { city.chickens[0].movementRange.maxX = 1.2; }, '$.chickens[0].movementRange.maxX');
    expectCityError(city => { city.chickens[0].behaviorConfig.pauseSeconds = -1; }, '$.chickens[0].behaviorConfig.pauseSeconds');
    expectCityError(city => {
        city.chickens[0].behaviorType = 'sleep';
        city.chickens[0].behaviorConfig = { showZzz: 'yes' };
        delete city.chickens[0].speed;
        delete city.chickens[0].movementRange;
    }, '$.chickens[0].behaviorConfig.showZzz');
});

test('entity and task IDs are unique and task targets must be clickable and type correct', () => {
    expectCityError(city => { city.chickens[0].id = 'banana'; }, '$.chickens[0].id');
    expectCityError(city => { city.tasks[1].id = 'find_banana'; }, '$.tasks[1].id');
    expectCityError(city => { city.tasks[0].targetId = 'chick'; }, '$.tasks[0].targetId');
    expectCityError(city => { city.hiddenObjects[0].targetable = false; }, '$.tasks[0].targetId');
    expectCityError(city => { city.tasks[2].targetTag = 'asleep'; }, '$.tasks[2].targetTag');
    expectCityError(city => { city.chickens[0].targetable = false; }, '$.tasks[1].targetId');
});

test('interactive state references and collectible IDs resolve within the city', () => {
    expectCityError(city => { city.hiddenObjects[0].visibleCondition.objectId = 'missing'; },
        '$.hiddenObjects[0].visibleCondition.objectId');
    expectCityError(city => { city.hiddenObjects[0].visibleCondition.state = 'locked'; },
        '$.hiddenObjects[0].visibleCondition.state');
    expectCityError(city => { city.interactiveObjects[0].actions[0].objectId = 'missing'; },
        '$.interactiveObjects[0].actions[0].objectId');
    expectCityError(city => { city.optionalContent.collectibleIds = ['missing']; },
        '$.optionalContent.collectibleIds[0]');
});

test('all resource IDs are required even when current graphics are temporary', () => {
    expectCityError(city => { city.background = ' '; }, '$.background');
    expectCityError(city => { city.hiddenObjects[0].asset = ''; }, '$.hiddenObjects[0].asset');
    expectCityError(city => { city.chickens[0].skin = ''; }, '$.chickens[0].skin');
    expectCityError(city => { city.chickens[0].accessories = ['']; }, '$.chickens[0].accessories[0]');
    expectCityError(city => { city.souvenir = ''; }, '$.souvenir');
});

test('foreground cutouts accept world coordinates and reject unusable depth data', () => {
    const valid = cityData();
    valid.hiddenObjects[0].depthY = -180;
    valid.chickens[0].depthY = -120;
    valid.foregroundSprites = [{
        id: 'market_counter_front', asset: 'market_counter_front',
        x: 160, y: -120, width: 480, height: 220, footY: -190,
    }];
    assert.equal(check(valid), valid);
    expectCityError(city => {
        city.foregroundSprites = [{ ...valid.foregroundSprites[0], id: 'banana' }];
    }, '$.foregroundSprites[0].id');
    expectCityError(city => {
        city.foregroundSprites = [{ ...valid.foregroundSprites[0], x: 1201 }];
    }, '$.foregroundSprites[0].x');
    expectCityError(city => {
        city.foregroundSprites = [{ ...valid.foregroundSprites[0], footY: -801 }];
    }, '$.foregroundSprites[0].footY');
    expectCityError(city => {
        city.foregroundSprites = [{ ...valid.foregroundSprites[0], width: 0 }];
    }, '$.foregroundSprites[0].width');
    expectCityError(city => { city.hiddenObjects[0].depthY = 801; }, '$.hiddenObjects[0].depthY');
    expectCityError(city => { city.chickens[0].depthY = 'near'; }, '$.chickens[0].depthY');
});
