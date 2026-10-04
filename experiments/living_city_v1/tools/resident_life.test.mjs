import test from 'node:test';
import assert from 'node:assert/strict';
import { nextResidentWaypoint, ResidentEventDirector, ResidentIdleRoutine,
    residentConversationLine, resolveResidentIdleAction, resolveResidentRequest } from '../assets/scripts/map/ResidentLife.ts';

test('idle actions select the generated activity belonging to that actor', () => {
    assert.equal(resolveResidentIdleAction('messenger_customer', 'inspect_letter').visualAction, 'inspect_letter');
    assert.equal(resolveResidentIdleAction('messenger_customer', 'sip_tea').supported, false);
    assert.equal(resolveResidentIdleAction('tea_regular', 'sip_tea').visualAction, 'sip_tea');
    assert.equal(resolveResidentIdleAction('chestnut_seller', 'tend_cart').visualAction, 'stir_chestnuts');
    assert.equal(resolveResidentIdleAction('flower_buyer', 'look_at_flowers').visualAction, 'smell_flower');
    assert.equal(resolveResidentIdleAction('lantern_watcher', 'wave_at_passersby').clip, 'receive_w');
    for (const [actor, action] of [['tea_vendor', 'water_plants'], ['tea_regular', 'fish'],
        ['flower_buyer', 'carry_crate'], ['lane_child', 'skip'], ['tea_vendor', 'arrange_cups']]) {
        const pose = resolveResidentIdleAction(actor, action);
        assert.equal(pose.clip, 'idle_w');
        assert.equal(pose.supported, false);
    }
});

test('per-actor activity clocks repeat deterministically without crowd synchronization', () => {
    const first = new ResidentIdleRoutine('tea_regular', ['sip_tea', 'watch_market']);
    const replica = new ResidentIdleRoutine('tea_regular', ['sip_tea', 'watch_market']);
    const other = new ResidentIdleRoutine('lantern_watcher', ['wave_at_passersby', 'short_pause']);
    const firstClips = [], otherClips = [];
    for (let index = 0; index < 160; index++) {
        firstClips.push(first.tick(0.08, false).clip);
        otherClips.push(other.tick(0.08, false).clip);
        assert.deepEqual(first.pose, replica.tick(0.08, false));
    }
    assert.ok(firstClips.includes('receive_w'));
    assert.ok(firstClips.includes('idle_w'));
    assert.notDeepEqual(firstClips, otherClips);
    const previous = first.pose;
    first.tick(1, true);
    first.tick(Number.NaN, false);
    assert.deepEqual(first.pose, previous);
});

test('ping-pong residents traverse authored adjacent legs and event direction stays explicit', () => {
    let nextIndex = 1, direction = 1;
    const visits = [];
    for (let count = 0; count < 8; count++) {
        const arrived = nextIndex;
        visits.push(arrived);
        ({ nextIndex, direction } = nextResidentWaypoint(arrived, 4, false, 'ping_pong', direction));
        assert.equal(Math.abs(nextIndex - arrived), 1);
    }
    assert.deepEqual(visits, [1, 2, 3, 2, 1, 0, 1, 2]);
    assert.deepEqual(nextResidentWaypoint(3, 4, false, 'forward', 1), { nextIndex: 4, direction: 1 });
    assert.deepEqual(nextResidentWaypoint(3, 4, true, 'forward', 1), { nextIndex: 0, direction: 1 });
});

function event(id = 'tea_visit', overrides = {}) {
    return { id, trigger: { npcId: 'tea_regular', waypointIndex: 2 },
        participants: ['tea_regular', 'tea_vendor'], resumeRouteAfterSeconds: 1,
        repeat: true, cooldownSeconds: 2, actorBeats: [
            { npcId: 'tea_regular', atSeconds: 0, durationSeconds: 0.4, clip: 'idle_w' },
            { npcId: 'tea_regular', atSeconds: 0.4, durationSeconds: 0.6, clip: 'receive_w' },
            { npcId: 'tea_vendor', atSeconds: 0.2, durationSeconds: 0.8, clip: 'receive_w', facing: 1 },
        ], ...overrides };
}
function advance(director, seconds) {
    const finished = [];
    for (let count = 0; count < Math.round(seconds / 0.1); count++) finished.push(...director.tick(0.1));
    return finished;
}

test('scene events use authored participants, beats and duration, then permit cooled-down visits', () => {
    const director = new ResidentEventDirector([event()]);
    assert.equal(director.tryStart('tea_regular', 1), false);
    assert.equal(director.tryStart('tea_regular', 2, false), false);
    assert.equal(director.tryStart('tea_regular', 2), true);
    assert.equal(director.isParticipant('tea_vendor'), true);
    assert.equal(director.isParticipant('lane_child'), false);
    assert.equal(director.actorBeat('tea_regular').clip, 'idle_w');
    advance(director, 0.5);
    assert.equal(director.actorBeat('tea_regular').clip, 'receive_w');
    assert.equal(director.actorBeat('tea_vendor').facing, 1);
    assert.deepEqual(advance(director, 0.5), [{ eventId: 'tea_visit', triggerNpcId: 'tea_regular' }]);
    assert.equal(director.isParticipant('tea_vendor'), false);
    assert.equal(director.eventSeconds('tea_visit'), null);
    assert.equal(director.tryStart('tea_regular', 2), false);
    advance(director, 2.1);
    assert.equal(director.tryStart('tea_regular', 2), true);
    assert.equal(director.eventSeconds('tea_visit'), 0);
});

test('events sharing an actor cannot overlap; unrelated events run independently', () => {
    const director = new ResidentEventDirector([
        event(),
        event('next_customer', { trigger: { npcId: 'messenger_customer', waypointIndex: 3 },
            participants: ['messenger_customer', 'tea_vendor'], actorBeats: [] }),
        event('flower_visit', { trigger: { npcId: 'flower_buyer', waypointIndex: 1 },
            participants: ['flower_buyer', 'lantern_watcher'], actorBeats: [] }),
    ]);
    assert.equal(director.tryStart('tea_regular', 2), true);
    assert.equal(director.tryStart('messenger_customer', 3), false);
    assert.equal(director.tryStart('flower_buyer', 1), true);
    assert.equal(advance(director, 1).length, 2);
    assert.equal(director.tryStart('messenger_customer', 3), true);
});

test('one-shot legacy tea event keeps original generated beats and never retriggers', () => {
    const director = new ResidentEventDirector([{ id: 'tea_exchange',
        trigger: { npcId: 'messenger_customer', waypointIndex: 4 },
        participants: ['messenger_customer', 'tea_vendor'], resumeRouteAfterSeconds: 1.9 }]);
    assert.equal(director.tryStart('messenger_customer', 4), true);
    assert.equal(director.actorBeat('messenger_customer').clip, 'turn_nw_w');
    advance(director, 0.9);
    assert.equal(director.actorBeat('messenger_customer').clip, 'receive_w');
    assert.equal(director.actorBeat('tea_vendor').clip, 'receive_w');
    assert.equal(advance(director, 1).length, 1);
    advance(director, 20);
    assert.equal(director.tryStart('messenger_customer', 4), false);
});

test('resident delivery waits for the collected target and completes only once without consuming it', () => {
    const request = { id: 'postcard_delivery', npcId: 'messenger_customer', requiredTargetId: 'postcard',
        waitingMessage: '请帮我找回明信片。', completionMessage: '谢谢，明信片会寄到远方。' };
    assert.deepEqual(resolveResidentRequest(request, false, false),
        { message: request.waitingMessage, discoveryId: null });
    assert.deepEqual(resolveResidentRequest(request, true, false),
        { message: request.completionMessage, discoveryId: 'postcard_delivery' });
    assert.deepEqual(resolveResidentRequest(request, true, true),
        { message: request.completionMessage, discoveryId: null });
    assert.deepEqual(resolveResidentRequest(request, false, true),
        { message: request.completionMessage, discoveryId: null });
});

test('the eight new residents select only their own real job actions', () => {
    const jobs = [['flower_shopkeeper', 'smell_flower'], ['book_shopkeeper', 'read_book'],
        ['sweet_shopkeeper', 'offer_sweet'], ['noodle_shopkeeper', 'stir_bowl'],
        ['garden_neighbor', 'water_flower'], ['laundry_neighbor', 'hang_cloth'],
        ['strolling_reader', 'read_book'], ['visiting_child', 'wave']];
    for (const [id, action] of jobs) {
        const pose = resolveResidentIdleAction(id, action);
        assert.equal(pose.visualAction, action); assert.equal(pose.clip, 'receive_w'); assert.equal(pose.supported, true);
        assert.equal(resolveResidentIdleAction(id, 'carry_crate').supported, false);
    }
    assert.equal(resolveResidentIdleAction('book_shopkeeper', 'water_flower').supported, false);
    assert.equal(resolveResidentIdleAction('tea_regular', 'water_flower').supported, false);
});

test('short chat rotates deterministically and remains compatible with legacy single strings', () => {
    assert.equal(residentConversationLine('茶还是暖的。', 9), '茶还是暖的。');
    const lines = ['第一句。', ' ', '第二句。'];
    assert.equal(residentConversationLine(lines, 0), '第一句。');
    assert.equal(residentConversationLine(lines, 1), '第二句。');
    assert.equal(residentConversationLine(lines, 2), '第一句。');
    assert.equal(residentConversationLine(lines, Number.NaN), '第一句。');
    assert.equal(residentConversationLine(undefined), null);
    assert.equal(residentConversationLine([]), null);
});

function invitation(overrides = {}) {
    return { id: 'tea_invitation', trigger: { npcId: 'tea_vendor', waypointIndex: 0 },
        tapTriggerNpcId: 'tea_vendor', participants: ['tea_vendor'], repeat: true,
        cooldownSeconds: 8, resumeRouteAfterSeconds: 1.5, discoveryId: 'tea_break',
        actorBeats: [{ npcId: 'tea_vendor', atSeconds: 0, durationSeconds: 1.5,
            clip: 'receive_w', facing: 1 }], ...overrides };
}

test('tea invitation requires a resident tap, completes before awarding its discovery, and respects a full cooldown', () => {
    const director = new ResidentEventDirector([invitation()]);
    assert.equal(director.tryStart('tea_vendor', 0), false, 'waypoint arrival does not buy a cup automatically');
    assert.equal(director.tryStartByTap('tea_regular'), false);
    assert.equal(director.tryStartByTap('tea_vendor'), true);
    assert.equal(director.isParticipant('tea_regular'), false, 'the wandering regular is not reserved');
    assert.equal(director.actorBeat('tea_vendor').clip, 'receive_w');
    assert.equal(director.tryStartByTap('tea_vendor'), false, 'rapid repeated taps cannot overlap an activity');
    assert.deepEqual(advance(director, 1.4), [], 'a tap awards nothing until the last action beat');
    assert.deepEqual(advance(director, 0.1), [{ eventId: 'tea_invitation',
        triggerNpcId: 'tea_vendor', discoveryId: 'tea_break' }]);
    assert.equal(director.isParticipant('tea_vendor'), false);
    assert.equal(director.tryStartByTap('tea_vendor'), false);
    advance(director, 7.9);
    assert.equal(director.tryStartByTap('tea_vendor'), false);
    advance(director, 0.1);
    assert.equal(director.tryStartByTap('tea_vendor'), true, 'the free activity can play again once cooled down');
});

test('tea invitation and the regular exchange reserve their shared vendor without blocking an unrelated neighbor', () => {
    const director = new ResidentEventDirector([invitation(), event('tea_exchange', { cooldownSeconds: 0.5 }),
        event('flower_visit', { trigger: { npcId: 'flower_buyer', waypointIndex: 1 },
            participants: ['flower_buyer'], actorBeats: [] })]);
    assert.equal(director.tryStart('tea_regular', 2), true);
    assert.equal(director.tryStartByTap('tea_vendor'), false, 'tapping cannot interrupt a cup handoff');
    assert.equal(director.tryStart('flower_buyer', 1), true);
    advance(director, 1);
    assert.equal(director.tryStartByTap('tea_vendor'), true);
    advance(director, 1.1);
    assert.equal(director.tryStart('tea_regular', 2), false, 'a ready exchange cannot interrupt an offered cup');
    advance(director, 0.4);
    assert.equal(director.tryStart('tea_regular', 2), true);
});
