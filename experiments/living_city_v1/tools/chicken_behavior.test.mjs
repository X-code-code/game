import test from 'node:test';
import assert from 'node:assert/strict';
import { ChickenBehaviorController } from '../assets/scripts/behavior/ChickenBehaviorController.ts';

test('walk converts normalized bounds, pauses, flips, and stays in range after a large frame', () => {
    const walk = new ChickenBehaviorController({
        behaviorType: 'walk', behaviorConfig: { pauseSeconds: 0.5 },
        speed: 100, movementRange: { minX: 0.4, maxX: 0.6 },
    }, 1000, 0, 'right');
    assert.equal(walk.pose().x, 0);
    assert.equal(walk.tick(1).x, 100);
    assert.equal(walk.pose().facing, 'left');
    assert.equal(walk.pose().moving, false);
    assert.equal(walk.tick(0.25).x, 100);
    assert.equal(walk.tick(0.25).moving, true);
    assert.equal(walk.tick(1).x, 0);
    assert.equal(walk.tick(1).x, -100);
    assert.equal(walk.pose().facing, 'right');
    assert.equal(walk.pose().moving, false);
    const afterLargeFrame = walk.tick(1000);
    assert.ok(afterLargeFrame.x >= -100 && afterLargeFrame.x <= 100);
    assert.ok(Number.isFinite(afterLargeFrame.visualY));
});

test('walk starts in the configured direction and safely handles a zero-width range', () => {
    const left = new ChickenBehaviorController({
        behaviorType: 'walk', behaviorConfig: {}, speed: 50,
        movementRange: { minX: 0.2, maxX: 0.8 },
    }, 1000, 0, 'left');
    assert.equal(left.tick(1).x, -50);
    assert.equal(left.pose().facing, 'left');
    const still = new ChickenBehaviorController({
        behaviorType: 'walk', behaviorConfig: {}, speed: 50,
        movementRange: { minX: 0.5, maxX: 0.5 },
    }, 1000, 80, 'right');
    assert.equal(still.tick(10).x, 0);
    assert.equal(still.pose().moving, false);
});

test('idle floats and can switch modes without moving the character', () => {
    const chicken = new ChickenBehaviorController({
        behaviorType: 'idle', behaviorConfig: { bobHeight: 4, blinkInterval: 1 },
    }, 1000, 25, 'right');
    assert.equal(chicken.pose().behaviorType, 'idle');
    assert.equal(chicken.pose().x, 25);
    assert.notEqual(chicken.tick(0.25).visualY, 0);
    assert.equal(chicken.tick(0.55).eyesClosed, true);
    const sleep = chicken.setBehavior({ behaviorType: 'sleep', behaviorConfig: { showZzz: true } });
    assert.equal(sleep.behaviorType, 'sleep');
    assert.equal(sleep.x, 25);
    assert.equal(sleep.eyesClosed, true);
});

test('peck dips and recovers three times, then pauses before repeating', () => {
    const chicken = new ChickenBehaviorController({
        behaviorType: 'peck', behaviorConfig: { pecksPerCycle: 3, pauseSeconds: 0.6 },
    }, 1000, 20, 'right');
    for (let index = 0; index < 3; index++) {
        const down = chicken.tick(0.16);
        assert.equal(down.peckIndex, index);
        assert.ok(down.headY < -20);
        assert.equal(down.x, 20);
        chicken.tick(0.16);
    }
    const pause = chicken.pose();
    assert.equal(pause.peckIndex, null);
    assert.equal(pause.headY, 0);
    assert.equal(chicken.tick(0.6).peckIndex, 0);
});

test('sleep closes eyes, breathes, and honors optional Zzz', () => {
    const chicken = new ChickenBehaviorController({
        behaviorType: 'sleep', behaviorConfig: { breathScale: 0.05, showZzz: true },
    }, 1000, 0, 'left');
    assert.equal(chicken.pose().eyesClosed, true);
    assert.equal(chicken.pose().showZzz, true);
    assert.ok(chicken.tick(0.4).visualScaleY > 1);
    assert.equal(chicken.tick(1).x, 0);
    assert.equal(chicken.tick(Number.NaN).behaviorType, 'sleep');
});
