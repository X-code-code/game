import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const blueprintPath = path.resolve(here, '../design/street_block_01.json');
const scene = JSON.parse(readFileSync(blueprintPath, 'utf8'));
const polishLayout = scene.layoutVersion === 'street_polish_v9';
const richLayout = scene.layoutVersion === 'street_content_v6';
const courtyardLayout = ['street_courtyards_v8','street_polish_v9'].includes(scene.layoutVersion);
const neighborhoodLayout = scene.layoutVersion === 'street_neighborhood_v7' || courtyardLayout;
const compactLayout = (scene.layoutVersion?.startsWith('street_screen_overhaul_v5') ?? false) || richLayout || neighborhoodLayout;
const wideLayout = scene.layoutVersion === 'street_screen_overhaul_v5_wide' || richLayout || neighborhoodLayout;
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const xy = pair => ({ x: pair[0], y: pair[1] });
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const bounds = { left: -scene.map.width / 2, right: scene.map.width / 2,
    bottom: -scene.map.height / 2, top: scene.map.height / 2 };

function inBounds(p) {
    return p.x >= bounds.left && p.x <= bounds.right &&
        p.y >= bounds.bottom && p.y <= bounds.top;
}

function onSegment(p, a, b) {
    return Math.abs(cross(a, b, p)) < 1e-6 &&
        p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 &&
        p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
}

function inside(p, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = xy(polygon[j]);
        const b = xy(polygon[i]);
        if (onSegment(p, a, b)) return true;
        if ((a.y > p.y) !== (b.y > p.y) &&
            p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
}

function segmentDistanceSq(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return distSq(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function circleIntersectsPolygon(p, radius, polygon) {
    if (inside(p, polygon)) return true;
    const threshold = radius * radius;
    return polygon.some((item, i) =>
        segmentDistanceSq(p, xy(item), xy(polygon[(i + 1) % polygon.length])) < threshold);
}

function circleWithinRegions(p, radius, regions) {
    // Eight perimeter probes are sufficient for this rectangular production greybox.
    // Runtime collision should use the actual scene's polygon union.
    if (!regions.some(region => inside(p, region.polygon))) return false;
    for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const rim = { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius };
        if (!regions.some(region => inside(rim, region.polygon))) return false;
    }
    return true;
}

function intersect(a, b, c, d) {
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
        ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function validatePolygon(id, polygon) {
    check(Array.isArray(polygon) && polygon.length >= 3, `${id}: polygon needs >=3 vertices`);
    if (!Array.isArray(polygon) || polygon.length < 3) return;
    polygon.forEach((pair, i) => {
        check(Array.isArray(pair) && pair.length === 2 &&
            Number.isFinite(pair[0]) && Number.isFinite(pair[1]), `${id}: vertex ${i} is invalid`);
        if (Array.isArray(pair) && pair.length === 2) check(inBounds(xy(pair)), `${id}: vertex ${i} outside map`);
    });
    let area2 = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = xy(polygon[i]);
        const b = xy(polygon[(i + 1) % polygon.length]);
        area2 += a.x * b.y - b.x * a.y;
        for (let j = i + 2; j < polygon.length; j++) {
            if (i === 0 && j === polygon.length - 1) continue;
            const c = xy(polygon[j]);
            const d = xy(polygon[(j + 1) % polygon.length]);
            check(!intersect(a, b, c, d), `${id}: self-intersection between edges ${i}/${j}`);
        }
    }
    check(Math.abs(area2) > 1, `${id}: zero-area polygon`);
}

check(scene.schemaVersion === 1, 'Unsupported blueprint version');
check(scene.coordinateSystem.origin === 'map_center' && scene.coordinateSystem.yPositive === 'up',
    'Unexpected coordinate convention');
check(scene.map.width === (wideLayout ? 2304 : 1536) && scene.map.height === 2048, 'Map size differs from art plan');

const ids = new Set();
function unique(id, location) {
    check(typeof id === 'string' && id.length > 0, `${location}: missing ID`);
    check(!ids.has(id), `${location}: duplicate ID ${id}`);
    ids.add(id);
}

const layers = new Set(scene.renderLayers.map(layer => layer.id));
const art = new Map();
for (const slot of scene.artSlots) {
    unique(slot.id, 'artSlots');
    art.set(slot.id, slot);
    check(layers.has(slot.layer), `${slot.id}: unknown layer ${slot.layer}`);
    check(point(slot.center) && slot.size?.width > 0 && slot.size?.height > 0, `${slot.id}: invalid bounds`);
    if (point(slot.center) && slot.size?.width > 0 && slot.size?.height > 0) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const corner = { x: slot.center.x + sx * slot.size.width / 2,
                y: slot.center.y + sy * slot.size.height / 2 };
            check(inBounds(corner), `${slot.id}: authored canvas exceeds map`);
        }
    }
    if (slot.layer === 'depth') check(Number.isFinite(slot.footY), `${slot.id}: missing depth footY`);
}

for (const region of scene.walkableRegions) {
    unique(region.id, 'walkableRegions');
    validatePolygon(region.id, region.polygon);
}
const publicRegions = scene.walkableRegions.filter(region => region.access === 'public');
const vendorRegions = scene.walkableRegions.filter(region => region.access === 'vendor_only');
function regionsOverlap(a, b) {
    // Narrow bending paths need actual polygon overlap, not overlapping bounding
    // boxes. A shared corner alone does not establish a traversable connection.
    const strictInside = (p, polygon) => inside(p, polygon) && !polygon.some((q, i) =>
        onSegment(p, xy(q), xy(polygon[(i + 1) % polygon.length])));
    const probes = polygon => polygon.flatMap((pair, i) => {
        const next = polygon[(i + 1) % polygon.length];
        return [xy(pair), { x: (pair[0] + next[0]) / 2, y: (pair[1] + next[1]) / 2 }];
    });
    if (probes(a.polygon).some(p => strictInside(p, b.polygon)) ||
        probes(b.polygon).some(p => strictInside(p, a.polygon))) return true;
    return a.polygon.some((aa, i) => b.polygon.some((bb, j) => intersect(xy(aa),
        xy(a.polygon[(i + 1) % a.polygon.length]), xy(bb), xy(b.polygon[(j + 1) % b.polygon.length]))));
}
const reached = new Set([publicRegions[0]?.id]);
let changed = true;
while (changed) {
    changed = false;
    for (const area of publicRegions) {
        if (reached.has(area.id)) continue;
        if (publicRegions.some(other => reached.has(other.id) && regionsOverlap(area, other))) {
            reached.add(area.id);
            changed = true;
        }
    }
}
check(reached.size === publicRegions.length, 'Public walkable regions are disconnected');
const blockers = scene.physicalFootprints;
for (const blocker of blockers) {
    unique(blocker.id, 'physicalFootprints');
    check(art.has(blocker.artSlotId), `${blocker.id}: no art slot ${blocker.artSlotId}`);
    validatePolygon(blocker.id, blocker.polygon);
}

function validateFoot(p, radius, access, label) {
    const regions = access === 'vendor_only' ? vendorRegions : publicRegions;
    check(circleWithinRegions(p, radius, regions), `${label}: foot circle leaves its walkable region`);
    for (const blocker of blockers) {
        check(!circleIntersectsPolygon(p, radius, blocker.polygon),
            `${label}: hits ${blocker.id}`);
    }
}

const spots = new Map();
for (const spot of scene.standingSpots) {
    unique(spot.id, 'standingSpots');
    spots.set(spot.id, spot);
    check(point(spot.at) && inBounds(spot.at), `${spot.id}: invalid position`);
    if (spot.access !== 'counter_surface') validateFoot(spot.at, spot.clearRadius, spot.access, spot.id);
}
check(Math.abs(spots.get('tea_vendor_foot')?.at.y - spots.get('tea_customer_foot')?.at.y) <= 20,
    'Tea feet must face across the same counter line');
check(distSq(spots.get('tea_vendor_foot').at, spots.get('tea_customer_foot').at) <= 150 ** 2,
    'Tea participants stand too far apart');

const npcs = new Map();
for (const npc of scene.npcPlans) {
    unique(npc.id, 'npcPlans');
    npcs.set(npc.id, npc);
    const minActorHeight = compactLayout ? 78 : 100;
    const maxActorHeight = compactLayout ? 90 : 135;
    check(Number.isFinite(npc.actorHeight) && npc.actorHeight >= minActorHeight && npc.actorHeight <= maxActorHeight,
        `${npc.id}: actor height outside phone readability plan`);
    check(Number.isFinite(npc.footRadius) && npc.footRadius > 0, `${npc.id}: foot radius invalid`);
    check(Array.isArray(npc.route) && npc.route.length > 0, `${npc.id}: missing route`);
    const access = npc.id === 'tea_vendor' ? 'vendor_only' : 'public';
    for (let i = 0; i < npc.route.length; i++) {
        const target = npc.route[i];
        check(point(target) && inBounds(target), `${npc.id}: invalid waypoint ${i}`);
        if (i === 0) {
            validateFoot(target, npc.footRadius, access, `${npc.id} waypoint 0`);
            continue;
        }
        const prev = npc.route[i - 1];
        const distance = Math.sqrt(distSq(prev, target));
        const steps = Math.max(1, Math.ceil(distance / 10));
        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            const sample = { x: prev.x + (target.x - prev.x) * t,
                y: prev.y + (target.y - prev.y) * t };
            validateFoot(sample, npc.footRadius, access,
                `${npc.id} segment ${i - 1}->${i} t=${t.toFixed(2)}`);
        }
    }
    if (npc.loop && npc.routeMode !== 'ping_pong' && npc.route.length > 1) {
        const start = npc.route.at(-1), end = npc.route[0];
        const steps = Math.max(1, Math.ceil(Math.sqrt(distSq(start, end)) / 10));
        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            validateFoot({ x: start.x + (end.x - start.x) * t,
                y: start.y + (end.y - start.y) * t }, npc.footRadius, access,
            `${npc.id} loop return t=${t.toFixed(2)}`);
        }
    }
}

// The chestnut seller must stand on the street beside the cart's front lip.
// A foot circle alone did not catch the earlier pose on the food shop facade.
const chestnutCart = art.get('lc_chestnut_cart_back');
const chestnutFront = art.get('lc_chestnut_cart_front');
const foodShop = art.get('lc_east_food_shop_back');
const seller = npcs.get('chestnut_seller');
const sellerSpot = spots.get('chestnut_seller_foot');
if (chestnutCart && chestnutFront && foodShop && seller?.route[0] && sellerSpot) {
    const shopLeft = foodShop.center.x - foodShop.size.width / 2;
    const cartLeft = chestnutCart.center.x - chestnutCart.size.width / 2;
    const cartRight = chestnutCart.center.x + chestnutCart.size.width / 2;
    const foot = seller.route[0];
    check(cartRight <= shopLeft, 'Chestnut cart overlaps the food shop facade');
    check(foot.x + seller.footRadius <= shopLeft,
        'Chestnut seller stands on the food shop facade');
    check(foot.y > chestnutFront.footY + seller.footRadius,
        'Chestnut seller foot must be behind the cart front lip');
    const leftOfCart = foot.x + seller.footRadius <= cartLeft &&
        cartLeft - foot.x - seller.footRadius <= 80;
    const rightOfCart = foot.x - seller.footRadius >= cartRight &&
        foot.x - seller.footRadius - cartRight <= 80;
    check(leftOfCart || rightOfCart,
        'Chestnut seller feet must stand beside the cart, within working reach');
    check(distSq(foot, sellerSpot.at) < 1,
        'Chestnut seller standing spot differs from the NPC route');
}
if (compactLayout) {
    const cartBlock = blockers.find(blocker => blocker.id === 'bun_cart_block');
    const foot = seller?.route[0];
    check(!!cartBlock && !!foot && !!sellerSpot, 'Food cart must have a seller, working spot, and ground footprint');
    if (foot && sellerSpot && cartBlock) {
        check(distSq(foot, sellerSpot.at) < 1, 'Food cart seller route and standing spot differ');
        const reach = Math.min(...cartBlock.polygon.map((a, i) =>
            segmentDistanceSq(foot, xy(a), xy(cartBlock.polygon[(i + 1) % cartBlock.polygon.length]))));
        check(reach <= 80 ** 2, 'Food cart seller is outside working reach');
    }
    check(scene.artSlots.filter(slot => slot.id.startsWith('lc5_') && !slot.reusedGeneratedSourceBatch).length === 14,
        'Stage 1 must register the fourteen generated core layers');
    check(!scene.artSlots.some(slot => slot.layer === 'target_foreground'),
        'Stage 1 must not retain obsolete target foreground fragments');
    check(npcs.get('messenger_customer')?.loop === false,
        'Postal chicken must retain a single forward route');
    const regular = npcs.get('tea_regular');
    check(regular?.routeMode === 'ping_pong', 'Tea regular must use adjacent waypoints on the return trip');
    check(regular?.pauseSecondsAtWaypoints?.['0'] >= 4 &&
        regular?.pauseSecondsAtWaypoints?.[String(regular.route.length - 1)] >= 5,
    'Tea regular must pause at the table and counter');
    if (wideLayout) {
        check(scene.artSlots.length === (polishLayout ? 65 : courtyardLayout ? 63 : neighborhoodLayout ? 49 : richLayout ? 61 : 25),
            polishLayout ? 'Polish stage needs sixty-five purposeful PNG placements' : courtyardLayout ? 'Courtyard stage must retain sixty-three purposeful PNG placements' :
            neighborhoodLayout ? 'Neighborhood stage must retain forty-nine purposeful scene placements' :
            richLayout ? 'Content stage must register sixty-one source-backed placements' :
                'Wide stage 1 must register twenty-five generated scene placements');
        const extraSlots = scene.artSlots.filter(slot => slot.instanceOfSlotId);
        check(extraSlots.length === (neighborhoodLayout ? 18 : richLayout ? 36 : 6),
            neighborhoodLayout ? 'Neighborhood stage must retire redundant furniture and retain eighteen useful instances' :
            richLayout ? 'Content stage must preserve six courtyard instances and add thirty shared source instances' :
                'Wide stage 1 must include six west/east courtyard instances');
        for (const extra of extraSlots) {
            const original = art.get(extra.instanceOfSlotId);
            check(!!original && JSON.stringify(extra.size) === JSON.stringify(original.size),
                `${extra.id}: shared generated source instance dimensions changed`);
        }
    }
}

if (courtyardLayout) {
    const aprons = scene.artSlots.filter(slot => slot.id.startsWith('lc8_') && slot.layer === 'ground');
    const landscaping = scene.artSlots.filter(slot => slot.id.startsWith('lc8_') && slot.layer === 'depth');
    check(aprons.length === 7 && new Set(aprons.map(slot => slot.generatedSourceId)).size === 7,
        'Courtyard stage needs seven independently generated shop/house aprons');
    check(scene.artSlots.filter(slot => slot.layer === 'ground').length === 8 &&
        scene.artSlots[0].id === 'lc5_ground_paving', 'Original map ground must precede the seven transparent aprons');
    check(landscaping.length === 7 && new Set(landscaping.map(slot => slot.generatedSourceId)).size === 3,
        'Courtyard stage needs seven low landscape placements from three generated sources');
    for (const slot of [...aprons, ...landscaping]) {
        check(slot.alpha === true && slot.generatedSourceBatch === 'ai_image_v8' &&
            slot.generatedSourceId?.endsWith('_v8') && !slot.instanceOfSlotId,
        `${slot.id}: explicit v8 source and transparent PNG provenance required`);
        check(slot.center.x - slot.size.width / 2 >= bounds.left + scene.map.safeOuterMargin &&
            slot.center.x + slot.size.width / 2 <= bounds.right - scene.map.safeOuterMargin &&
            slot.center.y - slot.size.height / 2 >= bounds.bottom + scene.map.safeOuterMargin &&
            slot.center.y + slot.size.height / 2 <= bounds.top - scene.map.safeOuterMargin,
        `${slot.id}: new courtyard art exceeds the authored outer safe margin`);
    }
    for (const apron of aprons) {
        check(apron.footY === undefined && !scene.physicalFootprints.some(item => item.artSlotId === apron.id),
            `${apron.id}: flat ground must not be depth-sorted or block residents`);
    }
    const crate = scene.physicalFootprints.find(item => item.artSlotId === 'lc6_central_crates');
    check(JSON.stringify(crate?.polygon) === JSON.stringify([[125, 810], [225, 810], [225, 870], [125, 870]]),
        'Central crate collision strip must match its retained final PNG ground contact');
}

if (richLayout || neighborhoodLayout) {
    const newSlots = scene.artSlots.filter(slot => slot.id.startsWith('lc6_'));
    const newGeneratedSlots = newSlots.filter(slot => slot.generatedSourceId);
    const newInstances = newSlots.filter(slot => slot.instanceOfSlotId);
    check(newSlots.length === (neighborhoodLayout ? 18 : 36) && newGeneratedSlots.length === 6 &&
        newInstances.length === (neighborhoodLayout ? 12 : 30),
        'Content stage needs six generated furniture sources and a correctly recorded set of source instances');
    for (const slot of newSlots) {
        check(Boolean(slot.generatedSourceId) !== Boolean(slot.instanceOfSlotId),
            `${slot.id}: choose one generated source or an existing source instance`);
        if (slot.instanceOfSlotId) check(slot.instanceOfSlotId.startsWith('lc5_') &&
            slot.reusedGeneratedSourceBatch === 'ai_image_v5', `${slot.id}: shared source provenance missing`);
    }
    check(scene.hiddenObjectSlots.length === (polishLayout ? 32 : 24) && scene.interactiveSlots.length === (polishLayout ? 8 : 6),
        polishLayout ? 'Polish stage needs thirty-two targets and eight reveals' : 'Content stage needs twenty-four targets and six independent reveal objects');
    check(scene.lifeGroups?.length === 6, 'Content stage needs six living groups');
    const groupIds = new Set();
    for (const group of scene.lifeGroups ?? []) {
        check(!groupIds.has(group.id), `${group.id}: duplicated living group`);
        groupIds.add(group.id);
        check(point(group.at) && inBounds(group.at), `${group.id}: invalid group focus`);
        check(group.artSlotIds?.length >= (neighborhoodLayout ? 2 : 5) && group.targetIds?.length >= 2,
            `${group.id}: group needs purposeful placements and two targets`);
        for (const id of group.artSlotIds ?? []) check(art.get(id)?.lifeGroupId === group.id,
            `${group.id}: unrelated or missing scene placement ${id}`);
        for (const id of group.targetIds ?? []) check(scene.hiddenObjectSlots.some(target =>
            target.id === id && target.lifeGroupId === group.id), `${group.id}: unrelated or missing target ${id}`);
    }
    for (const discovery of scene.sceneDiscoveries ?? []) {
        unique(discovery.id, 'sceneDiscoveries');
        check(art.has(discovery.supportArtSlotId), `${discovery.id}: no discovery support`);
        check(point(discovery.at) && inBounds(discovery.at) && discovery.clickRadiusWorld > 0 &&
            typeof discovery.message === 'string' && discovery.message.length > 0,
        `${discovery.id}: invalid discovery trigger`);
    }
    for (const request of scene.residentRequests ?? []) {
        unique(request.id, 'residentRequests');
        check(npcs.has(request.npcId) && scene.hiddenObjectSlots.some(target => target.id === request.requiredTargetId),
            `${request.id}: missing resident or required object`);
        check(request.waitingMessage?.length > 0 && request.completionMessage?.length > 0,
            `${request.id}: resident request has no feedback`);
    }
}

if (neighborhoodLayout) {
    const buildings = scene.artSlots.filter(slot => slot.layer === 'building_back');
    const newBuildings = buildings.filter(slot => slot.id.startsWith('lc7_'));
    const newResidents = scene.npcPlans.filter(npc => npc.homeArtSlotId?.startsWith('lc7_') &&
        npc.supportedTravelView === 'side_only' && npc.generatedSourceId?.startsWith('chicken_') &&
        /_v\d+$/.test(npc.generatedSourceId ?? ''));
    check(buildings.length >= 11 && newBuildings.length === 6,
        'Neighborhood stage needs eleven distinct facades, including six independent v7 sources');
    check(new Set(newBuildings.map(slot => slot.generatedSourceId)).size === 6 &&
        newBuildings.every(slot => slot.generatedSourceId?.endsWith('_v7') && !slot.instanceOfSlotId),
        'Neighborhood facades must record six distinct generated sources');
    check(scene.npcPlans.length === 16 && newResidents.length === 8 &&
        new Set(newResidents.map(npc=>npc.generatedSourceId)).size === 8,
        'Neighborhood stage needs sixteen residents and eight independently sourced neighborhood residents');
    for (const npc of newResidents) {
        check(npc.routeMode === 'ping_pong' && npc.loop && npc.route.length >= 2 &&
            npc.route.every(p => Math.abs(p.y - npc.route[0].y) < 0.01),
        `${npc.id}: side-view animation requires a horizontal adjacent-point return route`);
        check(npc.initialPauseSeconds > 0 && npc.pauseSecondsAtWaypoints?.['0'] > 0 &&
            npc.pauseSecondsAtWaypoints?.[String(npc.route.length - 1)] > 0,
        `${npc.id}: resident must pause visibly at both neighborhood destinations`);
        check(art.get(npc.homeArtSlotId)?.id.startsWith('lc7_'), `${npc.id}: missing new neighborhood home`);
    }
    const retainedTargetIds = ['tea_clay_whistle', 'tailor_thimble', 'banner_knot', 'chestnut_tongs',
        'pocket_watch', 'sewing_scissors', 'blue_feather', 'sealed_letter', 'honey_dipper', 'seed_packet',
        'orchard_apple', 'golden_bun', 'reading_glasses', 'bookmark', 'garden_glove', 'seedling_spade',
        'wooden_bird', 'pink_watering_can', 'postcard', 'stamp_roll', 'tiny_camera', 'yarn_ball',
        'picnic_cookie', 'laundry_peg'];
    check(retainedTargetIds.every(id => scene.hiddenObjectSlots.some(target => target.id === id)),
        'Neighborhood upgrade changed a saved target ID');
}

for (const event of scene.sceneEvents) {
    unique(event.id, 'sceneEvents');
    const actor = npcs.get(event.trigger.npcId);
    check(!!actor, `${event.id}: unknown trigger actor`);
    check(actor?.route[event.trigger.waypointIndex] !== undefined, `${event.id}: invalid trigger waypoint`);
    check(event.participants.every(id => npcs.has(id)), `${event.id}: unknown participant`);
    const beats = event.actorBeats ?? event.beats ?? [];
    check(beats.length >= (event.tapTriggerNpcId ? 1 : 3),
        `${event.id}: missing required actor beats`);
    if (event.tapTriggerNpcId) {
        check(npcs.has(event.tapTriggerNpcId) && event.tapTriggerNpcId === event.trigger.npcId &&
            event.participants.includes(event.tapTriggerNpcId), `${event.id}: invalid manual interaction participant`);
        check(event.cooldownSeconds > 0 && event.discoveryId?.length > 0,
            `${event.id}: manual interaction needs a cooldown and optional discovery ID`);
    }
    for (const beat of beats) {
        if (beat.npcId) check(npcs.has(beat.npcId), `${event.id}: unknown beat actor ${beat.npcId}`);
        check(beat.atSeconds >= 0 && beat.durationSeconds > 0 &&
            event.resumeRouteAfterSeconds + 1e-6 >= beat.atSeconds + beat.durationSeconds,
        `${event.id}: actor leaves before a beat is complete`);
    }
    if (event.prop) {
        check(point(event.prop.at) && inBounds(event.prop.at), `${event.id}: invalid generated prop position`);
        check(event.prop.visibleFromSeconds >= 0 && event.prop.visibleUntilSeconds > event.prop.visibleFromSeconds &&
            event.prop.visibleUntilSeconds <= event.resumeRouteAfterSeconds,
        `${event.id}: generated prop visibility leaves the event`);
        if (event.id === 'tea_exchange') check(distSq(event.prop.at, spots.get('tea_cup_handoff').at) < 1,
            'Tea event prop and tea_cup_handoff standing spot differ');
    }
}

const fit = Math.max(scene.camera.referenceViewport.width / scene.map.width,
    scene.camera.referenceViewport.height / scene.map.height);
const initialScale = fit * scene.camera.initialZoom;
const detailScale = fit * scene.camera.maxZoom;
// Match CityViewport's outer-edge clamp at the default zoom. Positive requested
// focus can hit the north boundary even when a designer asks to center higher.
const focusLimitX = Math.max(0, scene.map.width / 2 - scene.camera.referenceViewport.width / (2 * initialScale));
const focusLimitY = Math.max(0, scene.map.height / 2 - scene.camera.referenceViewport.height / (2 * initialScale));
const initialFocus = {
    x: Math.max(-focusLimitX, Math.min(focusLimitX, scene.camera.initialFocus.x)),
    y: Math.max(-focusLimitY - scene.camera.hudBottomReserveScreenPx / initialScale,
        Math.min(focusLimitY, scene.camera.initialFocus.y)),
};
const visible = (p, focus, scale) =>
    Math.abs(p.x - focus.x) <= scene.camera.referenceViewport.width / (2 * scale) &&
    Math.abs(p.y - focus.y) <= scene.camera.referenceViewport.height / (2 * scale);
for (const target of scene.hiddenObjectSlots) {
    unique(target.id, 'hiddenObjectSlots');
    const support = art.get(target.supportArtSlotId);
    check(!!support, `${target.id}: no support art slot`);
    check(point(target.at) && inBounds(target.at), `${target.id}: invalid position`);
    if (support && point(target.at)) {
        check(Math.abs(target.at.x - support.center.x) <= support.size.width / 2 &&
            Math.abs(target.at.y - support.center.y) <= support.size.height / 2,
        `${target.id}: object is not on its semantic support`);
    }
    if (target.canBeSeenAtInitialZoom) {
        check(visible(target.at, initialFocus, initialScale),
            `${target.id}: outside initial camera`);
        const { width, height } = scene.camera.referenceViewport;
        const screenX = width / 2 + (target.at.x - initialFocus.x) * initialScale;
        const screenY = height / 2 - (target.at.y - initialFocus.y) * initialScale;
        const halfVisualW = target.visualWorldSize.width * initialScale / 2;
        const halfVisualH = target.visualWorldSize.height * initialScale / 2;
        const hudTop = height - scene.camera.hudBottomReserveScreenPx;
        check(screenX - halfVisualW >= 24 && screenX + halfVisualW <= width - 24 &&
            screenY - halfVisualH >= 48 && screenY + halfVisualH <= hudTop - 48,
        `${target.id}: initial visual too close to screen edge or fixed HUD`);
    }
    check(target.clickRadiusWorld >= 24 && target.clickRadiusWorld <= 36,
        `${target.id}: click radius outside planned range`);
}
check(visible(spots.get('tea_vendor_foot').at, initialFocus, initialScale),
    'Tea vendor is outside initial camera');
if (!neighborhoodLayout) check(visible(npcs.get('messenger_customer').route[0], initialFocus, initialScale),
    'Approaching messenger is outside initial camera');
if (neighborhoodLayout) {
    for (const id of ['book_shopkeeper', 'flower_shopkeeper', 'strolling_reader', 'visiting_child']) {
        check(visible(npcs.get(id)?.route[0], initialFocus, initialScale),
            `${id}: new neighborhood activity is outside initial camera`);
    }
    for (const id of ['lc7_book_shop_back', 'lc7_flower_shop_back']) {
        check(visible(art.get(id)?.center, initialFocus, initialScale), `${id}: new store is outside initial camera`);
    }
    for (const viewport of [{ width: 444, height: 960 }, { width: 390, height: 844 }]) {
        const scale = Math.max(viewport.width / scene.map.width, viewport.height / scene.map.height) * scene.camera.initialZoom;
        const halfWidth = viewport.width / (2 * scale);
        const halfHeight = viewport.height / (2 * scale);
        const focus = {
            x: Math.max(-scene.map.width / 2 + halfWidth,
                Math.min(scene.map.width / 2 - halfWidth, scene.camera.initialFocus.x)),
            y: Math.min(scene.map.height / 2 - halfHeight, scene.camera.initialFocus.y),
        };
        const cameraLabel = `${viewport.width}x${viewport.height}`;
        for (const id of ['lc7_book_shop_back', 'lc7_flower_shop_back']) {
            const slot = art.get(id);
            const visibleWidth = Math.max(0, Math.min(focus.x + halfWidth, slot.center.x + slot.size.width / 2) -
                Math.max(focus.x - halfWidth, slot.center.x - slot.size.width / 2));
            check(visibleWidth >= slot.size.width * 0.75,
                `${cameraLabel} ${id}: default view shows too little of the new facade`);
        }
        for (const id of ['book_shopkeeper', 'flower_shopkeeper', 'strolling_reader', 'visiting_child']) {
            const npc = npcs.get(id), start = npc.route[0];
            const screenX = viewport.width / 2 + (start.x - focus.x) * scale;
            const footScreenY = viewport.height / 2 - (start.y - focus.y) * scale;
            check(screenX >= 32 && screenX <= viewport.width - 32 &&
                footScreenY - npc.actorHeight * scale >= 48 &&
                footScreenY <= viewport.height - scene.camera.hudBottomReserveScreenPx - 24,
            `${cameraLabel} ${id}: initial body is crowded by the frame or fixed HUD`);
        }
    }
}

for (const item of scene.interactiveSlots ?? []) {
    check(art.has(item.supportArtSlotId), `${item.id}: reveal has no semantic support`);
    check(point(item.at) && inBounds(item.at), `${item.id}: reveal outside map`);
    check(Number.isFinite(item.depthY), `${item.id}: reveal missing depth anchor`);
    if (wideLayout) {
        const support = art.get(item.supportArtSlotId);
        const hidden = scene.hiddenObjectSlots.find(target => target.visibleCondition?.objectId === item.id);
        check(!!hidden && support?.footY !== undefined && item.depthY < support.footY &&
            item.depthY > support.footY - 1, `${item.id}: opened target must render in front of its reveal image`);
    }
}

if (errors.length) {
    console.error(`FAIL ${errors.length} street block validation checks:`);
    for (const error of [...new Set(errors)].slice(0, 50)) console.error(`  - ${error}`);
    process.exitCode = 1;
} else {
    console.log(`PASS ${scene.id}: ${scene.artSlots.length} art slots, ` +
        `${publicRegions.length} connected public areas, ${scene.npcPlans.length} NPC plans, ` +
        `${scene.hiddenObjectSlots.length} semantic targets.`);
    console.log(`Camera 444x960: cover-fit ${fit.toFixed(4)}, normal ${initialScale.toFixed(4)} ` +
        `(~${(scene.camera.normalActorWorldHeight * initialScale).toFixed(0)} px chick), ` +
        `detail ${detailScale.toFixed(4)}.`);
    console.log(`Effective initial camera focus (${initialFocus.x.toFixed(1)}, ${initialFocus.y.toFixed(1)}) after map-edge clamp.`);
}
