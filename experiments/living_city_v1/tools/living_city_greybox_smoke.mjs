import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Exercises the isolated Cocos Web Mobile build at the intended portrait size.
const root = path.resolve('build/web-mobile');
const out = path.resolve(process.env.LIVING_CITY_SMOKE_OUT ?? 'art/review/living_city_greybox_001');
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream' };
const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
        if (error) return response.writeHead(404).end(pathname);
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(bytes);
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 12000 + process.pid % 40000;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--window-size=444,960',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.resolve(`temp/edge-living-${process.pid}`)}`,
    'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
const warnings = [];
const failedRequests = [];
let socket;

try {
    let tab;
    for (let i = 0; i < 60; i++) {
        try {
            const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`,
                { signal: AbortSignal.timeout(1000) })).json();
            tab = tabs.find(item => item.type === 'page');
            if (tab) break;
        } catch {}
        await wait(250);
    }
    if (!tab) throw new Error('Edge debugging endpoint did not start');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await Promise.race([
        new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }),
        wait(10000).then(() => { throw new Error('CDP WebSocket did not connect'); }),
    ]);
    let nextId = 1;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled') {
            const value = message.params.args.map(arg => arg.value ?? arg.description).join(' ');
            if (message.params.type === 'error') errors.push(value);
            if (message.params.type === 'warn' || message.params.type === 'warning') warnings.push(value);
        } else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
            failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
        } else if (message.method === 'Network.loadingFailed') {
            failedRequests.push(message.params.errorText);
        }
    };
    function send(method, params = {}) {
        const id = nextId++;
        return Promise.race([
            new Promise(resolve => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); }),
            wait(15000).then(() => { throw new Error(`CDP ${method} timed out`); }),
        ]);
    }
    async function evaluate(expression) {
        const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (reply.result.exceptionDetails) throw new Error(
            reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text);
        return reply.result.result.value;
    }
    async function screenshot(name) {
        const response = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, name), Buffer.from(response.result.data, 'base64'));
    }
    async function state() {
        return evaluate(`(() => {
            if (typeof cc === 'undefined' || cc.director.getScene()?.name !== 'city') return {ready:false};
            const canvas=cc.director.getScene().getChildByName('Canvas');
            const manager=canvas?.getComponent('CityManager'), city=manager?.current;
            const map=city?.root.getChildByName('TestMap'), box=city?.view?.livingGreybox;
            const camera=canvas?.getChildByName('Camera')?.getComponent(cc.Camera);
            if (!city || !map || !box?.blueprint || !camera) return {ready:false,city:city?.content?.config?.cityId};
            const screen=node=>{const p=camera.worldToScreen(node.worldPosition);return {x:p.x,y:innerHeight-p.y};};
            const search=(node,name)=>node.name===name?node:node.children.map(child=>search(child,name)).find(Boolean);
            const count=(node,predicate)=>Number(predicate(node))+node.children.reduce((total,child)=>total+count(child,predicate),0);
            const target=id=>{
                const node=search(map,id);
                if (!node) return null;
                const hit=city.content.config.hiddenObjects.find(item=>item.id===id)?.clickArea;
                const center=camera.worldToScreen(node.worldPosition);
                const edgeWorld=node.worldPosition.clone();
                edgeWorld.x += hit?.radius * node.worldScale.x || 0;
                const edge=camera.worldToScreen(edgeWorld);
                return {id,x:node.position.x,y:node.position.y,screen:screen(node),
                    hitRadiusPx:Math.hypot(edge.x-center.x,edge.y-center.y),
                    active:node.activeInHierarchy};
            };
            const speaker=box.npcs.find(n=>n.plan.id==='tea_vendor');
            const speakerWorld=speaker?.node.worldPosition.clone();
            if (speakerWorld) speakerWorld.y+=speaker.plan.actorHeight*.65*speaker.node.worldScale.y;
            const speakerScreen=speakerWorld?camera.worldToScreen(speakerWorld):null;
            let savedCompleted=null;
            try { savedCompleted=JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))
                ?.cities?.living_city_street_block_01?.completedTaskIds?.length??null; } catch {}
            return {ready:true,city:city.content.config.cityId,viewport:{width:innerWidth,height:innerHeight},
                map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                npcCount:box.npcs.length,npcs:box.npcs.map(n=>({id:n.plan.id,x:n.node.position.x,y:n.node.position.y,
                    nextIndex:n.nextIndex,moving:n.moving,paused:n.paused})),
                eventSeconds:box.eventSeconds,eventCompleted:box.eventCompleted,cupActive:box.cupMarker?.active,
                slotCount:box.blueprint.artSlots.length,
                art:{sceneSlots:count(map,n=>n.name.startsWith('lc_')&&n.name.endsWith('_art')),
                    targetSprites:count(map,n=>n.name==='PropArt'),
                    messengerCels:!!box.npcs.find(n=>n.plan.id==='messenger_customer')?.cels?.isReady,
                    ground:!!box.artGroundLoaded,debugLabelVisible:!!box.debugLabel?.active},
                stickers:[...city.view.stickerCards].map(([id,card])=>({id,
                    screen:screen(card.node),hasImage:!!card.icon.spriteFrame,found:card.stamp.active})),
                stickerClue:city.view.stickerClueLabel?.string,
                npcClue:{active:!!box.clueBubble?.active,text:box.clueText?.string,
                    speakerScreen:speakerScreen?{x:speakerScreen.x,y:innerHeight-speakerScreen.y}:null},
                savedCompleted,
                memorySavedCompleted:manager.save?.getCityProgress(city.content.config.cityId)
                    ?.completedTaskIds?.length??null,
                snapshotCompleted:city.view.getProgressSnapshot().completedTaskIds.length,
                targets:['tea_clay_whistle','tailor_thimble','banner_knot','chestnut_tongs'].map(target),
                progress:city.view.progress};
        })()`);
    }
    async function until(predicate, description, attempts = 150) {
        let current;
        for (let i = 0; i < attempts; i++) {
            current = await state();
            if (predicate(current)) return current;
            await wait(100);
        }
        throw new Error(`${description}: ${JSON.stringify({current, errors, warnings, failedRequests})}`);
    }
    async function click(x, y) {
        await send('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent', {type:'mouseReleased',x,y,button:'left',clickCount:1});
        await wait(170);
    }
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',
        {width:444,height:960,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate', {url:`http://127.0.0.1:${port}/`});
    let current = await until(s => s.ready && s.city === 'living_city_street_block_01',
        'Living city street did not load');
    assert.equal(current.npcCount, 8);
    assert.ok(current.slotCount >= 23, `Street block lost required art slots: ${current.slotCount}`);
    assert.equal(current.progress.requiredTotal, 4);
    assert.equal(current.progress.requiredCompleted, 0);
    assert.equal(current.viewport.width, 444);
    assert.equal(current.viewport.height, 960);
    const ambientStart = new Map(current.npcs.map(npc => [npc.id, {x:npc.x,y:npc.y}]));
    const messengerStart = current.npcs.find(n => n.id === 'messenger_customer');
    if (process.env.LIVING_CITY_REQUIRE_ART === '1') {
        current = await until(s => s.art?.sceneSlots === s.slotCount && s.art?.targetSprites === 4 &&
            s.art?.messengerCels && s.art?.ground && !s.art?.debugLabelVisible,
        'Complete simplified 2D art did not activate');
    }
    current = await until(s => s.stickers.length === 4 && s.stickers.every(sticker => sticker.hasImage),
        'Four item stickers did not load');
    assert.deepEqual(current.stickers.map(sticker => sticker.id),
        ['tea_clay_whistle','tailor_thimble','banner_knot','chestnut_tongs']);
    await evaluate(`(() => { cc.profiler?.hideStats?.(); return true; })()`);
    await wait(600);
    await screenshot('initial_444x960.png');
    const speaker = current.npcClue.speakerScreen;
    assert.ok(speaker?.x > 0 && speaker.x < 444 && speaker.y > 0 && speaker.y < 790,
        `Tea vendor cannot be tapped in the playfield: ${JSON.stringify(speaker)}`);
    await click(speaker.x, speaker.y);
    current = await state();
    assert.ok(current.npcClue.active && current.npcClue.text.includes('茶香'),
        'Tapping the tea vendor did not show the contextual clue');
    assert.equal(current.progress.requiredCompleted, 0, 'NPC clue changed task progress');
    await screenshot('npc_clue_444x960.png');
    const firstSticker = current.stickers[0];
    const mapBeforeSticker = current.map;
    await click(firstSticker.screen.x, firstSticker.screen.y);
    current = await state();
    assert.ok(current.stickerClue.includes('陶哨'), 'Tapping a sticker did not reveal its clue');
    assert.equal(current.progress.requiredCompleted, 0, 'Sticker tap changed task progress');
    assert.ok(Math.abs(current.map.x - mapBeforeSticker.x) < 0.5 &&
        Math.abs(current.map.y - mapBeforeSticker.y) < 0.5, 'Sticker tap moved the map');
    await screenshot('sticker_clue_444x960.png');
    await evaluate(`(() => { const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const v=c.current.view.controller;v.viewport.zoomAt(1/1.4,0,0);v.applyState();v.focusAt(0,20);return true; })()`);
    await wait(100);
    await screenshot('wide_framing_probe_444x960.png');
    await evaluate(`(() => { const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const v=c.current.view.controller;v.viewport.zoomAt(1.4,0,0);v.applyState();v.focusAt(-230,20);return true; })()`);
    const initialScale = (await state()).map.scale;
    await evaluate(`(() => { const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const v=c.current.view.controller;v.viewport.zoomAt(2.25/1.4,0,0);v.applyState();return true; })()`);
    await wait(120);
    const detailScale = (await state()).map.scale;
    assert.ok(Math.abs(detailScale / initialScale - 2.25 / 1.4) < 0.02,
        `Detail zoom not reached: ${initialScale} -> ${detailScale}`);
    await screenshot('detail_zoom_444x960.png');
    await evaluate(`(() => { const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const v=c.current.view.controller;v.viewport.zoomAt(1.4/2.25,0,0);v.applyState();return true; })()`);
    assert.ok(Math.abs((await state()).map.scale / initialScale - 1) < 0.02,
        'Initial zoom could not be restored');
    assert.equal((await state()).progress.requiredCompleted, 0, 'Zoom completed a task');
    current = await until(s => s.eventSeconds >= 0 || s.eventCompleted,
        'Messenger never arrived at tea counter', 180);
    const messengerAtCounter = current.npcs.find(n => n.id === 'messenger_customer');
    assert.ok(messengerAtCounter.y - messengerStart.y > 500, 'Messenger did not approach tea counter');
    for (const id of ['tea_regular', 'flower_buyer', 'lane_child']) {
        const start = ambientStart.get(id);
        const actor = current.npcs.find(n => n.id === id);
        assert.ok(start && actor && Math.hypot(actor.x-start.x, actor.y-start.y) > 20,
            `${id} did not move independently during the courier approach`);
    }
    await screenshot('tea_event_444x960.png');
    current = await until(s => s.eventCompleted, 'Tea exchange did not finish', 60);
    assert.ok(current.npcs.find(n => n.id === 'messenger_customer').nextIndex >= 5);
    await screenshot('after_event_444x960.png');
    // The first target is visible. A drag starting on it must not complete a task.
    let target = current.targets.find(t => t.id === 'tea_clay_whistle');
    assert.ok(target?.screen.x > 0 && target.screen.x < 444 && target.screen.y > 0 && target.screen.y < 804,
        `Whistle not in playfield: ${JSON.stringify(target)}`);
    await send('Input.dispatchMouseEvent', {type:'mousePressed',x:target.screen.x,y:target.screen.y,
        button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:target.screen.x+55,y:target.screen.y+30,
        button:'left',buttons:1});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:target.screen.x+55,y:target.screen.y+30,
        button:'left',clickCount:1});
    await wait(200);
    assert.equal((await state()).progress.requiredCompleted, 0, 'Drag completed a task');
    // Tap a neighbouring stall detail first, outside the target's projected hit circle.
    // These offsets land on the tea shelves, tailor goods, banner fastener and cart tray.
    const nearMissOffsets = {
        tea_clay_whistle: {dx:-54,dy:-12},
        tailor_thimble: {dx:-55,dy:5},
        banner_knot: {dx:82,dy:0},
        chestnut_tongs: {dx:55,dy:-24},
    };
    const nearMissChecks = [];
    for (const id of ['tea_clay_whistle','tailor_thimble','banner_knot','chestnut_tongs']) {
        await evaluate(`(() => {const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
            const b=c.current.view.livingGreybox.blueprint.hiddenObjectSlots.find(x=>x.id==='${id}');
            c.current.view.controller.focusAt(b.at.x,b.at.y);return true;})()`);
        await wait(180);
        target = (await state()).targets.find(t => t.id === id);
        assert.ok(target?.screen.x > 0 && target.screen.x < 444 && target.screen.y > 0 && target.screen.y < 804,
            `${id} could not be focused into the playfield: ${JSON.stringify(target)}`);
        await screenshot(`${id}_focus_444x960.png`);
        const offset = nearMissOffsets[id];
        const missX = target.screen.x + offset.dx;
        const missY = target.screen.y + offset.dy;
        assert.ok(target.hitRadiusPx > 0 && Math.hypot(offset.dx,offset.dy) > target.hitRadiusPx + 4,
            `${id} neighbour tap overlaps target circle: ${JSON.stringify({target,offset})}`);
        assert.ok(missX > 0 && missX < 444 && missY > 0 && missY < 804,
            `${id} neighbour tap left the playfield: ${JSON.stringify({target,offset})}`);
        const previousProgress = (await state()).progress.requiredCompleted;
        await click(missX,missY);
        assert.equal((await state()).progress.requiredCompleted,previousProgress,
            `${id} neighbour tap completed a target`);
        nearMissChecks.push({id,dx:offset.dx,dy:offset.dy,
            hitRadiusPx:Math.round(target.hitRadiusPx*10)/10});
        await click(target.screen.x,target.screen.y);
        const afterHit = await state();
        const progress = afterHit.progress.requiredCompleted;
        assert.equal(progress, ['tea_clay_whistle','tailor_thimble','banner_knot','chestnut_tongs'].indexOf(id)+1,
            `${id} click did not update progress`);
        assert.equal(afterHit.memorySavedCompleted, progress,
            `${id} was not saved after tap: ${JSON.stringify({
                memory:afterHit.memorySavedCompleted,snapshot:afterHit.snapshotCompleted,warnings})}`);
        assert.equal((await state()).stickers.find(sticker => sticker.id === id)?.found, true,
            `${id} sticker did not receive its found stamp`);
        await click(target.screen.x,target.screen.y);
        assert.equal((await state()).progress.requiredCompleted, progress, `${id} counted twice`);
    }
    current = await state();
    assert.equal(current.progress.allRequiredComplete, true);
    assert.equal(current.savedCompleted, 4,
        `Completed stickers were not saved locally: ${JSON.stringify({
            saved:current.savedCompleted,memory:current.memorySavedCompleted,
            snapshot:current.snapshotCompleted})}`);
    const hintButton = await evaluate(`(() => {
        const canvas=cc.director.getScene().getChildByName('Canvas');
        const manager=canvas.getComponent('CityManager');
        const camera=canvas.getChildByName('Camera').getComponent(cc.Camera);
        const button=manager.current.view.hintPanel.button;
        const p=camera.worldToScreen(button.worldPosition);
        return {x:p.x,y:innerHeight-p.y};
    })()`);
    assert.ok(hintButton.x > 0 && hintButton.x < 444 && hintButton.y > 0 && hintButton.y < 960,
        `Hint button is outside the viewport: ${JSON.stringify(hintButton)}`);
    await click(hintButton.x, hintButton.y);
    const hintMessage = await evaluate(`(() => {
        const canvas=cc.director.getScene().getChildByName('Canvas');
        return canvas.getComponent('CityManager').current.view.hintPanel.message.string;
    })()`);
    assert.equal(hintMessage, '本城所有目标已找到', 'Hint button did not react to click');
    assert.equal((await state()).progress.requiredCompleted, 4, 'Hint button changed task progress');
    const completedRun = current;
    await send('Page.reload');
    current = await until(s => s.ready && s.progress.requiredCompleted === 4 &&
        s.stickers.length === 4 && s.stickers.every(sticker => sticker.found) &&
        s.art.sceneSlots === s.slotCount && s.art.messengerCels && s.art.ground,
    'Saved progress and sticker stamps did not survive a reload');
    await screenshot('restored_stickers_444x960.png');
    assert.deepEqual(warnings, [], 'Runtime warnings');
    assert.deepEqual(errors, [], 'Runtime errors');
    assert.deepEqual(failedRequests, [], 'Failed requests');
    console.log(JSON.stringify({status:'passed',city:current.city,viewport:current.viewport,
        slotCount:current.slotCount,npcCount:current.npcCount,eventCompleted:completedRun.eventCompleted,
        art:current.art,
        completed:current.progress.requiredCompleted,savedCompleted:current.savedCompleted,
        stickers:current.stickers.length,errors:errors.length,warnings:warnings.length,
        failedRequests:failedRequests.length,nearMissChecks,
        screenshots:fs.readdirSync(out).filter(x=>x.endsWith('.png'))}));
} finally {
    socket?.close();
    edge.kill();
    server.close();
}
