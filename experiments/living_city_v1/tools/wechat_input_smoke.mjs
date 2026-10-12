import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWechatClient, expectedChapter, GAME_CONTEXT_SOURCE, LIVING_CITY_SAVE_KEY,
    RUNTIME_STATE_SOURCE, validateState } from './wechat_runtime_smoke.mjs';
import { sampleAnimationInGame } from './wechat_animation_sample.mjs';

// Explicit opt-in input QA. Actual game actions do all discovery/reveal/travel;
// evaluate only reads state, replays the camera, and manages one backed-up key.
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chapters = ['living_city_street_block_01', 'living_city_garden_market_02', 'living_city_harbor_walk_03'];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const stamp = () => new Date().toISOString().replaceAll(/[:.]/g, '-');
const slash = value => value.replaceAll('\\', '/');

export const EXACT_SAVE_READ_SOURCE = `function (key) {
    ${GAME_CONTEXT_SOURCE}
    if (key !== '${LIVING_CITY_SAVE_KEY}') throw new Error('Only the living-city save key may be accessed');
    if (!wxAPI || typeof wxAPI.getStorageInfoSync !== 'function' || typeof wxAPI.getStorageSync !== 'function'
        || typeof wxAPI.setStorageSync !== 'function' || typeof wxAPI.removeStorageSync !== 'function')
        throw new Error('Exact WeChat storage backup/restore APIs are unavailable');
    const keys = wxAPI.getStorageInfoSync().keys;
    if (!Array.isArray(keys)) throw new Error('WeChat storage key existence cannot be verified');
    const exists = keys.indexOf(key) >= 0, value = wxAPI.getStorageSync(key);
    if (exists && value === undefined) throw new Error('Cannot serialize an existing undefined storage value safely');
    return {key, exists, value: value === undefined ? null : value, valueType: typeof value};
}`;

export const SINGLE_KEY_WRITE_SOURCE = `function (key, action, backup, backupConfirmed) {
    ${GAME_CONTEXT_SOURCE}
    if (key !== '${LIVING_CITY_SAVE_KEY}' || !backupConfirmed || !backup || backup.key !== key
        || typeof backup.exists !== 'boolean') throw new Error('Verified single-key backup is required before mutation');
    if (!wxAPI || typeof wxAPI.removeStorageSync !== 'function' || typeof wxAPI.setStorageSync !== 'function')
        throw new Error('WeChat storage restoration APIs are unavailable');
    if (action === 'clear') wxAPI.removeStorageSync(key);
    else if (action === 'restore') {
        if (backup.exists) wxAPI.setStorageSync(key, backup.value); else wxAPI.removeStorageSync(key);
    } else throw new Error('Unsupported single-key action');
    return {key, action, exists: wxAPI.getStorageInfoSync().keys.indexOf(key) >= 0,
        value: wxAPI.getStorageSync(key)};
}`;

export const INPUT_STATE_SOURCE = `function () {
    const base = (${RUNTIME_STATE_SOURCE})({});
    if (!base.ready) return base;
    ${GAME_CONTEXT_SOURCE}
    const canvasNode = C.director.getScene().getChildByName('Canvas');
    const manager = canvasNode.getComponent('CityManager'), city = manager.current, view = city.view;
    const map = city.root.getChildByName('TestMap'), camera = canvasNode.getChildByName('Camera').getComponent(C.Camera);
    const nativeCanvas = C.game && C.game.canvas || game && game.canvas;
    if (!nativeCanvas || !(nativeCanvas.width > 0) || !(nativeCanvas.height > 0)) throw new Error('Physical game canvas dimensions are unavailable');
    const screen = node => {
        if (!node) return null;
        const point = camera.worldToScreen(node.worldPosition);
        return {x: point.x, y: nativeCanvas.height - point.y};
    };
    const search = (node, name) => {
        if (!node) return null;
        if (node.name === name) return node;
        for (const child of node.children) { const found = search(child, name); if (found) return found; }
        return null;
    };
    const box = node => {
        const transform = node && node.getComponent(C.UITransform);
        if (!transform) return null;
        const rect = transform.getBoundingBoxToWorld();
        const a = camera.worldToScreen(new C.Vec3(rect.x, rect.y, 0));
        const b = camera.worldToScreen(new C.Vec3(rect.x + rect.width, rect.y + rect.height, 0));
        return {left: Math.min(a.x, b.x), right: Math.max(a.x, b.x),
            top: nativeCanvas.height - Math.max(a.y, b.y), bottom: nativeCanvas.height - Math.min(a.y, b.y)};
    };
    base.canvas = {width: nativeCanvas.width, height: nativeCanvas.height};
    base.boot = {totalFrames: typeof C.director.getTotalFrames === 'function' ? C.director.getTotalFrames() : null};
    base.targetDefinitions = city.content.config.hiddenObjects.map(item => ({id: item.id, targetable: item.targetable,
        visibleCondition: item.visibleCondition || null}));
    base.targets.forEach(item => { item.screen = screen(search(map, item.id)); });
    base.interactions.forEach(item => { item.screen = screen(view.interactions.get(item.id).node); });
    base.stickers.forEach(item => { item.screen = screen(view.stickerCards.get(item.id).node); });
    base.trayBounds = box(view.taskPanel);
    base.flights = view.collectionFlights.size; base.landing = view.collectionLandingAnimations;
    base.relativeZoom = map.scale.x / view.controller.viewport.fitScale;
    base.focus = {x: -map.position.x / map.scale.x, y: -map.position.y / map.scale.y};
    base.nextCityId = city.content.config.nextCityId || null;
    base.completion = {open: manager.ui.isOpen, summary: manager.ui.summary.string,
        artReady: [manager.ui.card, manager.ui.continueButton, manager.ui.nextButton].every(node => !!node.getComponent(C.Sprite).spriteFrame),
        buttons: Object.fromEntries(['ContinueExploring', 'NextCity', 'OpenCompletion'].map(name => {
            const node = search(manager.ui.root, name), button = node && node.getComponent(C.Button);
            return [name, {active: !!(node && node.activeInHierarchy), interactable: !!(button && button.interactable), screen: screen(node)}];
        }))};
    const raw = wxAPI.getStorageSync('${LIVING_CITY_SAVE_KEY}');
    base.savedJourney = typeof raw === 'string' && raw ? JSON.parse(raw) : null;
    return base;
}`;

export const CAMERA_REPLAY_SOURCE = `function (requested) {
    ${GAME_CONTEXT_SOURCE}
    const canvas = C && C.director.getScene().getChildByName('Canvas');
    const manager = canvas && canvas.getComponent('CityManager'), city = manager && manager.current;
    if (!city || city.content.config.cityId !== requested.cityId) throw new Error('Camera replay city does not match');
    const view = city.view, map = city.root.getChildByName('TestMap');
    const search = (node, name) => {
        if (node.name === name) return node;
        for (const child of node.children) { const found = search(child, name); if (found) return found; }
        return null;
    };
    const focusNode = requested.nodeId ? search(map, requested.nodeId) : null;
    if (requested.nodeId && !focusNode) throw new Error('Camera target node is missing');
    const focus = focusNode ? {x: focusNode.position.x, y: focusNode.position.y} : requested.focus;
    if (!focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.y)) throw new Error('Camera focus is invalid');
    const wanted = requested.relativeZoom || city.content.config.view.maxZoom;
    const current = map.scale.x / view.controller.viewport.fitScale;
    view.controller.viewport.zoomAt(wanted / current, 0, 0);
    view.controller.applyState();
    view.controller.focusAt(focus.x, focus.y);
    return {cityId: city.content.config.cityId, focus, relativeZoom: map.scale.x / view.controller.viewport.fitScale};
}`;

export const readInputState = client => client.evaluate(INPUT_STATE_SOURCE);
const foundIds = state => [...state.snapshot.foundHiddenObjectIds].sort();
const taskIds = state => [...state.snapshot.completedTaskIds].sort();
function compact(state) {
    return {cityId: state.cityId, progress: state.progress, snapshot: state.snapshot, flights: state.flights,
        landing: state.landing, collectedCardIds: state.stickers?.filter(card => card.collected).map(card => card.id),
        interactions: state.interactions?.map(item => ({id: item.id, state: item.state})),
        completion: state.completion, journal: state.journal, savedCity: state.savedJourney?.cities?.[state.cityId]};
}

async function screenshot(client, name) {
    const file = path.join(client.out, name), result = await client.screenshot(file);
    const bytes = await readFile(file);
    assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Expected optimize=false PNG screenshot');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.ok(width > 0 && height > 0);
    if (result?.imageWidth) assert.equal(result.imageWidth, width);
    if (result?.imageHeight) assert.equal(result.imageHeight, height);
    return {file: slash(file), imageWidth: width, imageHeight: height, bytes: bytes.length};
}

/** Native camera pixels -> actual screenshot pixels -> official image-space tap. */
export async function tapPhysical(client, point, canvas, reference) {
    assert.ok(point && point.x > 0 && point.x < canvas.width && point.y > 0 && point.y < canvas.height,
        `Tap is outside the physical canvas: ${JSON.stringify({point, canvas})}`);
    assert.ok(Math.abs(reference.imageWidth / reference.imageHeight - canvas.width / canvas.height) < 0.015,
        'Screenshot and physical canvas aspect ratios differ; image-space calibration is unsafe');
    const action = {action: 'tap', coordinateSpace: 'image',
        x: point.x * reference.imageWidth / canvas.width, y: point.y * reference.imageHeight / canvas.height,
        imageWidth: reference.imageWidth, imageHeight: reference.imageHeight};
    await client.callTool('automation_game_action', action);
    return {tool: 'automation_game_action', ...action, nativePoint: point, canvas, reference: reference.file};
}

export async function runInputSmoke(options = {}) {
    assert.equal(options.runInput, true, 'Input smoke requires explicit --run-input');
    const out = options.out || path.join(sourceRoot, 'art/review/wechat_v17', `input_${stamp()}_${process.pid}`);
    const client = createWechatClient({...options, out});
    await mkdir(client.out, {recursive: true});
    const reportFile = path.join(client.out, 'input_report.json');
    const report = {startedAt: new Date().toISOString(), mode: 'actual_wechat_input', status: 'running',
        reloadMethod: options.coldRestart ? 'close_reopen_liteMode' : 'simulator_refresh',
        project: slash(client.project), chapters: [], actions: [], storageOperations: [],
        expectedScope: {chapters: 3, targets: 36, reveals: 10}, phoneVerification: 'not_run'};
    let backup, backupConfirmed = false, storageTouched = false, originalState, stopRequested = false;
    const interrupted = () => { stopRequested = true; console.error('Stop requested; finishing current CLI call and restoring the original save.'); };
    process.on('SIGINT', interrupted); process.on('SIGTERM', interrupted);
    const checkStop = () => { if (stopRequested) throw new Error('Input QA interrupted'); };
    async function until(predicate, label, {timeoutMs = options.readyTimeoutMs || 120000, restoring = false} = {}) {
        const started = performance.now(); let latest;
        while (performance.now() - started < timeoutMs) {
            if (!restoring) checkStop();
            latest = await readInputState(client);
            if (predicate(latest)) return latest;
            await pause(250);
        }
        const error = new Error(label); error.lastState = latest; throw error;
    }
    async function persistReport() { await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n'); }
    async function writeSingleKey(action) {
        assert.ok(backupConfirmed && backup?.key === LIVING_CITY_SAVE_KEY, 'No verified original save backup');
        if (action === 'clear') storageTouched = true; // restore even if the CLI response is lost after the write
        const result = await client.evaluate(SINGLE_KEY_WRITE_SOURCE, [LIVING_CITY_SAVE_KEY, action, backup, true]);
        report.storageOperations.push({action, key: LIVING_CITY_SAVE_KEY, timestamp: new Date().toISOString()});
        return result;
    }
    async function refreshAndAwait(before, predicate, label, {restoring = false} = {}) {
        if (options.coldRestart) {
            const closed = await client.callTool('close_project_window');
            assert.equal(closed.success, true, 'Project window did not close for persistence QA');
            const opened = await client.callTool('open_project_window', {windowMode: 'liteMode'});
            assert.equal(opened.success, true, 'Project window did not reopen for persistence QA');
            assert.equal(opened.type, 'newopen', 'A reused window cannot prove cold-start persistence');
            report.actions.push({kind: 'cold_restart', timestamp: new Date().toISOString(), windowMode: 'liteMode', label});
            return until(predicate, label, {restoring});
        }
        assert.ok(Number.isFinite(before.boot?.totalFrames), 'Director frame counter is required to prove a real refresh');
        let restarted = false;
        await client.callTool('simulator_refresh');
        return until(state => {
            if (!state.ready || (Number.isFinite(state.boot?.totalFrames) && state.boot.totalFrames < before.boot.totalFrames)) restarted = true;
            return restarted && predicate(state);
        }, label, {restoring});
    }
    async function refreshAndCheck(before, label) {
        const restored = await refreshAndAwait(before, state => state.ready && state.cityId === before.cityId && state.flights === 0 && state.landing === 0
            && (before.progress.allRequiredComplete ? state.completion.open : !state.completion.open), label);
        validateState(restored, await expectedChapter(before.cityId));
        assert.deepEqual(foundIds(restored), foundIds(before), 'Found IDs changed across refresh');
        assert.deepEqual(taskIds(restored), taskIds(before), 'Completed task IDs changed across refresh');
        assert.deepEqual(restored.snapshot.interactiveStates, before.snapshot.interactiveStates, 'Reveal states changed across refresh');
        assert.equal(restored.progress.requiredCompleted, before.progress.requiredCompleted);
        return restored;
    }
    async function focus(id, cityId) {
        checkStop();
        await client.evaluate(CAMERA_REPLAY_SOURCE, [{cityId, nodeId: id}]);
        await pause(100);
        return readInputState(client);
    }
    try {
        backup = await client.evaluate(EXACT_SAVE_READ_SOURCE, [LIVING_CITY_SAVE_KEY]);
        const backupFile = path.join(client.out, `original_save_${stamp()}_${randomUUID()}.json`);
        const backupDocument = {timestamp: new Date().toISOString(), project: slash(client.project), ...backup};
        await writeFile(backupFile, JSON.stringify(backupDocument, null, 2) + '\n', {flag: 'wx'});
        const diskBackup = JSON.parse(await readFile(backupFile, 'utf8'));
        assert.deepEqual({key: diskBackup.key, exists: diskBackup.exists, value: diskBackup.value, valueType: diskBackup.valueType}, backup);
        assert.ok((await stat(backupFile)).size > 0);
        backupConfirmed = true;
        report.originalSaveBackup = {file: slash(backupFile), key: backup.key, existed: backup.exists, valueType: backup.valueType, verified: true};
        originalState = await until(state => state.ready && state.flights === 0 && state.landing === 0, 'Original player scene did not become ready');
        report.originalPlayer = {cityId: originalState.cityId, snapshot: originalState.snapshot,
            map: originalState.map, focus: originalState.focus, relativeZoom: originalState.relativeZoom,
            completionOpen: originalState.completion.open, selectedStickerId: originalState.selectedStickerId};
        report.originalScreenshot = await screenshot(client, 'player_before_test.png');
        await persistReport();
        checkStop();
        await writeSingleKey('clear');
        let current = await refreshAndAwait(originalState, state => state.ready && state.cityId === chapters[0] && state.progress.requiredCompleted === 0
            && !state.completion.open, 'Fresh single-key fixture did not start at chapter one');
        for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
            checkStop();
            const cityId = chapters[chapterIndex], expected = await expectedChapter(cityId);
            current = await until(state => state.ready && state.cityId === cityId, `${cityId}: city PNGs did not become ready`);
            const chapter = {cityId, expected, reveals: [], collections: [], initial: compact(current), screenshots: []};
            report.chapters.push(chapter);
            chapter.stateValidation = validateState(current, expected);
            assert.equal(expected.targets, 12, 'Only the existing 12 targets may be tested');
            assert.equal(expected.reveals, chapterIndex === 0 ? 4 : 3);
            assert.equal(current.progress.requiredCompleted, 0, 'New chapter inherited another chapter progress');
            assert.equal(foundIds(current).length, 0);
            let reference = await screenshot(client, `chapter_${chapterIndex + 1}_initial.png`);
            chapter.screenshots.push(reference);
            // Animation findings are reported independently; a frozen actor does
            // not prevent the existing targets/reveals from receiving real taps.
            try { chapter.animation = await sampleAnimationInGame(client, {cityId, durationMs: 12000, intervalMs: 40}); }
            catch (animationError) { chapter.animation = {status: 'failed', error: animationError.message}; }
            current = await until(state => state.ready && state.cityId === cityId, 'City unavailable after animation observation');
            await persistReport();
            const definitions = current.targetDefinitions, groups = new Map();
            assert.ok(definitions.every(item => item.targetable), 'Unexpected non-targetable search definition');
            for (const target of definitions.filter(item => item.visibleCondition)) {
                const condition = target.visibleCondition;
                if (!groups.has(condition.objectId)) groups.set(condition.objectId, {state: condition.state, targets: []});
                const group = groups.get(condition.objectId);
                assert.equal(group.state, condition.state); group.targets.push(target.id);
            }
            assert.deepEqual([...groups.keys()].sort(), [...expected.revealIds].sort(), 'Every current reveal must have a tested target');
            for (const [id, group] of groups) {
                current = await focus(id, cityId);
                assert.ok(group.targets.every(targetId => !current.targets.find(item => item.id === targetId).active), `${id}: target visible while closed`);
                const before = compact(current), interaction = current.interactions.find(item => item.id === id);
                const action = await tapPhysical(client, interaction.screen, current.canvas, reference);
                report.actions.push({kind: 'reveal', cityId, id, ...action});
                current = await until(state => state.ready && state.cityId === cityId && state.interactions.find(item => item.id === id)?.state === group.state
                    && group.targets.every(targetId => state.targets.find(item => item.id === targetId)?.active), `${id}: real tap did not reveal target`, {timeoutMs: 12000});
                assert.equal(current.progress.requiredCompleted, 0, 'Opening a reveal counted as collection');
                assert.equal(current.savedJourney.cities[cityId].interactiveStates[id], group.state, 'Reveal was not saved');
                chapter.reveals.push({id, targetIds: group.targets, action, before, after: compact(current)});
                await persistReport();
            }
            reference = await screenshot(client, `chapter_${chapterIndex + 1}_reveals_open.png`);
            chapter.screenshots.push(reference);
            if (!options.coldRestart) {
                current = await refreshAndCheck(current, 'Opened reveals did not survive refresh');
                chapter.revealRefresh = compact(current);
            } else chapter.revealPersistenceCheck = 'Verified with all reveal states at the completed-chapter cold restart';
            for (let targetIndex = 0; targetIndex < definitions.length; targetIndex++) {
                const id = definitions[targetIndex].id;
                current = await focus(id, cityId);
                const target = current.targets.find(item => item.id === id), before = compact(current);
                assert.ok(target.active && target.loaded, `${id}: target is not available`);
                assert.equal(current.progress.requiredCompleted, targetIndex);
                assert.ok(!current.trayBounds || target.screen.y < current.trayBounds.top, `${id}: target click is underneath the journal`);
                const action = await tapPhysical(client, target.screen, current.canvas, reference);
                report.actions.push({kind: 'collect', cityId, id, ...action});
                current = await until(state => state.ready && state.cityId === cityId && state.progress.requiredCompleted === targetIndex + 1
                    && state.stickers.find(item => item.id === id)?.collected && state.flights === 0 && state.landing === 0,
                    `${id}: real tap did not collect and land in journal`, {timeoutMs: 15000});
                assert.equal(current.targets.find(item => item.id === id).active, false);
                assert.equal(current.savedJourney.cities[cityId].completedTaskIds.length, targetIndex + 1);
                assert.ok(current.savedJourney.cities[cityId].foundHiddenObjectIds.includes(id));
                assert.equal(foundIds(current).length, targetIndex + 1, 'Collection counted more than once');
                chapter.collections.push({id, action, before, after: compact(current)});
                console.log(JSON.stringify({chapter: chapterIndex + 1, cityId, collected: targetIndex + 1, total: expected.targets, id}));
                await persistReport();
            }
            current = await until(state => state.ready && state.cityId === cityId && state.completion.open && state.completion.artReady,
                'Chapter completion panel did not open');
            assert.equal(current.progress.allRequiredComplete, true);
            assert.equal(current.progress.requiredCompleted, 12);
            assert.ok(current.completion.summary.includes(`第 ${chapterIndex + 1} 关 / 共 3 关`));
            chapter.completed = compact(current);
            reference = await screenshot(client, `chapter_${chapterIndex + 1}_completed.png`);
            chapter.screenshots.push(reference);
            current = await refreshAndCheck(current, 'Completed chapter did not survive refresh');
            assert.ok(current.stickers.every(item => item.collected));
            chapter.completionRefresh = compact(current);
            reference = await screenshot(client, `chapter_${chapterIndex + 1}_completed_after_refresh.png`);
            chapter.screenshots.push(reference);
            if (chapterIndex < chapters.length - 1) {
                const next = current.completion.buttons.NextCity;
                assert.ok(next.active && next.interactable, 'Real next-city button is not available');
                assert.equal(current.nextCityId, chapters[chapterIndex + 1]);
                const action = await tapPhysical(client, next.screen, current.canvas, reference);
                report.actions.push({kind: 'next_city', cityId, ...action});
                current = await until(state => state.ready && state.cityId === chapters[chapterIndex + 1], 'Next-city button did not travel');
                assert.ok(current.savedJourney.completedCityIds.includes(cityId));
                assert.ok(current.savedJourney.unlockedCityIds.includes(current.cityId));
                chapter.travel = {action, destination: current.cityId, progress: current.progress};
            }
            chapter.inputStatus = 'passed';
            await persistReport();
        }
        report.savedTestJourney = current.savedJourney;
        report.totalCollected = report.chapters.reduce((total, chapter) => total + chapter.collections.length, 0);
        report.totalReveals = report.chapters.reduce((total, chapter) => total + chapter.reveals.length, 0);
        assert.equal(report.totalCollected, 36); assert.equal(report.totalReveals, 10);
        for (const cityId of chapters) {
            assert.equal(report.savedTestJourney.cities[cityId].foundHiddenObjectIds.length, 12);
            assert.equal(report.savedTestJourney.cities[cityId].completedTaskIds.length, 12);
            assert.ok(report.savedTestJourney.completedCityIds.includes(cityId));
        }
        report.testStatus = 'passed';
        report.stateStatus = 'passed'; report.inputStatus = 'passed';
        report.animationStatus = report.chapters.every(chapter => chapter.animation?.status === 'passed') ? 'passed' : 'failed';
    } catch (error) {
        report.testStatus = 'failed'; report.error = error.message;
        report.inputStatus = 'failed';
        if (error.lastState) report.lastState = error.lastState;
        try { report.failureScreenshot = await screenshot(client, 'test_failure.png'); } catch (captureError) { report.failureScreenshotError = captureError.message; }
    } finally {
        if (storageTouched && backupConfirmed) {
            try {
                await writeSingleKey('restore');
                let restored = await client.evaluate(EXACT_SAVE_READ_SOURCE, [LIVING_CITY_SAVE_KEY]);
                assert.deepEqual(restored, backup, 'Original storage was not restored before refresh');
                const beforeReload = await readInputState(client);
                let player = await refreshAndAwait(beforeReload, state => state.ready && state.cityId === originalState.cityId,
                    'Original player city did not reload after save restoration', {restoring: true});
                validateState(player, await expectedChapter(player.cityId));
                // Recompile may reopen a completed chapter's modal. Restore its
                // prior visibility through the actual existing button.
                if (player.completion.open !== originalState.completion.open) {
                    const name = originalState.completion.open ? 'OpenCompletion' : 'ContinueExploring';
                    const button = player.completion.buttons[name], reference = await screenshot(client, 'restoring_player.png');
                    assert.ok(button.active && button.interactable, 'Player completion visibility cannot be restored through its button');
                    const action = await tapPhysical(client, button.screen, player.canvas, reference);
                    report.actions.push({kind: 'restore_player_modal', ...action});
                    player = await until(state => state.ready && state.cityId === originalState.cityId
                        && state.completion.open === originalState.completion.open, 'Player completion visibility did not restore', {restoring: true});
                }
                await client.evaluate(CAMERA_REPLAY_SOURCE, [{cityId: originalState.cityId,
                    focus: originalState.focus, relativeZoom: originalState.relativeZoom}]);
                if (originalState.selectedStickerId && !originalState.completion.open) {
                    player = await readInputState(client);
                    const card = player.stickers.find(item => item.id === originalState.selectedStickerId);
                    if (card?.active && !card.collected) {
                        const reference = await screenshot(client, 'restoring_player_selection.png');
                        const action = await tapPhysical(client, card.screen, player.canvas, reference);
                        report.actions.push({kind: 'restore_player_selection', id: card.id, ...action});
                    }
                }
                player = await readInputState(client);
                assert.deepEqual(foundIds(player), foundIds(originalState), 'Player found IDs differ after restoration');
                assert.deepEqual(taskIds(player), taskIds(originalState), 'Player tasks differ after restoration');
                assert.deepEqual(player.snapshot.interactiveStates, originalState.snapshot.interactiveStates, 'Player reveal states differ after restoration');
                assert.equal(player.completion.open, originalState.completion.open);
                assert.ok(Math.abs(player.map.scale - originalState.map.scale) < 0.001
                    && Math.abs(player.map.x - originalState.map.x) < 1 && Math.abs(player.map.y - originalState.map.y) < 1, 'Player camera did not restore');
                // Startup reconciliation can normalize/rewrite bytes or create a
                // fresh save when the original key was absent. Restore raw value
                // once more after the original screen has loaded, then verify it.
                await writeSingleKey('restore');
                restored = await client.evaluate(EXACT_SAVE_READ_SOURCE, [LIVING_CITY_SAVE_KEY]);
                assert.deepEqual(restored, backup, 'Original raw save/key absence did not restore exactly');
                report.restoration = {status: 'passed', exactRawValueAndExistence: true, onlyKey: LIVING_CITY_SAVE_KEY,
                    player: compact(player), map: player.map};
                report.restoredPlayerScreenshot = await screenshot(client, 'player_restored.png');
            } catch (restoreError) {
                report.restoration = {status: 'failed', error: restoreError.message, backup: report.originalSaveBackup?.file};
                // Preserve storage even when game reload/camera restoration fails.
                try {
                    await writeSingleKey('restore');
                    const raw = await client.evaluate(EXACT_SAVE_READ_SOURCE, [LIVING_CITY_SAVE_KEY]);
                    report.restoration.rawSaveRestored = JSON.stringify(raw) === JSON.stringify(backup);
                } catch (rawError) { report.restoration.rawRestoreError = rawError.message; }
            }
        } else report.restoration = {status: 'not_needed', reason: 'The original storage key was never changed'};
        process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted);
        report.status = report.testStatus === 'passed' && report.animationStatus === 'passed' && report.restoration.status === 'passed' ? 'passed' : 'failed';
        report.finishedAt = new Date().toISOString(); report.cliCalls = client.history;
        await persistReport();
    }
    console.log(JSON.stringify({status: report.status, inputStatus: report.inputStatus, animationStatus: report.animationStatus, restoration: report.restoration.status,
        targets: report.totalCollected, reveals: report.totalReveals, report: slash(reportFile), error: report.error}, null, 2));
    return report;
}

function parseOptions(argv) {
    const options = {};
    const names = {'--project': 'project', '--out': 'out', '--install-root': 'installRoot', '--ready-timeout-ms': 'readyTimeoutMs'};
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        if (flag === '--run-input') { options.runInput = true; continue; }
        if (flag === '--cold-restart') { options.coldRestart = true; continue; }
        if (flag === '--help' || flag === '-h') { options.help = true; continue; }
        assert.ok(names[flag], `Unknown option: ${flag}`);
        assert.ok(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing value for ${flag}`);
        options[names[flag]] = argv[++index];
    }
    if (options.readyTimeoutMs) { options.readyTimeoutMs = Number(options.readyTimeoutMs); assert.ok(options.readyTimeoutMs > 0); }
    return options;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    try {
        const options = parseOptions(process.argv.slice(2));
        if (options.help || !options.runInput) {
            console.log('Explicit input QA: 3 chapters, 36 existing targets, 10 reveals, real next-city buttons and refresh persistence.\n'
                + 'Backs up and restores only the living-city save key. The authorized game must already be open.\n'
                + 'node tools/wechat_input_smoke.mjs --run-input [--cold-restart] [--project BUILD_DIR] [--out REVIEW_DIR]\n'
                + '  [--install-root WECHAT_INSTALL] [--ready-timeout-ms 120000]');
        } else {
            const report = await runInputSmoke(options);
            if (report.status !== 'passed') process.exitCode = 1;
        }
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
