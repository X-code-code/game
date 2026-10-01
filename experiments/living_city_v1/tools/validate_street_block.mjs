import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const blueprintPath = path.resolve(here, '../design/street_block_01.json');
const scene = JSON.parse(readFileSync(blueprintPath, 'utf8'));
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
check(scene.map.width === 1536 && scene.map.height === 2048, 'Map size differs from art plan');

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
    // The current four walk regions are axis-aligned rectangles. Require positive
    // area overlap, so a point-only contact cannot make a route appear connected.
    const extent = polygon => ({
        left: Math.min(...polygon.map(pair => pair[0])),
        right: Math.max(...polygon.map(pair => pair[0])),
        bottom: Math.min(...polygon.map(pair => pair[1])),
        top: Math.max(...polygon.map(pair => pair[1])),
    });
    const aa = extent(a.polygon), bb = extent(b.polygon);
    return Math.min(aa.right, bb.right) > Math.max(aa.left, bb.left) &&
        Math.min(aa.top, bb.top) > Math.max(aa.bottom, bb.bottom);
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
    check(Number.isFinite(npc.actorHeight) && npc.actorHeight >= 100 && npc.actorHeight <= 135,
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

for (const event of scene.sceneEvents) {
    unique(event.id, 'sceneEvents');
    const actor = npcs.get(event.trigger.npcId);
    check(!!actor, `${event.id}: unknown trigger actor`);
    check(actor?.route[event.trigger.waypointIndex] !== undefined, `${event.id}: invalid trigger waypoint`);
    check(event.participants.every(id => npcs.has(id)), `${event.id}: unknown participant`);
    check(event.beats.length >= 3, `${event.id}: no multi-beat event`);
    const lastBeat = event.beats.at(-1);
    check(event.resumeRouteAfterSeconds + 1e-6 >= lastBeat.atSeconds + lastBeat.durationSeconds,
        `${event.id}: actor leaves before event is complete`);
}

const fit = Math.max(scene.camera.referenceViewport.width / scene.map.width,
    scene.camera.referenceViewport.height / scene.map.height);
const initialScale = fit * scene.camera.initialZoom;
const detailScale = fit * scene.camera.maxZoom;
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
        check(visible(target.at, scene.camera.initialFocus, initialScale),
            `${target.id}: outside initial camera`);
        const { width, height } = scene.camera.referenceViewport;
        const screenX = width / 2 + (target.at.x - scene.camera.initialFocus.x) * initialScale;
        const screenY = height / 2 - (target.at.y - scene.camera.initialFocus.y) * initialScale;
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
check(visible(spots.get('tea_vendor_foot').at, scene.camera.initialFocus, initialScale),
    'Tea vendor is outside initial camera');
check(visible(npcs.get('messenger_customer').route[0], scene.camera.initialFocus, initialScale),
    'Approaching messenger is outside initial camera');

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
}
