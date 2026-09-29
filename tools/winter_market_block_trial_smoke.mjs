import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Run against the built Cocos web-mobile output, not source-level mocks.
const root = path.resolve('build/web-mobile');
const outputDir = path.resolve(process.env.TRIAL_OUTPUT_DIR ?? 'art/review/winter_market_life_trial_002');
fs.mkdirSync(outputDir, { recursive: true });
const captureFrames = process.env.TRIAL_CAPTURE_FRAMES === '1';
const frameDir = path.resolve('temp/winter_market_life_trial_frames');
if (captureFrames) fs.mkdirSync(frameDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream' };
const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (name === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
        if (error) return response.writeHead(404).end(name);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(bytes);
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 12000 + process.pid % 40000;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--window-size=390,844',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-winter-trial-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [];
const warnings = [];
const failedRequests = [];

try {
    let tab;
    for (let attempt = 0; attempt < 60; attempt++) {
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
            const { type, args } = message.params;
            const value = args.map(arg => arg.value ?? arg.description).join(' ');
            if (type === 'error') errors.push(value);
            if (type === 'warning' || type === 'warn') warnings.push(value);
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
            wait(10000).then(() => { throw new Error(`CDP ${method} timed out`); }),
        ]);
    }
    async function evaluate(expression) {
        const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (reply.result.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text);
        return reply.result.result.value;
    }
    async function state() {
        return evaluate(`(() => {
            if (typeof cc === 'undefined' || cc.director.getScene()?.name !== 'city') return {ready:false};
            const canvas=cc.director.getScene().getChildByName('Canvas');
            const manager=canvas?.getComponent('CityManager');
            if (!manager?.current) return {ready:false};
            const city=manager.current, map=city.root.getChildByName('TestMap');
            const camera=canvas.getChildByName('Camera')?.getComponent(cc.Camera);
            if (!map || !camera) return {ready:false};
            const point=n=>{if(!n)return null;const p=camera.worldToScreen(n.worldPosition);
                return {x:p.x,y:innerHeight-p.y};};
            const layer=map.getChildByName('SceneDepthLayer');
            const frames=n=>{const f=n?.getComponent(cc.Sprite)?.spriteFrame;
                return f ? f.name : null;};
            const frameId=n=>{const f=n?.getComponent(cc.Sprite)?.spriteFrame;
                return f ? f.uuid : null;};
            const character=id=>{const n=layer?.getChildByName(id),a=n?.getChildByName('VisualRoot');
                return {frame:frames(a),frameId:frameId(a),x:n?.position.x??null,y:n?.position.y??null,
                    screen:point(n),visible:n?.activeInHierarchy??false,
                    behavior:n?.getComponent('ChickenCharacter')?.behaviorType??null,
                    authoredFrames:Object.keys(n?.getComponent('ChickenCharacter')?.behaviorFrames??{}),
                    animationSeconds:n?.getComponent('ChickenCharacter')?.behaviorAnimationSeconds??null};};
            const item=layer?.getChildByName('winter_slice_whistle');
            const foregrounds=city.content.config.foregroundSprites.map(({id})=>{
                const n=layer?.getChildByName(id);return {id,frame:frames(n),visible:n?.activeInHierarchy??false};});
            const footY=n=>{
                if(n.name==='TeaSteamerLiveSteam')return 16;
                const authored=city.content.config.chickens.find(c=>c.id===n.name);
                if(authored) return authored.depthY??n.position.y-(authored.visualSize?.height??0)
                    *(0.5-12/384)*authored.scale;
                return city.content.config.foregroundSprites.find(f=>f.id===n.name)?.footY??n.position.y;
            };
            const ordered=!!layer && layer.children.every((n,i,children)=>i===0 ||
                footY(children[i-1])>=footY(n));
            return {ready:true,city:city.content.config.cityId,
                background:frames(map.getChildByName('MapBackgroundArt')),
                characters:{vendor:character('winter_slice_vendor'),messenger:character('winter_slice_messenger')},
                item:{frame:frames(item?.getChildByName('PropArt')),screen:point(item),visible:item?.activeInHierarchy??false},
                foregrounds,ordered,steam:!!layer?.getChildByName('TeaSteamerLiveSteam'),progress:city.view.progress,
                map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                panel:city.view.taskPanel?.activeInHierarchy??false,
                viewport:{width:innerWidth,height:innerHeight},
                configAnimations:city.content.config.chickens.map(c=>({id:c.id,animation:c.animation}))};
        })()`);
    }
    async function until(predicate, description) {
        let current;
        for (let i=0;i<150;i++) {
            current=await state();
            if (predicate(current)) return current;
            await wait(100);
        }
        throw new Error(`${description}: ${JSON.stringify({current,errors,failedRequests})}`);
    }
    async function shot(name, dir=outputDir) {
        const image=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(dir,name),Buffer.from(image.result.data,'base64'));
    }
    async function click(x,y) {
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
        await wait(150);
    }
    async function focus(id) {
        await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
            const n=c.current.root.getChildByName('TestMap').getChildByName('SceneDepthLayer').getChildByName('${id}');
            c.current.view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
        await wait(150);
    }

    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    let current=await until(s=>s.ready && s.city==='winter_market_block_trial_001' && s.background &&
        s.characters.vendor.frame && s.characters.messenger.frame && s.item.frame &&
        s.foregrounds.every(n=>n.frame),'Winter trial art did not load');
    assert.equal(current.progress.requiredTotal,2);
    assert.equal(current.progress.requiredCompleted,0);
    assert.equal(current.steam,true,'Tea steamer animation node is missing');
    assert.equal(current.ordered,true,'Scene actor/foreground draw order is wrong');
    const initialMapScale=current.map.scale;
    await evaluate(`(()=>{cc.profiler?.hideStats?.();return true;})()`);
    await wait(100);
    await shot('trial_runtime_portrait_initial.png');
    await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const v=c.current.view.controller;v.viewport.zoomAt(1.5/1.08,0,0);v.applyState();return true;})()`);
    await wait(180);
    current=await state();
    const maxMapScale=current.map.scale;
    assert.ok(Math.abs(maxMapScale/initialMapScale-1.5/1.08)<0.02,
        `Maximum trial zoom was not reached: ${initialMapScale} -> ${maxMapScale}`);
    await shot('trial_runtime_max_zoom.png');
    await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const v=c.current.view.controller;v.viewport.zoomAt(1.08/1.5,0,0);v.applyState();return true;})()`);
    assert.ok(Math.abs((await state()).map.scale/initialMapScale-1)<0.02,
        'Could not restore the initial map zoom');
    await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        c.current.view.controller.focusAt(-74,0);return true;})()`);
    await wait(150);

    // Catch real sprite-frame swaps, rather than checking only a moving node or timer.
    current=await state();
    const vendorFrames=new Set([current.characters.vendor.frameId]);
    const messengerFrames=new Set([current.characters.messenger.frameId]);
    const vendorFrameNames=new Set([current.characters.vendor.frame]);
    const messengerFrameNames=new Set([current.characters.messenger.frame]);
    const initialMessengerX=current.characters.messenger.x;
    const initialMessengerY=current.characters.messenger.y;
    const messengerXValues=[initialMessengerX];
    const messengerYValues=[initialMessengerY];
    const vendorBehaviors=new Set([current.characters.vendor.behavior]);
    for (let i=0;i<100;i++) {
        await wait(80);
        current=await state();
        vendorFrames.add(current.characters.vendor.frameId);
        messengerFrames.add(current.characters.messenger.frameId);
        vendorFrameNames.add(current.characters.vendor.frame);
        messengerFrameNames.add(current.characters.messenger.frame);
        messengerXValues.push(current.characters.messenger.x);
        messengerYValues.push(current.characters.messenger.y);
        vendorBehaviors.add(current.characters.vendor.behavior);
        if (captureFrames && i%3===0) await shot(`trial_${String(i).padStart(3,'0')}.png`,frameDir);
    }
    if (vendorFrames.size<2 || messengerFrames.size<2 || warnings.length) {
        console.log(JSON.stringify({animationProbe:{vendor:current.characters.vendor,
            messenger:current.characters.messenger,vendorFrames:[...vendorFrameNames],
            messengerFrames:[...messengerFrameNames],errors,warnings,failedRequests,
            configAnimations:current.configAnimations}}));
    }
    assert.ok(Math.max(...messengerXValues)-Math.min(...messengerXValues)>60,
        `Messenger did not travel between street and counter: ${Math.min(...messengerXValues)}..${Math.max(...messengerXValues)}`);
    assert.ok(Math.max(...messengerYValues)-Math.min(...messengerYValues)>150,
        `Messenger did not approach the tea stall: ${Math.min(...messengerYValues)}..${Math.max(...messengerYValues)}`);
    assert.ok(vendorBehaviors.has('peck'),`Vendor did not pour on arrival: ${[...vendorBehaviors]}`);
    assert.equal(current.ordered,true,'Moving messenger broke depth order');
    await shot('trial_runtime_portrait_animated.png');

    await focus('winter_slice_whistle');
    current=await state();
    let p=current.item.screen;
    assert.ok(p && p.x>0 && p.x<390 && p.y>0 && p.y<844,`Whistle off screen: ${JSON.stringify(p)}`);
    // Panning from an item and wheel zoom must not count as a discovery.
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+48,y:p.y+28,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+48,y:p.y+28,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:p.y,deltaY:-110,deltaX:0});
    await wait(200);
    assert.equal((await state()).progress.requiredCompleted,0,'Map gesture completed a task');
    await focus('winter_slice_whistle');
    await shot('trial_runtime_whistle_focus.png');
    p=(await state()).item.screen;
    await click(p.x,p.y);
    assert.equal((await state()).progress.requiredCompleted,1,'Whistle tap did not complete task');
    await click(p.x,p.y);
    assert.equal((await state()).progress.requiredCompleted,1,'Repeated whistle tap advanced task');

    await focus('winter_slice_vendor');
    current=await state();
    p=current.characters.vendor.screen;
    assert.ok(p && p.x>0 && p.x<390 && p.y>0 && p.y<844,`Vendor off screen: ${JSON.stringify(p)}`);
    await shot('trial_runtime_vendor_focus.png');
    await click(p.x,p.y);
    current=await state();
    assert.equal(current.progress.requiredCompleted,2,'Vendor tap did not complete task');
    assert.equal(current.progress.allRequiredComplete,true);
    await click(p.x,p.y);
    assert.equal((await state()).progress.requiredCompleted,2,'Repeated vendor tap advanced task');
    assert.ok(vendorFrames.size>=2,`Vendor did not swap frames: ${[...vendorFrames]}`);
    assert.ok(messengerFrames.size>=2,`Messenger did not swap frames: ${[...messengerFrames]}`);
    assert.equal(warnings.length,0,`Runtime warnings: ${warnings.join('\n')}`);
    assert.equal(errors.length,0,`Runtime errors: ${errors.join('\n')}`);
    assert.equal(failedRequests.length,0,`Network failures: ${failedRequests.join('\n')}`);
    console.log(JSON.stringify({status:'passed',city:current.city,initialViewport:current.viewport,
        initialMapScale,maxMapScale,
        background:current.background,foregrounds:current.foregrounds,vendorFrames:[...vendorFrameNames],
        messengerFrames:[...messengerFrameNames],messengerMoved:Math.max(...messengerXValues)-Math.min(...messengerXValues),
        messengerYRange:[Math.min(...messengerYValues),Math.max(...messengerYValues)],vendorBehaviors:[...vendorBehaviors],
        requiredCompleted:current.progress.requiredCompleted,errors:errors.length,failedRequests:failedRequests.length,
        screenshots:['trial_runtime_portrait_initial.png','trial_runtime_portrait_animated.png',
            'trial_runtime_whistle_focus.png','trial_runtime_vendor_focus.png',
            'trial_runtime_max_zoom.png']}));
} finally {
    socket?.close();
    edge.kill();
    server.close();
}
