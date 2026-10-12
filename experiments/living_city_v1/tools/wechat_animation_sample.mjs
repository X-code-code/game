import assert from 'node:assert/strict';
import { GAME_CONTEXT_SOURCE } from './wechat_runtime_smoke.mjs';

// One official evaluate call, with dense reads inside its existing game context.
// All observations and timer handles are local to the returned Promise. No
// engine step, animation setter, storage API, input, or global marker is used.
export const DENSE_ANIMATION_SAMPLE_SOURCE = `function (options) {
    ${GAME_CONTEXT_SOURCE}
    const durationMs = options && options.durationMs || 12000;
    const intervalMs = options && options.intervalMs || 40;
    if (!(durationMs >= 10000 && durationMs <= 20000) || !(intervalMs >= 20 && intervalMs <= 100))
        throw new Error('Dense animation observation requires 10-20 seconds and 20-100 ms read intervals');
    if (!C || !C.director) throw new Error('Cocos is unavailable for animation observation');
    const scene = C.director.getScene(), canvas = scene && scene.getChildByName('Canvas');
    const manager = canvas && canvas.getComponent('CityManager'), city = manager && manager.current;
    const box = city && city.view && city.view.livingGreybox;
    if (!scene || scene.name !== 'city' || !box || !box.blueprint) throw new Error('City is not ready for animation observation');
    const cityId = city.content.config.cityId;
    if (options && options.cityId && options.cityId !== cityId) throw new Error('Animation observation city differs from the requested city');
    const timerContext = contexts.find(item => typeof item.value.setTimeout === 'function' && typeof item.value.clearTimeout === 'function');
    const schedule = timerContext ? timerContext.value.setTimeout.bind(timerContext.value) : setTimeout;
    const cancel = timerContext ? timerContext.value.clearTimeout.bind(timerContext.value) : clearTimeout;
    const clock = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now.bind(performance) : Date.now;
    const requestedIds = options && options.actorIds || box.npcs.map(actor => actor.plan.id);
    if (!Array.isArray(requestedIds) || requestedIds.length === 0 || new Set(requestedIds).size !== requestedIds.length)
        throw new Error('Animation actor IDs must be a nonempty unique array');
    const actors = requestedIds.map(id => {
        const actor = box.npcs.find(item => item.plan.id === id);
        if (!actor) throw new Error('Animation actor is unavailable: ' + id);
        return actor;
    });
    const uuid = frame => frame ? frame.uuid || frame._uuid || null : null;
    return new Promise((resolve, reject) => {
        const started = clock(), observations = new Map(actors.map(actor => [actor.plan.id, {
            id: actor.plan.id, uuids: new Set(), clips: new Map(), samples: 0, frameMismatches: 0,
            unavailableSamples: 0, frameIndexChanges: 0, changes: [], previousKey: null,
            minX: actor.node.position.x, maxX: actor.node.position.x,
            minY: actor.node.position.y, maxY: actor.node.position.y,
        }]));
        let timer = null, sampleCount = 0, previousAt = null, minGap = Infinity, maxGap = 0, sumGap = 0;
        const finish = error => {
            if (timer !== null) cancel(timer);
            timer = null;
            if (error) { reject(error); return; }
            const resultActors = Array.from(observations.values()).map(proof => ({
                id: proof.id, samples: proof.samples, uniqueFrames: proof.uuids.size, observedUuids: Array.from(proof.uuids),
                clips: Object.fromEntries(Array.from(proof.clips.entries()).map(([name, frames]) => [name, Array.from(frames)])),
                frameIndexChanges: proof.frameIndexChanges, changes: proof.changes,
                frameMismatches: proof.frameMismatches, unavailableSamples: proof.unavailableSamples,
                movement: {minX: proof.minX, maxX: proof.maxX, minY: proof.minY, maxY: proof.maxY},
            }));
            const frozen = resultActors.filter(actor => actor.uniqueFrames < 2).map(actor => actor.id);
            const mismatched = resultActors.filter(actor => actor.frameMismatches).map(actor => actor.id);
            const unavailable = resultActors.filter(actor => actor.unavailableSamples).map(actor => actor.id);
            const adequateTiming = maxGap <= Math.max(intervalMs * 4, 200);
            resolve({method: 'single_evaluate_game_context_timer_reads', cityId,
                durationMs: Math.round(clock() - started), requestedDurationMs: durationMs, intervalMs, sampleCount,
                readOnly: true, engineStepsBySampler: 0, animationChangesBySampler: 0,
                gapMs: {min: minGap === Infinity ? null : Math.round(minGap), max: Math.round(maxGap),
                    mean: sampleCount > 1 ? Math.round(sumGap / (sampleCount - 1)) : null},
                samplingQuality: adequateTiming ? 'dense' : 'timer_gaps_observed',
                actors: resultActors, frozen, mismatched, unavailable,
                status: mismatched.length || unavailable.length ? 'failed'
                    : frozen.length ? (adequateTiming ? 'failed' : 'inconclusive') : 'passed'});
        };
        const sample = () => {
            timer = null;
            try {
                if (C.director.getScene() !== scene || manager.current !== city || box.disposed)
                    throw new Error('City changed or was disposed during animation observation');
                const now = clock(), elapsed = now - started;
                if (previousAt !== null) { const gap = now - previousAt; minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap); sumGap += gap; }
                previousAt = now; sampleCount++;
                for (const actor of actors) {
                    const proof = observations.get(actor.plan.id), player = actor.cels;
                    const frame = player && player.sprite && player.sprite.spriteFrame;
                    const frameUuid = uuid(frame), clip = player && player.currentClip, index = player && player.frameIndex;
                    const expected = player && player.clips && player.clips[clip] && player.clips[clip][index];
                    proof.samples++;
                    if (!actor.node.isValid || !actor.node.activeInHierarchy || !player || !player.isReady
                        || !player.visual || !player.visual.activeInHierarchy || !frameUuid) proof.unavailableSamples++;
                    if (!frame || !expected || frameUuid !== uuid(expected.frame)) proof.frameMismatches++;
                    const x = actor.node.position.x, y = actor.node.position.y;
                    proof.minX = Math.min(proof.minX, x); proof.maxX = Math.max(proof.maxX, x);
                    proof.minY = Math.min(proof.minY, y); proof.maxY = Math.max(proof.maxY, y);
                    if (frameUuid) {
                        proof.uuids.add(frameUuid);
                        if (!proof.clips.has(clip)) proof.clips.set(clip, new Set());
                        proof.clips.get(clip).add(frameUuid);
                    }
                    const key = clip + '/' + index + '/' + frameUuid;
                    if (proof.previousKey !== key) {
                        if (proof.previousKey !== null) proof.frameIndexChanges++;
                        proof.previousKey = key;
                        proof.changes.push({elapsedMs: Math.round(elapsed), clip: clip || null, frame: index,
                            uuid: frameUuid, x, y, moving: actor.moving});
                    }
                }
                if (elapsed >= durationMs) finish();
                else timer = schedule(sample, Math.min(intervalMs, durationMs - elapsed));
            } catch (error) { finish(error); }
        };
        sample();
    });
}`;

/** Import this helper into input QA; it does not run CLI or anything on import. */
export async function sampleAnimationInGame(client, {cityId, actorIds, durationMs = 12000, intervalMs = 40} = {}) {
    assert.ok(durationMs >= 10000 && durationMs <= 20000, 'Observe for 10-20 seconds within official CLI timeout');
    assert.ok(intervalMs >= 20 && intervalMs <= 100, 'Use dense 20-100 ms reads');
    const options = {durationMs, intervalMs, ...(cityId ? {cityId} : {}), ...(actorIds ? {actorIds} : {})};
    const result = await client.evaluate(DENSE_ANIMATION_SAMPLE_SOURCE, [options]);
    assert.equal(result?.method, 'single_evaluate_game_context_timer_reads', 'Official evaluate did not await the sampler Promise');
    assert.ok(result.durationMs >= durationMs && result.sampleCount >= 2, 'Animation sample returned too early');
    return result;
}
