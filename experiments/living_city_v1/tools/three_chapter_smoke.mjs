import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Real Cocos input, sprites and persistence in an isolated disposable browser.
const root = path.resolve('build/web-mobile');
const out = path.resolve('art/review/ai_image_v4/three_chapters');
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
                cityId:city.content.config.cityId,expectedLayers:box.blueprint.artSlots.length,progress:view.progress,snapshot:view.getProgressSnapshot(),
                saved:JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))?.cities?.[city.content.config.cityId],
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
                completionText:manager.ui.summary.string,
                completionArtReady:[manager.ui.card,manager.ui.continueButton,manager.ui.nextButton,
                    manager.ui.modal.getChildByName('CompletionDimmer')].every(n=>!!n.getComponent(cc.Sprite)?.spriteFrame),
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
    const chapterIds=['living_city_street_block_01','living_city_garden_market_02','living_city_harbor_walk_03'];
    await until(s=>s.ready&&s.cityId===chapterIds[0], 'Fresh journey did not start');
    await evaluate(`(()=>{const key='chriken_living_city_v1_save_v1',d=JSON.parse(localStorage.getItem(key))??{
        version:1,currentCityId:'living_city_street_block_01',unlockedCityIds:['living_city_street_block_01'],
        completedCityIds:[],cities:{},collectibleIds:[],souvenirIds:[],
        settings:{musicEnabled:true,soundEnabled:true,vibrationEnabled:true}};
        d.currentCityId='demo_city';d.unlockedCityIds.push('demo_city');
        d.cities.demo_city={completedTaskIds:[],foundHiddenObjectIds:[],discoveredChickenIds:[],interactiveStates:{}};
        localStorage.setItem(key,JSON.stringify(d));return true;})()`);
    await send('Page.reload');
    await until(s=>s.ready&&s.cityId===chapterIds[0], 'Retired saved city did not fall back to the active journey');
    reports.retiredCityResume='active_chapter_1_with_old_progress_retained';
    reports.chapters=[];
    for(let chapter=0;chapter<chapterIds.length;chapter++) {
        const cityId=chapterIds[chapter];
        let current=await until(s=>s.ready&&s.cityId===cityId&&s.sceneLayers===s.expectedLayers&&s.ground&&
            s.npcs.length===8&&s.npcs.every(n=>n.celsReady&&!n.proceduralBody)&&
            s.targets.length===12&&s.targets.every(t=>t.loaded)&&s.stickers.every(c=>c.loaded)&&
            s.interactions.length===3&&s.interactions.every(i=>i.loaded),`${cityId}: PNG assets did not load`);
        const result={cityId,layers:current.sceneLayers,targets:12,reveals:[],collections:[]};
        assert.equal(current.progress.requiredCompleted,0,'New chapter inherited another chapter progress');
        assert.equal(current.stickers.length,12);
        assert.ok(current.stickers.every(s=>s.screen.y>780&&s.screen.y<960&&s.screen.x>0&&s.screen.x<444));
        await screenshot(`chapter_${chapter+1}_initial_444x960.png`);
        await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});
        await wait(250);current=await state();
        assert.ok(current.stickers.every(s=>s.screen.x>0&&s.screen.x<360&&s.screen.y>600&&s.screen.y<780));
        await screenshot(`chapter_${chapter+1}_initial_360x780.png`);
        await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
        await wait(200);
        await evaluate(`(()=>{${context}view.controller.viewport.zoomAt(2.25/1.4,0,0);view.controller.applyState();
            view.controller.focusAt(-390,500);return true;})()`);
        await wait(250);await screenshot(`chapter_${chapter+1}_detail_max_zoom.png`);
        await evaluate(`(()=>{${context}view.controller.viewport.zoomAt(1.4/2.25,0,0);view.controller.applyState();
            view.controller.focusAt(box.blueprint.camera.initialFocus.x,box.blueprint.camera.initialFocus.y);return true;})()`);
        current=await state();const beforeMotion=current.npcs;
        await wait(10000);current=await state();
        const moved=current.npcs.filter(n=>{const old=beforeMotion.find(o=>o.id===n.id);return Math.hypot(n.x-old.x,n.y-old.y)>10;});
        assert.ok(moved.length>=3,'Residents did not walk');result.movingResidents=moved.map(n=>n.id);
        await screenshot(`chapter_${chapter+1}_after_10_seconds.png`);
        const definitions=await evaluate(`(()=>{${context}return city.content.config.hiddenObjects;})()`);
        const firstVisible=definitions.find(t=>!t.visibleCondition).id;
        current=await focus(firstVisible);let point=current.targets.find(t=>t.id===firstVisible).screen;
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60,y:point.y+25,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+25,button:'left',clickCount:1});
        assert.equal((await state()).progress.requiredCompleted,0,'Drag collected an object');
        const concealed=definitions.filter(t=>t.visibleCondition);
        for(const target of concealed) {
            const id=target.visibleCondition.objectId;
            current=await focus(id);
            assert.equal(current.targets.find(t=>t.id===target.id).active,false);
            const prerequisite=await evaluate(`(()=>{${context}const task=view.taskManager.getTaskStates()
                .find(t=>t.config.targetId===${JSON.stringify(target.id)});return view.hintTargets.resolve(task.config)[0]?.id;})()`);
            assert.equal(prerequisite,id,'Hint failed to choose the closed reveal');
            await screenshot(`chapter_${chapter+1}_${id}_closed.png`);
            await click(current.interactions.find(i=>i.id===id).screen);
            current=await until(s=>s.interactions.find(i=>i.id===id).state==='opened'&&s.targets.find(t=>t.id===target.id).active,
                `Failed to reveal ${target.id}`);
            assert.equal(current.progress.requiredCompleted,0,'Reveal counted as pickup');
            assert.equal(current.saved.interactiveStates[id],'opened');
            await wait(250);await screenshot(`chapter_${chapter+1}_${id}_opened.png`);
            result.reveals.push({id,target:target.id,saved:true});
        }
        await send('Page.reload');
        current=await until(s=>s.ready&&s.cityId===cityId&&s.targets.every(t=>t.loaded)&&s.interactions.every(i=>i.loaded)&&s.stickers.every(c=>c.loaded),
            'Reveal save failed to reload');
        assert.ok(current.interactions.every(i=>i.state==='opened'));
        for(let index=0;index<definitions.length;index++) {
            const id=definitions[index].id;current=await focus(id);point=current.targets.find(t=>t.id===id).screen;
            assert.ok(point.y<790,`${id} under tray`);
            await click(point,0);await click(point,0);
            current=await until(s=>s.progress.requiredCompleted===index+1&&s.stickers.find(c=>c.id===id).collected&&
                s.flights===0&&s.landing===0,`${id} failed to land in tray`);
            assert.equal(current.saved.completedTaskIds.length,index+1);assert.equal(current.targets.find(t=>t.id===id).active,false);
            result.collections.push({id,saved:true});
        }
        current=await until(s=>s.completion,'Completion did not open');
        assert.equal(current.progress.allRequiredComplete,true);
        assert.equal(current.completionArtReady,true);
        assert.ok(current.completionText.includes(`第 ${chapter+1} 关 / 共 3 关`));
        await screenshot(`chapter_${chapter+1}_completed.png`);
        reports.chapters.push(result);
        await send('Page.reload');
        current=await until(s=>s.ready&&s.cityId===cityId&&s.stickers.length===12&&s.stickers.every(c=>c.collected&&c.loaded)&&s.completion,
            'Completed chapter save did not restore');
        assert.equal(current.progress.requiredCompleted,12);assert.equal(current.flights,0);
        assert.equal(current.completionArtReady,true,'Restored chapter completion PNGs did not load');
        if(chapter<2) {
            point=await evaluate(`(()=>{${context}return screen(manager.ui.nextButton);})()`);
            await click(point);
            await until(s=>s.ready&&s.cityId===chapterIds[chapter+1], 'Travel did not load next chapter',200);
        }
    }
    reports.savedJourney=await evaluate("JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))");
    assert.ok(reports.savedJourney.cities.demo_city,'Retired progress should be retained, not deleted');
    for(const id of chapterIds)assert.equal(reports.savedJourney.cities[id].completedTaskIds.length,12);
    assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(failedRequests,[]);
    reports.status='passed';reports.totalUniqueCollected=36;reports.totalReveals=9;
    reports.runtimeErrors=errors;reports.runtimeWarnings=warnings;reports.failedRequests=failedRequests;
    reports.wechatPhone='not_run';
    fs.writeFileSync(path.join(out,'runtime_report.json'),JSON.stringify(reports,null,2)+'\n');
    console.log(JSON.stringify({status:'passed',chapters:3,uniqueTargets:36,reveals:9,report:path.join(out,'runtime_report.json')}));
} catch(error) {
    fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,errors,warnings,failedRequests,reports},null,2)+'\n');
    throw error;
} finally {
    socket?.close();server.close();
    const closed=new Promise(resolve=>{edge.once('close',resolve);setTimeout(resolve,5000);});
    edge.kill();await closed;
    assert.equal(path.dirname(profile),tempRoot);
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:6,retryDelay:250});
}
