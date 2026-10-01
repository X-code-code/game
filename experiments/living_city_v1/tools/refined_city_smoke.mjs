import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Real Cocos input, sprites and persistence in an isolated disposable browser.
const root = path.resolve('build/web-mobile');
const out = path.resolve(process.env.LIVING_CITY_SMOKE_OUT ?? 'art/review/refined_city_v2');
const tempRoot = path.resolve('temp');
const profile = path.resolve(tempRoot, `edge-refined-${process.pid}`);
assert.ok(profile.startsWith(`${tempRoot}${path.sep}`));
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
        if (error) return response.writeHead(404).end();
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(bytes);
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 12000 + process.pid % 40000;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--window-size=444,960',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], warnings = [], failedRequests = [];
let socket;
const reports = {};
try {
    let tab;
    for (let i = 0; i < 60 && !tab; i++) {
        try {
            const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`,
                { signal: AbortSignal.timeout(1000) })).json();
            tab = tabs.find(item => item.type === 'page');
        } catch {}
        if (!tab) await wait(250);
    }
    assert.ok(tab, 'Edge debugging endpoint did not start');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 1;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message); pending.delete(message.id);
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled') {
            const value = message.params.args.map(arg => arg.value ?? arg.description).join(' ');
            if (message.params.type === 'error') errors.push(value);
            if (['warn', 'warning'].includes(message.params.type)) warnings.push(value);
        } else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
            failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
        } else if (message.method === 'Network.loadingFailed') failedRequests.push(message.params.errorText);
    };
    function send(method, params = {}) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 15000);
            pending.set(id, reply => { clearTimeout(timer); reply.error ? reject(new Error(JSON.stringify(reply.error))) : resolve(reply.result); });
            socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async function evaluate(expression) {
        const reply = await send('Runtime.evaluate', { expression, returnByValue: true });
        if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
        return reply.result.value;
    }
    async function screenshot(name) {
        const response = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, name), Buffer.from(response.data, 'base64'));
    }
    const context = `const canvas=cc.director.getScene().getChildByName('Canvas');
        const manager=canvas.getComponent('CityManager'),city=manager.current,view=city.view;
        const map=city.root.getChildByName('TestMap'),box=view.livingGreybox;
        const camera=canvas.getChildByName('Camera').getComponent(cc.Camera);
        const search=(node,name)=>node.name===name?node:node.children.map(child=>search(child,name)).find(Boolean);
        const screen=node=>{const p=camera.worldToScreen(node.worldPosition);return {x:p.x,y:innerHeight-p.y};};
        const count=(node,p)=>Number(p(node))+node.children.reduce((n,c)=>n+count(c,p),0);`;
    async function state() {
        return evaluate(`(() => {
            if(typeof cc==='undefined'||cc.director.getScene()?.name!=='city')return {ready:false};
            ${context}
            if(!box?.blueprint)return {ready:false};
            return {ready:true,viewport:{width:innerWidth,height:innerHeight},
                progress:view.progress,snapshot:view.getProgressSnapshot(),
                saved:JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))?.cities?.living_city_street_block_01,
                map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                sceneLayers:count(map,n=>n.name.startsWith('lc_')&&n.name.endsWith('_art')),
                ground:box.artGroundLoaded,messengerCels:box.npcs.find(n=>n.plan.id==='messenger_customer')?.cels?.isReady,
                npcs:box.npcs.map(n=>({id:n.plan.id,x:n.node.position.x,y:n.node.position.y,
                    celsReady:!!n.cels?.isReady,proceduralBody:!!n.node.getComponent(cc.Graphics)?.enabled,
                    celClip:n.cels?.currentClip,celFrame:n.cels?.frameIndex})),eventCompleted:box.eventCompleted,
                targets:city.content.config.hiddenObjects.map(c=>{const n=search(map,c.id),art=n?.getChildByName('PropArt');
                    return {id:c.id,active:n?.activeInHierarchy,screen:n?screen(n):null,
                        loaded:!!art?.getComponent(cc.Sprite)?.spriteFrame};}),
                interactions:[...view.interactions].map(([id,i])=>({id,state:i.state,screen:screen(i.node),
                    loaded:!!i.node.getComponent(cc.Sprite)?.spriteFrame})),
                stickers:[...view.stickerCards].map(([id,c])=>({id,screen:screen(c.node),loaded:!!c.icon.spriteFrame,
                    collected:c.collected,alpha:c.icon.color.a})),
                clue:view.stickerClueLabel?.string,title:view.taskTitleLabel?.string,
                flights:view.collectionFlights.size,landing:view.collectionLandingAnimations,completion:manager.ui.isOpen,
                hint:view.hintManager?.active?{id:view.hintManager.active.id,kind:view.hintManager.active.kind}:null,
                proof:window.__lastLandingProof??null};
        })()`);
    }
    async function until(predicate, description, attempts = 120) {
        let current;
        for(let i=0;i<attempts;i++) {current=await state();if(predicate(current))return current;await wait(100);}
        throw new Error(`${description}: ${JSON.stringify({current,errors,warnings,failedRequests})}`);
    }
    async function click(point, settle = 100) {
        assert.ok(point.x>0&&point.x<444&&point.y>0&&point.y<960,JSON.stringify(point));
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        if(settle)await wait(settle);
    }
    async function focus(id) {
        await evaluate(`(()=>{${context}const n=search(map,${JSON.stringify(id)});
            view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
        await wait(100);
        return state();
    }
    await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    let current=await until(s=>s.ready&&s.sceneLayers===44&&s.ground&&s.messengerCels&&
        (!process.env.LIVING_CITY_GENERATED_CHARACTERS || s.npcs.every(n=>n.celsReady&&!n.proceduralBody))&&
        s.targets.length===12&&s.targets.every(t=>t.loaded)&&s.stickers.every(c=>c.loaded)&&
        s.interactions.length===3&&s.interactions.every(i=>i.loaded),'All refined sprites did not load');
    await evaluate('cc.profiler?.hideStats?.();true');
    assert.equal(current.progress.requiredTotal,12); assert.equal(current.progress.requiredCompleted,0);
    assert.equal(current.npcs.length,8);
    assert.ok(current.stickers.every(s=>s.screen.y>780&&s.screen.y<940&&s.screen.x>0&&s.screen.x<444),
        `Sticker rows outside tray: ${JSON.stringify(current.stickers)}`);
    assert.ok(current.stickers.every(s=>!s.collected&&s.alpha<255));
    const concealed=['sealed_letter','seed_packet','golden_bun'];
    assert.ok(current.targets.filter(t=>concealed.includes(t.id)).every(t=>!t.active));
    reports.initial=current;
    await screenshot('initial_444x960.png');
    await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});
    await wait(250);
    current=await state();
    assert.ok(current.stickers.every(s=>s.screen.x>0&&s.screen.x<360&&s.screen.y>600&&s.screen.y<780),
        'Sticker rows left the smaller phone viewport');
    await screenshot('initial_360x780.png');
    reports.smallPhone={width:360,height:780,visibleStickers:current.stickers.length};
    await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
    await wait(200); current=await state();
    if (process.env.LIVING_CITY_CAPTURE_DETAILS === '1') {
        const scale=current.map.scale;
        await evaluate(`(()=>{${context}view.controller.viewport.zoomAt(2.25/1.4,0,0);
            view.controller.applyState();view.controller.focusAt(-400,350);return true;})()`);
        await wait(200);
        const detail=await state();
        assert.ok(Math.abs(detail.map.scale/scale-2.25/1.4)<.02,'Maximum detail zoom was not reached');
        await screenshot('tea_detail_max_zoom_444x960.png');
        reports.detailZoom={zoom:2.25,scaleRatio:detail.map.scale/scale};
        await evaluate(`(()=>{${context}view.controller.viewport.zoomAt(1.4/2.25,0,0);
            view.controller.applyState();view.controller.focusAt(-230,20);return true;})()`);
        await wait(150); current=await state();
        assert.ok(Math.abs(current.map.scale/scale-1)<.02,'Detail zoom failed to restore');
    }
    await click(current.stickers.find(s=>s.id==='seed_packet').screen);
    assert.ok((await state()).clue.includes('种子'));
    const start=current.npcs;
    await wait(10000);
    current=await state();
    const moving=start.filter(n=>Math.hypot(n.x-current.npcs.find(c=>c.id===n.id).x,n.y-current.npcs.find(c=>c.id===n.id).y)>20);
    assert.ok(moving.length>=3,'Ambient residents did not move');
    reports.motion={durationSeconds:10,moved: moving.map(n=>n.id)};
    await screenshot('after_10_seconds_444x960.png');
    current=await focus('tea_clay_whistle');
    let point=current.targets.find(t=>t.id==='tea_clay_whistle').screen;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60,y:point.y+25,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+25,button:'left',clickCount:1});
    assert.equal((await state()).progress.requiredCompleted,0,'Dragging collected a target');
    reports.reveals=[];
    reports.prerequisites=await evaluate(`(()=>{${context}return city.content.config.hiddenObjects
        .filter(t=>t.visibleCondition).map(t=>{const task=view.taskManager.getTaskStates().find(s=>s.config.targetId===t.id);
            const resolved=task?view.hintTargets.resolve(task.config)[0]:null;
            return {id:t.id,resolved:resolved?.id,expected:t.visibleCondition.objectId};});})()`);
    assert.ok(reports.prerequisites.every(p=>p.resolved===p.expected),'Hidden-item hint did not resolve to its reveal');
    for(const [interaction,target] of [['parcel_chest','sealed_letter'],['flower_leaves','seed_packet'],['bun_lid','golden_bun']]) {
        current=await focus(interaction);
        const before=current.progress.requiredCompleted;
        assert.equal(current.targets.find(t=>t.id===target).active,false);
        await screenshot(`${interaction}_closed_444x960.png`);
        await click(current.interactions.find(i=>i.id===interaction).screen);
        current=await until(s=>s.interactions.find(i=>i.id===interaction).state==='opened'&&s.targets.find(t=>t.id===target).active,
            `${interaction} did not reveal ${target}`);
        assert.equal(current.progress.requiredCompleted,before,'Opening counted as collection');
        assert.equal(current.saved.interactiveStates[interaction],'opened');
        await wait(200); await screenshot(`${interaction}_opened_444x960.png`);
        if(interaction==='parcel_chest') {
            await send('Page.reload');
            current=await until(s=>s.ready&&s.interactions.find(i=>i.id===interaction)?.loaded&&s.targets.every(t=>t.loaded),
                'Reload after reveal failed');
            assert.equal(current.interactions.find(i=>i.id===interaction).state,'opened');
            assert.equal(current.targets.find(t=>t.id===target).active,true);
            assert.equal(current.progress.requiredCompleted,0);
        }
        reports.reveals.push({interaction,target,revealed:true,saved:true});
    }
    reports.collections=[];
    const ids=current.targets.map(t=>t.id);
    for(let index=0;index<ids.length;index++) {
        const id=ids[index]; current=await focus(id);
        point=current.targets.find(t=>t.id===id).screen;
        assert.ok(point.y<790,`${id} covered by tray`);
        if(index===ids.length-1) await evaluate(`(()=>{${context}
            const proof=window.__lastLandingProof={samples:[],done:false};let frames=0;
            const read=()=>{proof.samples.push({flights:view.collectionFlights.size,landing:view.collectionLandingAnimations,
                completion:manager.ui.isOpen,collected:view.stickerCards.get(${JSON.stringify(id)}).collected});
                if(manager.ui.isOpen||++frames>600){proof.done=true;return;}requestAnimationFrame(read);};
            requestAnimationFrame(read);return true;})()`);
        await click(point,0); await click(point,0);
        current=await until(s=>s.progress.requiredCompleted===index+1&&s.stickers.find(c=>c.id===id).collected&&
            s.flights===0&&s.landing===0,`${id} did not land in sticker tray`);
        assert.equal(current.saved.completedTaskIds.length,index+1);
        assert.equal(current.targets.find(t=>t.id===id).active,false);
        assert.equal(current.stickers.find(s=>s.id===id).alpha,255);
        await click(point);
        assert.equal((await state()).progress.requiredCompleted,index+1,'Duplicate pickup counted twice');
        reports.collections.push({id,collected:true,saved:true});
    }
    current=await until(s=>s.completion&&s.proof?.done,'Final completion did not open');
    const samples=current.proof.samples;
    assert.ok(samples.some(s=>s.flights>0),'Final flight was never observed');
    assert.ok(samples.every(s=>!(s.flights>0||s.landing>0)||!s.completion),'Completion covered collection animation');
    assert.equal(current.progress.allRequiredComplete,true);
    assert.equal(current.eventCompleted,true,'Tea handoff did not finish during play');
    await screenshot('completed_444x960.png');
    reports.completion=current;
    await send('Page.reload');
    current=await until(s=>s.ready&&s.stickers.length===12&&s.stickers.every(c=>c.collected&&c.loaded)&&s.sceneLayers===44,
        'Completed collection failed to restore');
    assert.equal(current.progress.requiredCompleted,12);
    assert.equal(current.flights,0);
    assert.ok(current.targets.every(t=>!t.active));
    assert.ok(current.interactions.every(i=>i.state==='opened'));
    reports.restored={collected:12,opened:3,noRepeatedFlights:true};
    assert.deepEqual(errors,[]); assert.deepEqual(failedRequests,[]);
    reports.runtimeErrors=errors; reports.runtimeWarnings=warnings; reports.failedRequests=failedRequests;
    reports.status='passed'; reports.wechatPhone='not_run';
    fs.writeFileSync(path.join(out,'runtime_report.json'),JSON.stringify(reports,null,2)+'\n');
    console.log(JSON.stringify({status:'passed',sceneLayers:44,targets:12,reveals:3,errors:errors.length,
        warnings: warnings.length,failedRequests:failedRequests.length,report:path.join(out,'runtime_report.json')}));
} catch(error) {
    fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,errors,warnings,failedRequests,reports},null,2)+'\n');
    throw error;
} finally {
    socket?.close(); server.close();
    const closed=new Promise(resolve=>{edge.once('close',resolve);setTimeout(resolve,5000);});
    edge.kill(); await closed;
    assert.equal(path.dirname(profile),tempRoot);
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:6,retryDelay:250});
}
