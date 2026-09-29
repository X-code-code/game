import test from 'node:test';
import assert from 'node:assert/strict';
import {
    HiddenObjectState, containsClickArea, hiddenObjectMapPosition,
} from '../assets/scripts/hidden_object/HiddenObjectState.ts';

const objectConfig = {
    id: 'banana_01', asset: 'demo_banana', x: 0.75, y: 0.25,
    scale: 1, rotation: 0, clickArea: { shape: 'circle', radius: 30, offset: { x: 10, y: -5 } },
    tags: ['food'], targetable: true,
};

test('normalized positions use the center of the map as origin', () => {
    assert.deepEqual(hiddenObjectMapPosition(objectConfig, { width: 2400, height: 1600 }), { x: 600, y: -400 });
});

test('rectangle and offset circle hit shapes reject their bounding-box corners', () => {
    assert.equal(containsClickArea({ shape: 'rect', width: 80, height: 40, offset: { x: 10, y: -10 } }, 50, 10), true);
    assert.equal(containsClickArea({ shape: 'rect', width: 80, height: 40, offset: { x: 10, y: -10 } }, 51, 10), false);
    assert.equal(containsClickArea(objectConfig.clickArea, 10, -5), true);
    assert.equal(containsClickArea(objectConfig.clickArea, 39, 24), false);
});

test('discovery reports the object once and cannot count it again', () => {
    const state = new HiddenObjectState(objectConfig);
    assert.equal(state.discover(60, 60), null);
    assert.deepEqual(state.discover(10, -5), { id: 'banana_01', tags: ['food'] });
    assert.equal(state.isFound, true);
    assert.equal(state.discover(10, -5), null);
});

test('non-targetable and conditionally hidden objects cannot be discovered', () => {
    const decoration = new HiddenObjectState({ ...objectConfig, targetable: false });
    assert.equal(decoration.discover(10, -5), null);
    const conditional = new HiddenObjectState({
        ...objectConfig, visibleCondition: { objectId: 'drawer', state: 'open' },
    });
    assert.equal(conditional.discover(10, -5), null);
    conditional.setVisible(true);
    assert.ok(conditional.discover(10, -5));
});
