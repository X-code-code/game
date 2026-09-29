import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Verify the built game, not just the source assets or the Creator import cache.
const root = path.resolve('build/web-mobile');
const screenshotPath = path.resolve('temp/art_prototype_demo.png');
const mobileScreenshotPath = path.resolve('temp/art_prototype_demo_mobile.png');
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (name === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, data) => {
        if (error) return response.writeHead(404).end(name);
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
            '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
            '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] ?? 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type }).end(data);
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 12000 + (process.pid % 40000);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-art-prototype-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [];
const failedRequests = [];

try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`,
                { signal: AbortSignal.timeout(1000) })).json();
            if (tabs.some(tab => tab.type === 'page')) break;
        } catch {}
        await wait(250);
    }
    const tab = tabs?.find(item => item.type === 'page');
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
            if (type === 'error' || (type === 'warning' && value.includes('Prototype art unavailable'))) errors.push(value);
        } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
            errors.push(message.params.entry.text);
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
            const canvas = cc.director.getScene().getChildByName('Canvas');
            const manager = canvas?.getComponent('CityManager');
            if (!manager?.current) return {ready:false};
            const city = manager.current, map = city.root.getChildByName('TestMap');
            const camera = canvas.getChildByName('Camera')?.getComponent(cc.Camera);
            if (!map || !camera) return {ready:false};
            const point = n => {if(!n)return null;const p=camera.worldToScreen(n.worldPosition);
                return {x:p.x,y:innerHeight-p.y};};
            const spriteInfo = n => {
                const s=n?.getComponent(cc.Sprite),g=n?.getComponent(cc.Graphics);
                return {sprite:!!s?.spriteFrame,frame:s?.spriteFrame?.name ?? null,graphicsEnabled:g?.enabled ?? null,
                    active:n?.activeInHierarchy ?? false};
            };
            const props = Object.fromEntries(['banana_01','parcel_01','key_01'].map(id => {
                const n=map.getChildByName(id);
                return [id,{...spriteInfo(n?.getChildByName('PropArt')),
                    graphicsEnabled:n?.getComponent(cc.Graphics)?.enabled ?? null}];
            }));
            const chickens = Object.fromEntries(['chick_yellow','chick_blue','chick_pink','chick_gray'].map(id => {
                const n=map.getChildByName(id),appearance=n?.getChildByName('VisualRoot');
                const character=n?.getComponent('ChickenCharacter');
                return [id,{...spriteInfo(appearance),bodyActive:appearance?.getChildByName('Body')?.active ?? null,
                    headActive:appearance?.getChildByName('Head')?.active ?? null,
                    x:n?.position.x ?? null,y:appearance?.position.y ?? null,
                    angle:appearance?.eulerAngles.z ?? null,scaleY:appearance?.scale.y ?? null,
                    actionReady:!!character?.actionSkinFrame}];
            }));
            return {ready:true,city:city.content.config.cityId,
                ambient:{active:map.getChildByName('CityAmbientLife')?.activeInHierarchy ?? false,
                    elapsed:map.getChildByName('CityAmbientLife')?.getComponent('CityAmbientLife')?.elapsed ?? 0},
                background:{...spriteInfo(map.getChildByName('MapBackgroundArt')),
                    graphicsEnabled:map.getComponent(cc.Graphics)?.enabled ?? null},props,chickens,
                progress:city.view.progress,map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                hint:city.view.hintManager?.active ?? null,
                hintButton:point(city.view.hintPanel?.root.getChildByName('RequestHint')),
                taskPanelActive:city.view.taskPanel?.activeInHierarchy ?? false,
                modal:manager.ui.isOpen,
                entities:Object.fromEntries(['banana_01','parcel_01','key_01','chick_yellow','chick_blue','chick_gray']
                    .map(id=>[id,point(map.getChildByName(id))])),
                nextButton:(()=>{const card=manager.ui.root.getChildByName('CompletionModal')
                    .getChildByName('CompletionCard');const n=card.getChildByName('NextCity');
                    return {active:n?.activeInHierarchy ?? false,...(n?point(n):{})};})()};
        })()`);
    }
    async function until(predicate, description) {
        let current;
        for (let i = 0; i < 120; i++) {
            current = await state();
            if (predicate(current)) return current;
            await wait(100);
        }
        throw new Error(`${description}: ${JSON.stringify({current,errors,failedRequests})}`);
    }
    async function click(x, y) {
        await send('Input.dispatchMouseEvent', {type:'mousePressed',x,y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent', {type:'mouseReleased',x,y,button:'left',clickCount:1});
        await wait(140);
    }
    async function clickEntity(id) {
        await evaluate(`(() => {const m=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
            const n=m.current.root.getChildByName('TestMap').getChildByName(${JSON.stringify(id)});
            m.current.view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
        await wait(100);
        const p=(await state()).entities[id];
        assert.ok(p, `Missing ${id}`);
        await click(p.x,p.y);
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Page.navigate', {url:`http://127.0.0.1:${port}/`});
    let current=await until(s=>s.ready && s.background.sprite &&
        Object.values(s.props).every(p=>p.sprite) && Object.values(s.chickens).every(c=>c.sprite) &&
        ['chick_yellow','chick_blue','chick_pink'].every(id=>s.chickens[id].actionReady),
        'Demo city art did not load');
    assert.equal(current.city,'demo_city');
    assert.equal(current.background.graphicsEnabled,false,'Grid fallback is still rendering');
    for (const [id, prop] of Object.entries(current.props)) {
        assert.equal(prop.graphicsEnabled,false,`${id} fallback is still rendering`);
        assert.equal(prop.active,true,`${id} is not visible`);
    }
    for (const [id, chicken] of Object.entries(current.chickens)) {
        assert.equal(chicken.bodyActive,false,`${id} drawn body still active`);
        assert.equal(chicken.headActive,false,`${id} drawn head still active`);
        assert.equal(chicken.active,true,`${id} is not visible`);
    }
    assert.equal(current.ambient.active,true,'Ambient scene motion did not activate');
    assert.equal(current.chickens.chick_gray.frame,'chicken_gray_v2','Sleeping chick cast art did not load');
    const motionSamples=[current];
    let savedPeck=false;
    let savedBlink=false;
    for (let sample=0;sample<120;sample++) {
        await wait(45);
        const sampleState=await state();
        motionSamples.push(sampleState);
        if (!savedPeck && sampleState.chickens.chick_pink.frame==='chicken_pink_peck_v2') {
            const shot=await send('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(path.resolve('temp/cast_v2_peck.png'),Buffer.from(shot.result.data,'base64'));
            savedPeck=true;
        }
        if (!savedBlink && sampleState.chickens.chick_yellow.frame==='chicken_yellow_blink_v2') {
            const shot=await send('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(path.resolve('temp/cast_v2_blink.png'),Buffer.from(shot.result.data,'base64'));
            savedBlink=true;
        }
    }
    const spread=(id,key)=>{
        const values=motionSamples.map(s=>s.chickens[id][key]);
        return Math.max(...values)-Math.min(...values);
    };
    assert.ok(spread('chick_blue','x')>20,'Walking chick is not travelling');
    const frames=id=>new Set(motionSamples.map(s=>s.chickens[id].frame));
    console.log(`Observed frames: ${JSON.stringify({yellow:[...frames('chick_yellow')],
        blue:[...frames('chick_blue')],pink:[...frames('chick_pink')]})}`);
    assert.ok(frames('chick_pink').has('chicken_pink_peck_v2') && frames('chick_pink').has('chicken_pink_v2'),
        'Pecking chick action frame did not alternate');
    assert.ok(frames('chick_blue').has('chicken_blue_walk_v2') && frames('chick_blue').has('chicken_blue_v2'),
        'Walking chick step frame did not alternate');
    assert.ok(frames('chick_yellow').has('chicken_yellow_blink_v2') && frames('chick_yellow').has('chicken_yellow_v2'),
        'Idle chick blink frame did not alternate');
    assert.ok(spread('chick_gray','scaleY')>0.05,'Sleeping chick does not breathe');
    assert.ok(spread('chick_yellow','angle')>1,'Idle chick has no body motion');
    assert.ok(motionSamples.at(-1).ambient.elapsed>motionSamples[0].ambient.elapsed+1,
        'City ambient animation clock did not advance');
    console.log(`Motion diagnostics: ${JSON.stringify({walkX:spread('chick_blue','x'),
        blueFrames:[...frames('chick_blue')],pinkFrames:[...frames('chick_pink')],yellowFrames:[...frames('chick_yellow')],
        sleepScaleY:spread('chick_gray','scaleY'),idleAngle:spread('chick_yellow','angle'),
        ambientSeconds:motionSamples.at(-1).ambient.elapsed-motionSamples[0].ambient.elapsed,
        screenshots:{peck:savedPeck,blink:savedBlink}})}`);
    const renderDiagnostics = await evaluate(`(() => {
        const canvas=cc.director.getScene().getChildByName('Canvas');
        const map=canvas.getComponent('CityManager').current.root.getChildByName('TestMap');
        const describe=n=>{const s=n.getComponent(cc.Sprite),g=n.getComponent(cc.Graphics),
            t=n.components.find(c=>c.constructor.name==='UITransform'),f=s?.spriteFrame,texture=f?.texture;
            return {name:n.name,active:n.activeInHierarchy,size:t?{w:t.width,h:t.height}:null,
                sprite:{enabled:s?.enabled,color:s?.color?{r:s.color.r,g:s.color.g,b:s.color.b,a:s.color.a}:null,
                    frame:f?.name,frameValid:f?.isValid,textureValid:texture?.isValid,
                    textureSize:texture?{w:texture.width,h:texture.height}:null},
                graphics:{enabled:g?.enabled},components:n.components.map(c=>c.constructor.name)};};
        const gl=cc.game.canvas.getContext('webgl2')??cc.game.canvas.getContext('webgl');
        return {background:{parent:describe(map),art:describe(map.getChildByName('MapBackgroundArt'))},
            props:['banana_01','parcel_01','key_01']
                .map(id=>({parent:describe(map.getChildByName(id)),
                    art:describe(map.getChildByName(id).getChildByName('PropArt'))})),
            chicken:describe(map.getChildByName('chick_yellow').getChildByName('VisualRoot')),
            webgl:{maxTextureSize:gl?.getParameter(gl.MAX_TEXTURE_SIZE),error:gl?.getError()}};
    })()`);
    console.log(`Render diagnostics: ${JSON.stringify(renderDiagnostics)}`);
    await wait(300);
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(screenshotPath,Buffer.from(screenshot.result.data,'base64'));
    const imageSamples=await evaluate(`(async()=>{
        const img=new Image();img.src='data:image/png;base64,${screenshot.result.data}';await img.decode();
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
        const g=c.getContext('2d');g.drawImage(img,0,0);
        const points=[[1000,100],[1050,250],[1000,400],[1050,600]];
        return points.map(([x,y])=>Array.from(g.getImageData(x,y,1,1).data));
    })()`);
    console.log(`Screenshot samples: ${JSON.stringify(imageSamples)}`);
    assert.ok(imageSamples.filter(color=>color[0]+color[1]+color[2]>90).length>=3,
        'Rendered map remains black despite SpriteFrame assignment');

    // Mobile portrait: verify the same art and game gestures in the layout used on a phone.
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Page.reload',{ignoreCache:false});
    await wait(800);
    current=await until(s=>s.ready && s.city==='demo_city' && s.background.sprite &&
        Object.values(s.props).every(p=>p.sprite) && Object.values(s.chickens).every(c=>c.sprite),
        'Portrait demo art did not reload');
    assert.equal(current.city,'demo_city');
    assert.equal(current.background.sprite,true);
    assert.equal(current.background.graphicsEnabled,false);
    assert.ok(Object.values(current.props).every(p=>p.sprite));
    assert.ok(Object.values(current.chickens).every(c=>c.sprite));
    const mobileScreenshot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(mobileScreenshotPath,Buffer.from(mobileScreenshot.result.data,'base64'));
    const mobileSamples=await evaluate(`(async()=>{
        const img=new Image();img.src='data:image/png;base64,${mobileScreenshot.result.data}';await img.decode();
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
        const g=c.getContext('2d');g.drawImage(img,0,0);
        return [[370,110],[370,330],[370,580],[370,800]].map(([x,y])=>
            Array.from(g.getImageData(x,y,1,1).data));
    })()`);
    console.log(`Mobile screenshot samples: ${JSON.stringify(mobileSamples)}`);
    assert.ok(mobileSamples.filter(color=>color[0]+color[1]+color[2]>90).length>=3,
        'Rendered portrait map remains black');
    assert.ok(current.hintButton?.x>0 && current.hintButton.x<390 &&
        current.hintButton.y>0 && current.hintButton.y<844,'Portrait hint button is offscreen');
    const tap=async(x,y)=>{
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await wait(140);
    };
    await tap(current.hintButton.x,current.hintButton.y);
    current=await until(s=>s.hint?.targetId==='banana_01','Portrait hint touch failed');
    assert.equal(current.taskPanelActive,false,'Task panel did not uncover hinted target');
    const mobileEntity=current.entities.banana_01;
    await tap(mobileEntity.x,mobileEntity.y);
    current=await until(s=>s.progress.requiredCompleted===1,'Portrait target touch failed');
    const mobileBeforeGesture=current.map;
    const mobileGestureDebug=()=>evaluate(`(() => {const v=cc.director.getScene().getChildByName('Canvas')
        .getComponent('CityManager').current.view;
        return {controllerTouches:Array.from(v.controller.touches.entries()),
            targetTouches:Array.from(v.targetInput.touches.entries()),
            mouseDragging:v.controller.mouseDragging,map:{x:v.node.getChildByName('TestMap').position.x,
                y:v.node.getChildByName('TestMap').position.y,scale:v.node.getChildByName('TestMap').scale.x}};})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:350,y:430}]});
    console.log(`Mobile touch start: ${JSON.stringify(await mobileGestureDebug())}`);
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:350,y:330}]});
    console.log(`Mobile touch move: ${JSON.stringify(await mobileGestureDebug())}`);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await wait(100);
    let mobileAfterDrag=(await state()).map;
    if (mobileAfterDrag.x===mobileBeforeGesture.x && mobileAfterDrag.y===mobileBeforeGesture.y) {
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:350,y:330}]});
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:350,y:470}]});
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await wait(100);
        mobileAfterDrag=(await state()).map;
    }
    console.log(`Mobile drag: ${JSON.stringify({before:mobileBeforeGesture,after:mobileAfterDrag})}`);
    assert.ok(mobileAfterDrag.x!==mobileBeforeGesture.x || mobileAfterDrag.y!==mobileBeforeGesture.y,
        'Portrait map drag did not move');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:330},{x:240,y:330}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130,y:310},{x:260,y:350}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await wait(100);
    current=await state();
    assert.notEqual(current.map.scale,mobileAfterDrag.scale,'Portrait pinch zoom did not change scale');
    assert.equal(current.progress.requiredCompleted,1,'Portrait gesture added task progress');
    await send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Page.reload',{ignoreCache:false});
    current=await until(s=>s.ready && s.city==='demo_city' && s.background.sprite &&
        Object.values(s.props).every(p=>p.sprite) && Object.values(s.chickens).every(c=>c.sprite),
        'Desktop demo did not reload after mobile test');

    await clickEntity('banana_01');
    current=await until(s=>s.progress.requiredCompleted===1,'Prototype banana was not clickable');
    const beforeGesture=current.map;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:1080,y:550,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1150,y:590,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1150,y:590,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1070,y:450,deltaY:-100,deltaX:0});
    await wait(180);
    current=await state();
    assert.ok(current.map.x!==beforeGesture.x || current.map.y!==beforeGesture.y,'Map drag did not move');
    assert.notEqual(current.map.scale,beforeGesture.scale,'Map wheel zoom did not change scale');
    assert.equal(current.progress.requiredCompleted,1,'Gesture added task progress');

    for (const id of ['parcel_01','key_01','chick_gray','chick_yellow']) await clickEntity(id);
    current=await until(s=>s.modal && s.progress.requiredCompleted===5,'Demo tasks did not complete');
    assert.equal(current.nextButton.active,true,'Next City button is not available');
    await click(current.nextButton.x,current.nextButton.y);
    current=await until(s=>s.city==='harbor_test' && s.background.sprite,'Harbor art did not load');
    assert.equal(current.background.graphicsEnabled,false,'Harbor grid fallback is still rendering');
    assert.deepEqual(errors,[],`Unexpected browser errors: ${errors.join(' | ')}`);
    assert.deepEqual(failedRequests,[],`Failed asset requests: ${failedRequests.join(' | ')}`);
    console.log(JSON.stringify({pass:true,demo:{background:true,props:3,chickens:4,gridDisabled:true,
        bananaClick:true,dragAndZoom:true},mobile:{size:'390x844',background:true,
        targetTouch:true,drag:true,pinchZoom:true},harbor:{background:true,gridDisabled:true},
        screenshots:[screenshotPath,mobileScreenshotPath],errors:errors.length,
        failedRequests:failedRequests.length}));
} finally {
    socket?.close();
    edge.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
