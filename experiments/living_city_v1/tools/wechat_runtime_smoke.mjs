import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

// This entry point only reads an already-open, authorized WeChat game. It never
// refreshes, navigates, taps, clears caches, changes settings, or writes storage.
const runFile = promisify(execFile);
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIVING_CITY_SAVE_KEY = 'chriken_living_city_v1_save_v1';
export const DEFAULT_INSTALL_ROOT = 'Z:/微信开发者工具/微信web开发者工具';
export const DEFAULT_PROJECT = path.join(sourceRoot, 'build', 'wechatgame');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const slash = value => value.replaceAll('\\', '/');
const stamp = () => new Date().toISOString().replaceAll(/[:.]/g, '-');
const bootstrap = "const e=process.argv[1],a=process.argv.slice(2).filter(function(x){return x!=='--electron'});if(!process.env.cwd)process.env.cwd=process.cwd();process.argv=[process.execPath,e,'--electron'].concat(a);require(e)";

// Official evaluate can enter the host window or the game's own context after a
// recompile. Avoid assuming that either cc or __gameContextWindow always exists.
// Exported for subsequent input tests to use the same Cocos context resolver.
export const GAME_CONTEXT_SOURCE = `
    const contexts = [];
    const addContext = (name, value) => { if (value && !contexts.some(item => item.value === value)) contexts.push({name, value}); };
    if (typeof __gameContextWindow !== 'undefined') addContext('__gameContextWindow', __gameContextWindow);
    if (typeof globalThis !== 'undefined') {
        addContext('globalThis.__gameContextWindow', globalThis.__gameContextWindow);
        addContext('globalThis.GameGlobal', globalThis.GameGlobal);
        addContext('globalThis', globalThis);
    }
    if (typeof GameGlobal !== 'undefined') addContext('GameGlobal', GameGlobal);
    if (typeof window !== 'undefined') { addContext('window.__gameContextWindow', window.__gameContextWindow); addContext('window', window); }
    const resolved = contexts.find(item => item.value.cc && item.value.cc.director);
    const game = resolved ? resolved.value : (contexts[0] ? contexts[0].value : null);
    const C = resolved ? resolved.value.cc : (typeof cc !== 'undefined' ? cc : null);
    const wxContext = contexts.find(item => item.value.wx && typeof item.value.wx.getStorageSync === 'function');
    const wxAPI = (game && game.wx && typeof game.wx.getStorageSync === 'function') ? game.wx
        : (wxContext ? wxContext.value.wx : (typeof wx !== 'undefined' ? wx : null));
    const diagnostics = {
        cc: typeof cc, System: typeof System, GameGlobal: typeof GameGlobal,
        __gameContextWindow: typeof __gameContextWindow,
        globalCc: typeof globalThis !== 'undefined' ? typeof globalThis.cc : 'undefined',
        resolvedContext: resolved ? resolved.name : null,
        contexts: contexts.map(item => ({name: item.name, cc: typeof item.value.cc, System: typeof item.value.System})),
    };`;

export const SAVE_READ_SOURCE = `function (key) {
    ${GAME_CONTEXT_SOURCE}
    if (!wxAPI || typeof wxAPI.getStorageSync !== 'function') throw new Error('WeChat storage is unavailable; no backup was made');
    const value = wxAPI.getStorageSync(key);
    const storageInfo = typeof wxAPI.getStorageInfoSync === 'function' ? wxAPI.getStorageInfoSync() : null;
    const present = storageInfo && Array.isArray(storageInfo.keys) ? storageInfo.keys.includes(key) : value !== '' && value !== undefined && value !== null;
    return {key, backend: 'wx.getStorageSync', present, presenceMethod: storageInfo ? 'wx.getStorageInfoSync' : 'value_fallback',
        value: value === undefined ? null : value, valueType: typeof value, diagnostics};
}`;

export const RUNTIME_STATE_SOURCE = `function (options) {
    ${GAME_CONTEXT_SOURCE}
    const scene = C && C.director && C.director.getScene();
    const canvas = scene && scene.getChildByName('Canvas');
    const componentNames = canvas && canvas._components ? canvas._components.map(component => component.__classname__ || component.constructor.name) : [];
    const manager = canvas && canvas.getComponent('CityManager');
    const city = manager && manager.current, view = city && city.view;
    const box = view && view.livingGreybox;
    const partial = {ready: false, scene: scene ? scene.name : null, diagnostics, canvasComponents: componentNames,
        hasManager: !!manager, hasCity: !!city, hasView: !!view, hasBlueprint: !!(box && box.blueprint)};
    if (!scene || scene.name !== 'city' || !box || !box.blueprint) return partial;
    const map = city.root.getChildByName('TestMap');
    if (!map) return Object.assign(partial, {reason: 'TestMap is unavailable'});
    const config = city.content.config;
    const search = (node, name) => {
        if (!node) return null;
        if (node.name === name) return node;
        for (const child of node.children) { const found = search(child, name); if (found) return found; }
        return null;
    };
    const uuid = frame => frame ? (frame.uuid || frame._uuid || null) : null;
    const spriteInfo = sprite => {
        const frame = sprite && sprite.spriteFrame, image = frame && frame.texture && frame.texture.image;
        return frame ? {uuid: uuid(frame), name: frame.name,
            originalSize: {width: frame.originalSize.width, height: frame.originalSize.height},
            imageUrl: image ? (image.nativeUrl || image._nativeUrl || image.url || null) : null} : null;
    };
    const frameSize = C.view && C.view.getFrameSize ? C.view.getFrameSize() : null;
    const canvasSize = C.game && C.game.canvas ? {width: C.game.canvas.width, height: C.game.canvas.height} : frameSize;
    const cameraNode = canvas.getChildByName('Camera'), camera = cameraNode && cameraNode.getComponent(C.Camera);
    const screen = node => {
        if (!node || !camera || !canvasSize) return null;
        const point = camera.worldToScreen(node.worldPosition);
        return {x: point.x, y: canvasSize.height - point.y, coordinateSpace: 'canvas'};
    };
    const sceneArt = box.blueprint.artSlots.map(slot => {
        const node = search(map, slot.id + '_art'), sprite = node && node.getComponent(C.Sprite);
        return {id: slot.id, layer: slot.layer, loaded: !!(sprite && sprite.spriteFrame), active: !!(node && node.activeInHierarchy),
            pngPath: 'simple2d_scene/' + slot.id + '.png', center: slot.center, size: slot.size,
            textureScale: slot.textureScale || 1, screen: screen(node), sprite: spriteInfo(sprite)};
    });
    const targets = config.hiddenObjects.map(target => {
        const node = search(map, target.id), art = node && node.getChildByName('PropArt'), sprite = art && art.getComponent(C.Sprite);
        return {id: target.id, loaded: !!(sprite && sprite.spriteFrame), active: !!(node && node.activeInHierarchy),
            pngPath: 'targets/' + target.id + '.png', screen: screen(node),
            position: node ? {x: node.position.x, y: node.position.y} : null, sprite: spriteInfo(sprite)};
    });
    const interactions = Array.from(view.interactions || []).map(([id, item]) => {
        const sprite = item.node.getComponent(C.Sprite);
        return {id, state: item.state, loaded: !!(sprite && sprite.spriteFrame), screen: screen(item.node), sprite: spriteInfo(sprite),
            foreground: item.foreground ? {active: item.foreground.activeInHierarchy,
                loaded: !!(item.foregroundSprite && item.foregroundSprite.spriteFrame)} : null};
    });
    const stickers = Array.from(view.stickerCards || []).map(([id, item]) => ({id, collected: item.collected,
        loaded: !!item.icon.spriteFrame, backgroundLoaded: !!(item.background && item.background.spriteFrame),
        active: item.node.activeInHierarchy, screen: screen(item.node), sprite: spriteInfo(item.icon)}));
    const npcs = box.npcs.map(actor => {
        const player = actor.cels, sprite = player && player.sprite, frame = sprite && sprite.spriteFrame;
        const clip = player && player.currentClip, frameIndex = player && player.frameIndex;
        const expectedFrame = player && player.clips && player.clips[clip] && player.clips[clip][frameIndex];
        const graphics = C.Graphics && actor.node.getComponent(C.Graphics);
        const result = {id: actor.plan.id, x: actor.node.position.x, y: actor.node.position.y, screen: screen(actor.node),
            active: actor.node.activeInHierarchy, moving: actor.moving, celsReady: !!(player && player.isReady),
            proceduralBody: !!(graphics && graphics.enabled), celClip: clip || null, celFrame: frameIndex,
            celSprite: frame ? {uuid: uuid(frame), loaded: true, active: !!(player.visual && player.visual.activeInHierarchy)} : null,
            expectedFrameUuid: expectedFrame ? uuid(expectedFrame.frame) : null,
            displayedFrameMatches: !!frame && !!expectedFrame && uuid(frame) === uuid(expectedFrame.frame)};
        if (!options || !options.animationOnly) {
            result.loadedClipFrames = player && player.clips ? Object.fromEntries(Object.entries(player.clips).map(([name, frames]) =>
                [name, frames.map(entry => uuid(entry.frame))])) : null;
            result.manifest = player && player.manifest ? {schemaVersion: player.manifest.schemaVersion, actorId: player.manifest.actorId,
                canvasPx: player.manifest.canvasPx, footpointPx: player.manifest.footpointPx} : null;
        }
        return result;
    });
    const panelSprite = view.taskPanel && view.taskPanel.getComponent(C.Sprite);
    const loaded = {
        scene: sceneArt.filter(item => item.loaded).length, targets: targets.filter(item => item.loaded).length,
        reveals: interactions.filter(item => item.loaded).length,
        residents: npcs.filter(item => item.celsReady && item.celSprite && item.celSprite.loaded && item.celSprite.active).length,
        cards: stickers.filter(item => item.loaded && item.backgroundLoaded).length,
        journalPanel: !!(panelSprite && panelSprite.spriteFrame), ground: !!box.artGroundLoaded,
    };
    const ready = loaded.ground && loaded.journalPanel && loaded.scene === sceneArt.length
        && loaded.targets === config.hiddenObjects.length && loaded.reveals === config.interactiveObjects.length
        && loaded.residents === box.blueprint.npcPlans.length && loaded.cards === config.hiddenObjects.length;
    if (options && options.animationOnly) return {ready, cityId: config.cityId, npcs};
    return {ready, scene: scene.name, diagnostics, cityId: config.cityId, targetRevision: config.targetRevision || null,
        declaredGreyboxReady: typeof box.ready === 'boolean' ? box.ready : null,
        expected: {layers: box.blueprint.artSlots.length, targets: config.hiddenObjects.length,
            reveals: config.interactiveObjects.length, residents: box.blueprint.npcPlans.length,
            buildings: box.blueprint.artSlots.filter(slot => slot.layer === 'building_back').length},
        loaded, mapSize: config.mapSize, viewport: {canvasSize, frameSize: frameSize ? {width: frameSize.width, height: frameSize.height} : null,
            width: game && game.innerWidth, height: game && game.innerHeight},
        map: {x: map.position.x, y: map.position.y, scale: map.scale.x}, progress: view.progress,
        snapshot: view.getProgressSnapshot(), selectedStickerId: view.selectedStickerId || null,
        journal: {title: view.taskTitleLabel ? view.taskTitleLabel.string : null,
            clue: view.stickerClueLabel ? view.stickerClueLabel.string : null, panel: spriteInfo(panelSprite)},
        sceneArt, targets, interactions, stickers, npcs};
}`;

/** Strip CLI log prefixes without depending on console spinner formatting. */
export function parseCliOutput(stdout) {
    const text = String(stdout).replaceAll(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/^\uFEFF/, '').trim();
    try { return JSON.parse(text); } catch {}
    for (let index = 0; index < text.length; index++) {
        if (text[index] !== '{') continue;
        try {
            const result = JSON.parse(text.slice(index));
            if (typeof result.ok === 'boolean') return result;
        } catch {}
    }
    throw new Error('WeChat CLI did not return a JSON outcome');
}

/** Official CLI normalizes MCP text/body; evaluate adds success/result once more. */
export function unwrapToolResult(envelope) {
    assert.equal(envelope.ok, true, `${envelope.tool || 'WeChat CLI'}: ${envelope.message || envelope.errorType || 'failed'}`);
    let value = envelope.result;
    for (let depth = 0; depth < 5; depth++) {
        if (!value || typeof value !== 'object') break;
        if (value.status === 'pending') throw new Error('WeChat CLI is waiting for authorization; smoke did not authorize or change settings');
        if (value.success === false || value.isError) throw new Error(`WeChat tool failed: ${value.message || value.error || value.code || 'unknown error'}`);
        if (value.success === true && Object.hasOwn(value, 'result')) { value = value.result; continue; }
        if (Object.hasOwn(value, 'body') && (Object.hasOwn(value, 'status') || Object.hasOwn(value, 'headers'))) {
            value = typeof value.body === 'string' ? JSON.parse(value.body) : value.body; continue;
        }
        if (value.content?.[0]?.type === 'text') {
            try { value = JSON.parse(value.content[0].text); continue; } catch {}
        }
        break;
    }
    return value;
}

/**
 * Direct execFile matches official wechatide.cmd's bootstrap. Each argument is a
 * real argv item, preserving quotes/newlines in JS; no cmd.exe/shell is involved.
 * Importing this module is inert. callTool is exported for later authorized taps.
 */
export function createWechatClient({project = DEFAULT_PROJECT, out = path.join(sourceRoot, 'art/review/wechat_v17'),
    installRoot = DEFAULT_INSTALL_ROOT, clientName = 'codex', timeoutMs = 60000} = {}) {
    project = path.resolve(project); out = path.resolve(out); installRoot = path.resolve(installRoot);
    const executable = path.join(installRoot, '微信开发者工具.exe');
    const entry = path.join(installRoot, 'resources/app.asar.unpacked/js/common/cli/skill-index.js');
    const history = [];
    async function callTool(tool, fields = {}) {
        assert.match(tool, /^[a-z][a-z0-9_]*$/, 'Invalid official WeChat tool name');
        const argv = ['-e', bootstrap, entry, '-c', clientName, tool, '--project', project];
        const temporaryFiles = [];
        await mkdir(out, {recursive: true});
        const started = performance.now();
        try {
            for (const [name, value] of Object.entries(fields)) {
                if (value === undefined || value === null) continue;
                const flag = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replaceAll('_', '-').toLowerCase();
                assert.match(flag, /^[a-z][a-z0-9-]*$/, 'Invalid CLI flag');
                if (typeof value === 'object') {
                    const file = path.join(out, `.wechat_args_${process.pid}_${randomUUID()}.json`);
                    await writeFile(file, JSON.stringify(value), {flag: 'wx'});
                    temporaryFiles.push(file);
                    argv.push(`--${flag}-file`, file);
                } else argv.push(`--${flag}`, String(value));
            }
            let response;
            try {
                response = await runFile(executable, argv, {cwd: installRoot, windowsHide: true, shell: false,
                    env: {...process.env, ELECTRON_RUN_AS_NODE: '1', cwd: project}, timeout: timeoutMs,
                    maxBuffer: 16 * 1024 * 1024, encoding: 'utf8'});
            } catch (error) {
                // Use only official error classification/message, never echo argv,
                // environment variables, authorization data, or unrelated stdout.
                let outcome;
                try { outcome = parseCliOutput(error.stdout || ''); } catch {}
                throw new Error(outcome ? `${tool}: ${outcome.errorType || 'CLI_ERROR'}: ${outcome.message || 'failed'}`
                    : `${tool}: CLI failed (${error.code || error.signal || 'unknown'}); no JSON outcome`);
            }
            const envelope = parseCliOutput(response.stdout);
            const value = unwrapToolResult(envelope);
            history.push({tool, elapsedMs: Math.round(performance.now() - started), ok: true, warnings: envelope.warnings || []});
            return value;
        } catch (error) {
            history.push({tool, elapsedMs: Math.round(performance.now() - started), ok: false, message: error.message});
            throw error;
        } finally {
            await Promise.all(temporaryFiles.map(file => unlink(file)));
        }
    }
    const evaluate = (fnSource, args = []) => {
        assert.equal(typeof fnSource, 'string'); assert.ok(Array.isArray(args));
        // --args itself is deprecated by the top-level official parser. The
        // schema-backed --args-file works and also avoids shell JSON escaping.
        return callTool('automation_evaluate', {fnSource, ...(args.length ? {args} : {})});
    };
    const screenshot = file => callTool('simulator_screenshot', {path: path.resolve(file), optimize: false});
    // Do not pass wait or waitForSelector to screenshots: those require a mini
    // program pageId and time out in a game. All waits happen in Node instead.
    return {project, out, history, callTool, evaluate, screenshot,
        readSave: () => evaluate(SAVE_READ_SOURCE, [LIVING_CITY_SAVE_KEY]),
        readState: (options = {}) => evaluate(RUNTIME_STATE_SOURCE, [options])};
}

export async function backupSave(client, file = path.join(client.out, `save_backup_${stamp()}_${randomUUID()}.json`)) {
    const storage = await client.readSave();
    assert.equal(storage.key, LIVING_CITY_SAVE_KEY);
    await mkdir(path.dirname(file), {recursive: true});
    const backup = {timestamp: new Date().toISOString(), project: slash(client.project),
        ...storage, note: 'Original value read before QA. This script does not write or restore storage.'};
    await writeFile(file, JSON.stringify(backup, null, 2) + '\n', {flag: 'wx'});
    return {file: slash(file), storage};
}

export async function waitForReady(client, {timeoutMs = 120000, intervalMs = 900, onProgress = () => {}} = {}) {
    const started = performance.now(), attempts = [];
    let latest;
    while (performance.now() - started < timeoutMs) {
        latest = await client.readState();
        attempts.push({elapsedMs: Math.round(performance.now() - started), ready: latest.ready, scene: latest.scene,
            cityId: latest.cityId || null, loaded: latest.loaded || null, diagnostics: latest.diagnostics});
        onProgress(latest, attempts.at(-1));
        if (latest.ready) return {state: latest, attempts};
        await pause(intervalMs);
    }
    const error = new Error(`City PNGs were not ready within ${timeoutMs} ms`);
    error.latest = latest; error.attempts = attempts;
    throw error;
}

export async function expectedChapter(cityId, projectSource = sourceRoot) {
    assert.match(cityId, /^living_city_(street_block_01|garden_market_02|harbor_walk_03)$/);
    const chapter = cityId.slice('living_city_'.length);
    const blueprint = JSON.parse(await readFile(path.join(projectSource, 'design', `${chapter}.json`), 'utf8'));
    const config = JSON.parse(await readFile(path.join(projectSource, 'assets/bundles', `city_${cityId}`, 'city.json'), 'utf8'));
    return {cityId, layers: blueprint.artSlots.length, targets: config.hiddenObjects.length,
        reveals: config.interactiveObjects.length, residents: blueprint.npcPlans.length,
        buildings: blueprint.artSlots.filter(slot => slot.layer === 'building_back').length,
        sceneIds: blueprint.artSlots.map(slot => slot.id), targetIds: config.hiddenObjects.map(target => target.id),
        revealIds: config.interactiveObjects.map(item => item.id), residentIds: blueprint.npcPlans.map(actor => actor.id)};
}

export function validateState(state, expected) {
    assert.equal(state.ready, true, 'Runtime is not ready');
    assert.equal(state.cityId, expected.cityId);
    for (const key of ['layers', 'targets', 'reveals', 'residents', 'buildings']) assert.equal(state.expected[key], expected[key], `${key} differs from source`);
    for (const [items, ids] of [[state.sceneArt, expected.sceneIds], [state.targets, expected.targetIds],
        [state.interactions, expected.revealIds], [state.npcs, expected.residentIds]]) {
        assert.deepEqual(items.map(item => item.id).sort(), [...ids].sort(), 'Runtime IDs differ from current authored IDs');
    }
    assert.ok(state.sceneArt.every(item => item.loaded), 'Scene PNG missing');
    assert.ok(state.targets.every(item => item.loaded), 'Target PNG missing');
    assert.ok(state.interactions.every(item => item.loaded), 'Reveal PNG missing');
    assert.ok(state.npcs.every(item => item.celsReady && item.celSprite?.loaded && item.celSprite.active), 'Resident PNG cels missing');
    assert.ok(state.npcs.every(item => !item.proceduralBody), 'Procedural resident Graphics enabled');
    assert.ok(state.npcs.every(item => item.displayedFrameMatches), 'Resident displayed PNG differs from current clip/frame');
    assert.equal(state.stickers.length, expected.targets);
    assert.ok(state.stickers.every(item => item.loaded && item.backgroundLoaded), 'Journal card PNG missing');
    assert.equal(state.loaded.journalPanel, true, 'Journal panel PNG missing');
    if (state.cityId === 'living_city_street_block_01') {
        assert.deepEqual([expected.layers, expected.targets, expected.reveals, expected.residents], [65, 12, 4, 16], 'v16/v17 first-chapter scope changed');
    }
    return {countsAndIds: 'passed', scenePngs: 'passed', targetPngs: 'passed', revealPngs: 'passed',
        residentPngs: 'passed', frameMatches: 'passed', journalPngs: 'passed'};
}

export async function sampleAnimation(client, initial, {durationMs = 12000, intervalMs = 350} = {}) {
    assert.ok(durationMs >= 10000, 'Observe animations for at least 10 seconds');
    const started = performance.now(), samples = [], observations = new Map(initial.npcs.map(actor => [actor.id,
        {id: actor.id, uuids: new Set(), clips: new Map(), minX: actor.x, maxX: actor.x, minY: actor.y, maxY: actor.y, frameMismatches: 0}]));
    function observe(state, elapsedMs) {
        assert.equal(state.ready, true, 'Runtime became unready during animation sampling');
        assert.equal(state.cityId, initial.cityId, 'Current city changed during read-only QA');
        assert.deepEqual(state.npcs.map(actor => actor.id).sort(), [...observations.keys()].sort(), 'Residents changed during observation');
        for (const actor of state.npcs) {
            const proof = observations.get(actor.id);
            if (actor.celSprite?.uuid) {
                proof.uuids.add(actor.celSprite.uuid);
                if (!proof.clips.has(actor.celClip)) proof.clips.set(actor.celClip, new Set());
                proof.clips.get(actor.celClip).add(actor.celSprite.uuid);
            }
            proof.minX = Math.min(proof.minX, actor.x); proof.maxX = Math.max(proof.maxX, actor.x);
            proof.minY = Math.min(proof.minY, actor.y); proof.maxY = Math.max(proof.maxY, actor.y);
            if (!actor.displayedFrameMatches) proof.frameMismatches++;
        }
        samples.push({elapsedMs, npcs: state.npcs.map(actor => ({id: actor.id, x: actor.x, y: actor.y,
            clip: actor.celClip, frame: actor.celFrame, uuid: actor.celSprite?.uuid || null,
            displayedFrameMatches: actor.displayedFrameMatches, moving: actor.moving}))});
    }
    observe(initial, 0);
    while (performance.now() - started < durationMs) {
        await pause(intervalMs);
        const state = await client.readState({animationOnly: true});
        observe(state, Math.round(performance.now() - started));
    }
    const actors = [...observations.values()].map(proof => ({id: proof.id, observedUuids: [...proof.uuids],
        uniqueFrames: proof.uuids.size, clips: Object.fromEntries([...proof.clips].map(([name, uuids]) => [name, [...uuids]])),
        movement: {minX: proof.minX, maxX: proof.maxX, minY: proof.minY, maxY: proof.maxY}, frameMismatches: proof.frameMismatches}));
    const frozen = actors.filter(actor => actor.uniqueFrames < 2).map(actor => actor.id);
    const mismatched = actors.filter(actor => actor.frameMismatches).map(actor => actor.id);
    return {durationMs: samples.at(-1).elapsedMs, sampleCount: samples.length, actors, samples, frozen, mismatched,
        status: frozen.length || mismatched.length ? 'failed' : 'passed'};
}

function parseOptions(argv) {
    const options = {captureOnly: true, project: DEFAULT_PROJECT, installRoot: DEFAULT_INSTALL_ROOT,
        out: path.join(sourceRoot, 'art/review/wechat_v17', `runtime_${stamp()}_${process.pid}`),
        durationMs: 12000, readyTimeoutMs: 120000, intervalMs: 350};
    const names = {'--project': 'project', '--out': 'out', '--install-root': 'installRoot',
        '--sample-ms': 'durationMs', '--ready-timeout-ms': 'readyTimeoutMs', '--sample-interval-ms': 'intervalMs'};
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        if (flag === '--capture-only') continue;
        if (flag === '--help' || flag === '-h') { options.help = true; continue; }
        assert.ok(names[flag], `Unknown option: ${flag}`);
        assert.ok(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing value for ${flag}`);
        options[names[flag]] = argv[++index];
    }
    for (const key of ['durationMs', 'readyTimeoutMs', 'intervalMs']) {
        options[key] = Number(options[key]); assert.ok(Number.isFinite(options[key]) && options[key] > 0, `Invalid ${key}`);
    }
    assert.ok(options.durationMs >= 10000, '--sample-ms must be at least 10000');
    return options;
}

export async function captureOnly(options = {}) {
    const client = createWechatClient(options);
    await mkdir(client.out, {recursive: true});
    const report = {startedAt: new Date().toISOString(), mode: 'capture-only', project: slash(client.project),
        sourceProject: slash(sourceRoot), status: 'running', storageWritesByScript: 0, inputActionsByScript: 0,
        phoneVerification: 'not_run', visualApproval: 'pending'};
    const reportFile = path.join(client.out, 'runtime_report.json');
    let lastSummary = '';
    try {
        // Back up the original raw save before waiting, sampling or screenshots.
        const backup = await backupSave(client);
        report.saveBackup = {file: backup.file, key: backup.storage.key, present: backup.storage.present, backend: backup.storage.backend};
        const ready = await waitForReady(client, {timeoutMs: options.readyTimeoutMs || 120000, onProgress(state) {
            const summary = JSON.stringify({scene: state.scene, cityId: state.cityId, ready: state.ready, loaded: state.loaded,
                cc: state.diagnostics?.resolvedContext});
            if (summary !== lastSummary) { console.log(`Waiting for runtime: ${summary}`); lastSummary = summary; }
        }});
        report.readiness = ready.attempts; report.initial = ready.state;
        report.expected = await expectedChapter(ready.state.cityId);
        report.validation = validateState(ready.state, report.expected);
        const initialScreenshot = path.join(client.out, 'simulator_ready.png');
        report.initialScreenshot = await client.screenshot(initialScreenshot);
        assert.ok((await stat(initialScreenshot)).size > 0, 'Ready screenshot was not saved');
        report.animation = await sampleAnimation(client, ready.state,
            {durationMs: options.durationMs || 12000, intervalMs: options.intervalMs || 350});
        report.final = await client.readState();
        validateState(report.final, report.expected);
        const finalScreenshot = path.join(client.out, 'simulator_after_animation.png');
        report.finalScreenshot = await client.screenshot(finalScreenshot);
        assert.ok((await stat(finalScreenshot)).size > 0, 'Final screenshot was not saved');
        const saveAfter = await client.readSave();
        report.storageObservation = {sameRawValue: JSON.stringify(backup.storage.value) === JSON.stringify(saveAfter.value),
            note: 'Only reads were performed. Automatic in-game resident events may save their own state while time passes.'};
        try {
            report.simulatorConsole = await client.callTool('get_simulator_console', {command: 'grep -n .'});
            report.consoleLimitation = 'An empty tool buffer does not establish that the user-visible game console is error-free.';
        } catch (error) { report.consoleReadError = error.message; }
        assert.equal(report.animation.status, 'passed', `Animation observation failed: frozen=${report.animation.frozen.join(',')}; mismatched=${report.animation.mismatched.join(',')}`);
        report.status = 'passed';
    } catch (error) {
        report.status = 'failed'; report.error = error.message;
        if (error.latest) report.lastState = error.latest;
        if (error.attempts) report.readiness = error.attempts;
        try { report.failureScreenshot = await client.screenshot(path.join(client.out, 'simulator_failure.png')); }
        catch (captureError) { report.failureScreenshotError = captureError.message; }
    } finally {
        report.finishedAt = new Date().toISOString(); report.cliCalls = client.history;
        await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify({status: report.status, report: slash(reportFile), cityId: report.initial?.cityId,
        loaded: report.initial?.loaded, animationMs: report.animation?.durationMs, error: report.error}, null, 2));
    return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    try {
        const options = parseOptions(process.argv.slice(2));
        if (options.help) console.log('Read-only WeChat game QA. The authorized game must already be open.\n'
            + 'node tools/wechat_runtime_smoke.mjs [--capture-only] [--project BUILD_DIR] [--out REVIEW_DIR]\n'
            + '  [--install-root WECHAT_INSTALL] [--sample-ms 12000] [--ready-timeout-ms 120000] [--sample-interval-ms 350]');
        else {
            const report = await captureOnly(options);
            if (report.status !== 'passed') process.exitCode = 1;
        }
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
