import test from 'node:test';
import assert from 'node:assert/strict';
import { ChickenCharacterState, chickenMapPosition } from '../assets/scripts/character/ChickenCharacterState.ts';

const chicken = {
    id: 'chick_yellow', skin: 'demo_yellow', x: 0.75, y: 0.25,
    scale: 0.9, facing: 'left', behaviorType: 'idle', behaviorConfig: {},
    carryItem: 'demo_egg', accessories: ['demo_straw_hat'],
    clickArea: { shape: 'circle', radius: 40, offset: { x: 5, y: -5 } },
    tags: ['yellow', 'carrying'], targetable: true,
};

test('chicken coordinates follow the centered map and preserve visual configuration', () => {
    assert.deepEqual(chickenMapPosition(chicken, { width: 2400, height: 1600 }), { x: 600, y: -400 });
    const state = new ChickenCharacterState(chicken);
    assert.equal(state.config.facing, 'left');
    assert.equal(state.config.skin, 'demo_yellow');
    assert.deepEqual(state.config.accessories, ['demo_straw_hat']);
    assert.equal(state.config.carryItem, 'demo_egg');
});

test('click shapes use local coordinates and reject points outside the circle or rectangle', () => {
    const circle = new ChickenCharacterState(chicken);
    assert.equal(circle.hitTest(5, -5), true);
    assert.equal(circle.hitTest(45, -5), true);
    assert.equal(circle.hitTest(45, 35), false);
    const rectangle = new ChickenCharacterState({
        ...chicken, clickArea: { shape: 'rect', width: 80, height: 50, offset: { x: 10, y: -10 } },
    });
    assert.equal(rectangle.hitTest(50, 15), true);
    assert.equal(rectangle.hitTest(51, 15), false);
});

test('each tap reports id and tags without taking ownership of task progress', () => {
    const state = new ChickenCharacterState(chicken);
    assert.deepEqual(state.click(5, -5), { id: 'chick_yellow', tags: ['yellow', 'carrying'] });
    assert.deepEqual(state.click(5, -5), { id: 'chick_yellow', tags: ['yellow', 'carrying'] });
    assert.equal(state.click(100, 100), null);
});

test('non-targetable and conditionally hidden chickens cannot be clicked', () => {
    assert.equal(new ChickenCharacterState({ ...chicken, targetable: false }).click(5, -5), null);
    const hidden = new ChickenCharacterState({
        ...chicken, visibleCondition: { objectId: 'door', state: 'open' },
    });
    assert.equal(hidden.isVisible, false);
    assert.equal(hidden.click(5, -5), null);
    hidden.setVisible(true);
    assert.ok(hidden.click(5, -5));
});
