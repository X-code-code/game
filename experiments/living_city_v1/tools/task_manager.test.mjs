import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskManager } from '../assets/scripts/task/TaskManager.ts';

const objectTask = (id, targetId, required = true) => ({
    id, type: 'hiddenObject', targetId, label: `寻找 ${targetId}`, required,
});
const chickenIdTask = (id, targetId, required = true) => ({
    id, type: 'chickenId', targetId, label: `寻找 ${targetId}`, required,
});
const chickenTagTask = (id, targetTag, required = true) => ({
    id, type: 'chickenTag', targetTag, label: `寻找 ${targetTag}`, required,
});
const objectHit = (id, tags = []) => ({ type: 'hiddenObject', id, tags });
const chickenHit = (id, tags = []) => ({ type: 'chicken', id, tags });

test('matches each supported task type using the clicked entity type, ID, and tags', () => {
    const manager = new TaskManager([
        objectTask('find_banana', 'banana_01'),
        chickenIdTask('find_blue', 'chick_blue'),
        chickenTagTask('find_sleeping', 'sleeping'),
    ]);

    assert.deepEqual(manager.handleTargetClicked(objectHit('banana_01', ['sleeping'])).completedTaskIds,
        ['find_banana']);
    assert.deepEqual(manager.handleTargetClicked(chickenHit('chick_blue', ['blue'])).completedTaskIds,
        ['find_blue']);
    assert.deepEqual(manager.handleTargetClicked(chickenHit('chick_gray', ['gray', 'sleeping'])).completedTaskIds,
        ['find_sleeping']);
    assert.deepEqual(manager.getProgress(), {
        requiredCompleted: 3, requiredTotal: 3,
        optionalCompleted: 0, optionalTotal: 0,
        allRequiredComplete: true,
    });
});

test('does not match an ID or tag reported by the wrong entity type', () => {
    const manager = new TaskManager([
        objectTask('find_key', 'key_01'),
        chickenIdTask('find_yellow', 'chick_yellow'),
        chickenTagTask('find_sleeping', 'sleeping'),
    ]);

    assert.deepEqual(manager.handleTargetClicked(chickenHit('key_01', ['sleeping'])).completedTaskIds,
        ['find_sleeping']);
    assert.deepEqual(manager.handleTargetClicked(objectHit('chick_yellow', ['sleeping'])).completedTaskIds,
        []);
    assert.deepEqual(manager.handleTargetClicked(objectHit('key_01')).completedTaskIds,
        ['find_key']);
    assert.equal(manager.isCompleted('find_yellow'), false);
    assert.equal(manager.getProgress().requiredCompleted, 2);
});

test('repeated reports complete a task only once', () => {
    const manager = new TaskManager([objectTask('find_parcel', 'parcel_01')]);
    const first = manager.handleTargetClicked(objectHit('parcel_01'));
    const again = manager.handleTargetClicked(objectHit('parcel_01'));

    assert.deepEqual(first.completedTaskIds, ['find_parcel']);
    assert.deepEqual(again.completedTaskIds, []);
    assert.deepEqual(again.progress, first.progress);
    assert.equal(manager.isCompleted('find_parcel'), true);
    assert.deepEqual(manager.getTaskStates().map(state => [state.config.id, state.completed]),
        [['find_parcel', true]]);
});

test('one chicken click can complete both an ID task and a matching tag task', () => {
    const manager = new TaskManager([
        chickenIdTask('find_gray', 'chick_gray'),
        chickenTagTask('find_sleeping', 'sleeping'),
        chickenTagTask('find_carrying', 'carrying'),
    ]);

    const result = manager.handleTargetClicked(chickenHit('chick_gray', ['gray', 'sleeping']));
    assert.deepEqual(result.completedTaskIds, ['find_gray', 'find_sleeping']);
    assert.equal(result.progress.requiredCompleted, 2);
    assert.equal(result.progress.allRequiredComplete, false);
    assert.deepEqual(manager.handleTargetClicked(chickenHit('chick_gray', ['gray', 'sleeping'])).completedTaskIds,
        []);
    assert.equal(manager.isCompleted('find_carrying'), false);
});

test('only required tasks gate main exploration, and optional tasks remain available afterward', () => {
    const manager = new TaskManager([
        objectTask('find_banana', 'banana_01'),
        chickenIdTask('find_blue', 'chick_blue'),
        chickenTagTask('find_sleeper', 'sleeping', false),
    ]);

    assert.deepEqual(manager.getProgress(), {
        requiredCompleted: 0, requiredTotal: 2,
        optionalCompleted: 0, optionalTotal: 1,
        allRequiredComplete: false,
    });
    manager.handleTargetClicked(objectHit('banana_01'));
    assert.equal(manager.getProgress().allRequiredComplete, false);
    manager.handleTargetClicked(chickenHit('chick_blue', ['walking']));
    assert.deepEqual(manager.getProgress(), {
        requiredCompleted: 2, requiredTotal: 2,
        optionalCompleted: 0, optionalTotal: 1,
        allRequiredComplete: true,
    });
    manager.handleTargetClicked(chickenHit('chick_gray', ['sleeping']));
    assert.deepEqual(manager.getProgress(), {
        requiredCompleted: 2, requiredTotal: 2,
        optionalCompleted: 1, optionalTotal: 1,
        allRequiredComplete: true,
    });
});

test('a city with no required tasks starts with its main exploration complete', () => {
    const manager = new TaskManager([chickenTagTask('find_hidden_chicken', 'hidden', false)]);

    assert.deepEqual(manager.getProgress(), {
        requiredCompleted: 0, requiredTotal: 0,
        optionalCompleted: 0, optionalTotal: 1,
        allRequiredComplete: true,
    });
    assert.deepEqual(manager.handleTargetClicked(chickenHit('chick_01', ['hidden'])).completedTaskIds,
        ['find_hidden_chicken']);
    assert.equal(manager.getProgress().allRequiredComplete, true);
});

test('duplicate task IDs are rejected when configuring a city', () => {
    assert.throws(() => new TaskManager([
        objectTask('duplicate', 'banana_01'),
        chickenIdTask('duplicate', 'chick_blue'),
    ]));
});
