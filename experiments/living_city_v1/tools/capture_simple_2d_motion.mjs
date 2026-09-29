import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Reproducible, no-input portrait capture of the isolated Cocos build.
// Run after a web-mobile build: node tools/capture_simple_2d_motion.mjs
const root = path.resolve('build/web-mobile');
const out = path.resolve(process.env.MOTION_CAPTURE_OUT ?? 'art/review/simple_2d_trial_001/motion');
const seconds = Number(process.env.MOTION_CAPTURE_SECONDS ?? 12);
const fps = Number(process.env.MOTION_CAPTURE_FPS ?? 5);
assert.ok(seconds >= 10 && seconds <= 30 && fps >= 2 && fps <= 10);
const framesDir = path.join(out, 'frames');
fs.mkdirSync(framesDir, { recursive: true });

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
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.resolve(`temp/edge-motion-${process.pid}`)}`,
    'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], warnings = [], failedRequests = [], samples = [];
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
    async function snapshot() {
        return evaluate(`(() => {
            if (typeof cc === 'undefined' || cc.director.getScene()?.name !== 'city') return {ready:false};
            const canvas=cc.director.getScene().getChildByName('Canvas');
            const city=canvas?.getComponent('CityManager')?.current;
            const box=city?.view?.livingGreybox;
            const camera=canvas?.getChildByName('Camera')?.getComponent(cc.Camera);
            if (!box?.blueprint || !camera) return {ready:false};
            const screen=node=>{const p=camera.worldToScreen(node.worldPosition);return {x:p.x,y:innerHeight-p.y};};
            const messenger=box.npcs.find(n=>n.plan.id==='messenger_customer');
            const cel=messenger?.cels;
            const anchor=cel?.visual?.getComponent('UITransform')?.anchorPoint;
            return {ready:true,viewport:{width:innerWidth,height:innerHeight},
                sceneSlots:box.blueprint.artSlots.length,
                artSceneSlots:(()=>{let n=0;const walk=node=>{if(node.name?.startsWith('lc_')&&node.name?.endsWith('_art'))n++;node.children.forEach(walk)};walk(city.root);return n})(),
                messenger:{world:{x:messenger.node.position.x,y:messenger.node.position.y},
                    screen:screen(messenger.node),footpointLocal:cel?.visual?.position,
                    anchor:anchor?{x:anchor.x,y:anchor.y}:null,
                    celReady:!!cel?.isReady,clip:cel?.currentClip??null,frameIndex:cel?.frameIndex??null,
                    frameName:cel?.sprite?.spriteFrame?.name??null,
                    moving:messenger.moving,nextIndex:messenger.nextIndex},
                others:box.npcs.filter(n=>n!==messenger).map(n=>({id:n.plan.id,
                    x:n.node.position.x,y:n.node.position.y,moving:n.moving})),
                eventSeconds:box.eventSeconds,eventCompleted:box.eventCompleted};
        })()`);
    }
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',
        { width:444, height:960, deviceScaleFactor:1, mobile:true });
    await send('Page.navigate', { url:`http://127.0.0.1:${port}/` });
    let ready;
    for (let i = 0; i < 180; i++) {
        ready = await snapshot();
        if (ready.ready && ready.messenger?.celReady && ready.artSceneSlots >= ready.sceneSlots) break;
        await wait(100);
    }
    assert.ok(ready.ready && ready.messenger?.celReady && ready.artSceneSlots >= ready.sceneSlots,
        `Simple 2D scene not ready: ${JSON.stringify(ready)}`);
    assert.deepEqual(ready.viewport, {width:444,height:960});
    await evaluate(`(() => { cc.profiler?.hideStats?.(); return true; })()`);
    const start = performance.now();
    const frameCount = Math.round(seconds * fps) + 1;
    for (let i = 0; i < frameCount; i++) {
        const elapsed = performance.now() - start;
        await wait(Math.max(0, Math.round(i * 1000 / fps - elapsed)));
        const state = await snapshot();
        const image = await send('Page.captureScreenshot', {format:'png'});
        const name = `frame_${String(i).padStart(3,'0')}.png`;
        fs.writeFileSync(path.join(framesDir, name), Buffer.from(image.result.data, 'base64'));
        samples.push({frame:i,elapsedSeconds:Number(((performance.now()-start)/1000).toFixed(3)),
            image:name,...state});
    }
    const clips = [...new Set(samples.map(s=>s.messenger?.clip).filter(Boolean))];
    const frameNames = [...new Set(samples.map(s=>s.messenger?.frameName).filter(Boolean))];
    const footOffsetMax = Math.max(...samples.map(s=>Math.hypot(
        s.messenger?.footpointLocal?.x??0,s.messenger?.footpointLocal?.y??0)));
    assert.ok(samples.some(s=>s.eventSeconds>=0), 'Tea exchange missing from capture');
    assert.ok(samples.some(s=>s.eventCompleted), 'Messenger did not leave after exchange');
    assert.ok(clips.some(c=>c.startsWith('walk_')) && clips.includes('receive_w'),
        `Expected walk and receive clips, got ${clips.join(',')}`);
    assert.ok(frameNames.length >= 8, `Sprite frames barely changed: ${frameNames.length}`);
    assert.ok(footOffsetMax < 0.001, `Cel visual moved off actor footpoint by ${footOffsetMax}`);
    assert.deepEqual(warnings, [], 'Runtime warnings');
    assert.deepEqual(errors, [], 'Runtime errors');
    assert.deepEqual(failedRequests, [], 'Failed requests');
    const report = {status:'mechanical_pass',referenceViewport:{width:444,height:960},
        requestedSeconds:seconds,fps,actualSeconds:samples.at(-1).elapsedSeconds,clips,
        distinctSpriteFrames:frameNames.length,footOffsetMaxWorld:footOffsetMax,
        eventCaptured:true,completedCaptured:true,errors,warnings,failedRequests,
        samples};
    fs.writeFileSync(path.join(out,'motion_capture.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:report.status,frames:samples.length,seconds:report.actualSeconds,
        clips,distinctSpriteFrames:frameNames.length,footOffsetMaxWorld:footOffsetMax,
        output:out}));
} finally {
    socket?.close();
    edge.kill();
    server.close();
}
