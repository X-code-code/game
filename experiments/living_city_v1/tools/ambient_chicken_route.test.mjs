import test from 'node:test';
import assert from 'node:assert/strict';
import { AmbientChickenRoute } from '../assets/scripts/character/AmbientChickenRoute.ts';

const street = {
    id: 'market_vendor_blue',
    speed: 10,
    startOffsetSeconds: 0,
    stops: [
        { x: 0, y: 5, waitSeconds: 1, activity: 'browse', facing: 'right' },
        { x: 100, y: 5, waitSeconds: 1.5, activity: 'chat', facing: 'left' },
    ],
};

test('walks between stalls, waits for an activity, turns back without teleporting', () => {
    const npc = new AmbientChickenRoute(street);
    assert.equal(npc.pose.activity, 'browse');
    assert.equal(npc.pose.x, 0);
    npc.tick(1.2);
    assert.equal(npc.pose.moving, true);
    assert.ok(npc.pose.x > 0 && npc.pose.x < 10);
    assert.equal(npc.pose.facing, 'right');
    for (let step = 0; step < 120 && npc.pose.activity !== 'chat'; step++) npc.tick(0.1);
    assert.equal(npc.pose.x, 100);
    assert.equal(npc.pose.activity, 'chat');
    assert.equal(npc.pose.facing, 'left');
    npc.tick(2);
    assert.equal(npc.pose.moving, true);
    assert.ok(npc.pose.x < 100 && npc.pose.x > 80);
    for (let step = 0; step < 120 && npc.pose.activity !== 'browse'; step++) npc.tick(0.1);
    assert.equal(npc.pose.x, 0);
    assert.equal(npc.pose.activity, 'browse');
});

test('stable ID phase offsets make repeated builds match without crowd synchronization', () => {
    const make = id => new AmbientChickenRoute({ ...street, id, startOffsetSeconds: undefined });
    const first = make('shopper_one');
    const replica = make('shopper_one');
    const second = make('shopper_two');
    assert.deepEqual(first.pose, replica.pose);
    assert.notEqual(first.pose.animationSeconds, second.pose.animationSeconds);
    first.tick(0.35);
    replica.tick(0.35);
    assert.deepEqual(first.pose, replica.pose);
});

test('single-stop actors remain active, large and invalid frame times stay safe', () => {
    const npc = new AmbientChickenRoute({
        id: 'tea_stall_seller', speed: 20, startOffsetSeconds: 0,
        stops: [{ x: -30, y: 40, waitSeconds: 0.1, activity: 'gesture' }],
    });
    npc.tick(10000);
    assert.equal(npc.pose.x, -30);
    assert.equal(npc.pose.y, 40);
    assert.equal(npc.pose.activity, 'gesture');
    const previous = npc.pose;
    npc.tick(Number.NaN);
    assert.deepEqual(npc.pose, previous);
});

test('rejects broken route data before it enters the scene', () => {
    assert.throws(() => new AmbientChickenRoute({ ...street, stops: [] }));
    assert.throws(() => new AmbientChickenRoute({ ...street, speed: 0 }));
    assert.throws(() => new AmbientChickenRoute({ ...street, stops: [
        { x: Number.NaN, y: 1, waitSeconds: 2, activity: 'chat' },
    ] }));
});
