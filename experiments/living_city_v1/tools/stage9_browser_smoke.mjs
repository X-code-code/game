import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('build/web-mobile');
const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (name === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, data) => {
        if (error) return response.writeHead(404).end(name);
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
            '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' }[path.extname(file)] ?? 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type }).end(data);
    });
});
await new Promise(resolve => server.listen(8771, '127.0.0.1', resolve));
const debugPort = 12000 + (process.pid % 40000);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-stage9-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [];

try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
            if (tabs.some(tab => tab.type === 'page')) break;
        } catch {}
        await wait(250);
    }
    const tab = tabs?.find(item => item.type === 'page');
    if (!tab) throw new Error('Edge debugging endpoint did not start');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

    let nextId = 1;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
        } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
            errors.push(message.params.entry.text);
        }
    };
    function send(method, params = {}) {
        const id = nextId++;
        return new Promise(resolve => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
    }
    async function evaluate(expression) {
        const reply = await send('Runtime.evaluate', { expression, returnByValue: true });
        if (reply.result.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text);
        return reply.result.result.value;
    }
    const inCity = body => evaluate(`(() => {
        const canvas = cc.director.getScene().getChildByName('Canvas');
        const m = canvas.getComponent('CityManager');
        const v = m.current.view;
        ${body}
    })()`);
    async function state() {
        return evaluate(`(() => {
            if (typeof cc === 'undefined' || cc.director.getScene()?.name !== 'city') return {ready:false};
            const canvas=cc.director.getScene().getChildByName('Canvas');
            const m=canvas.getComponent('CityManager');
            if (!m?.current) return {ready:false};
            const v=m.current.view, map=m.current.root.getChildByName('TestMap');
            const camera=canvas.getChildByName('Camera')?.getComponent(cc.Camera);
            if (!camera) return {ready:false};
            const point=n=>{const p=camera.worldToScreen(n.worldPosition);
                return {name:n.name,x:p.x,y:innerHeight-p.y,active:n.activeInHierarchy};};
            const request=v.hintPanel.root.getChildByName('RequestHint');
            const hint=v.hintManager.active;
            const marker=v.hintPanel.marker;
            return {ready:true,city:m.current.content.config.cityId,modal:m.ui.isOpen,
                progress:v.progress,map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                hint,marker:{...point(marker),xLocal:marker.position.x,yLocal:marker.position.y},
                hintButton:point(request),hintRoot:point(v.hintPanel.root),
                hintMessage:v.hintPanel.message.string,taskPanelActive:v.taskPanel.active,
                entities:map.children.filter(n=>n.name!=='HintMarker').map(point),
                children:m.current.root.children.map(n=>n.name),
                hintPanels:m.current.root.children.filter(n=>n.name==='HintPanel').length,
                hintMarkers:map.children.filter(n=>n.name==='HintMarker').length,
                next:m.ui.root.getChildByName('CompletionModal').getChildByName('CompletionCard')
                    .getChildByName('NextCity')?.activeInHierarchy,
                buttons:(()=>{const list=[];const visit=n=>{if(n.getComponent('cc.Button'))list.push(point(n));n.children.forEach(visit);};visit(m.ui.root);return list;})()};
        })()`);
    }
    async function until(predicate, description) {
        let current;
        for (let i=0;i<100;i++) {
            current=await state();
            if (predicate(current)) return current;
            await wait(100);
        }
        throw new Error(`${description}: ${JSON.stringify(current)}`);
    }
    async function click(x,y) {
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
        await wait(140);
    }
    async function clickEntity(id) {
        // The preceding hint may have focused a different target outside the viewport.
        await inCity(`const e=v.node.getChildByName('TestMap').getChildByName(${JSON.stringify(id)});
            v.controller.focusAt(e.position.x,e.position.y);return true;`);
        await wait(100);
        const current=await state(), point=current.entities.find(e=>e.name===id);
        assert.ok(point,`Missing ${id}`);
        await click(point.x,point.y);
    }
    async function clickButton(name) {
        const current=await state(), point=current.buttons.find(b=>b.name===name&&b.active);
        assert.ok(point,`Missing active button ${name}`);
        await click(point.x,point.y);
    }
    async function screenshot(name) {
        await evaluate('cc.profiler.hideStats(); true');
        await wait(80);
        const reply=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(`temp/${name}.png`,Buffer.from(reply.result.data,'base64'));
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.navigate',{url:'http://127.0.0.1:8771/'});
    let current=await until(s=>s.ready,'Initial city did not load');
    assert.equal(current.city,'demo_city');
    assert.equal(current.hintPanels,1);
    assert.equal(current.hintMarkers,1);
    assert.equal(current.hint,null);
    assert.equal(current.taskPanelActive,true);
    const initialMap=current.map;

    await click(current.hintButton.x,current.hintButton.y);
    current=await state();
    assert.equal(current.hint?.targetId,'banana_01','Actual hint button did not select first required target');
    assert.equal(current.progress.requiredCompleted,0,'Hint changed task progress');
    assert.equal(current.marker.active,true);
    assert.equal(current.taskPanelActive,false);
    assert.notDeepEqual(current.map,initialMap,'Hint did not move the view toward its target');
    assert.ok(current.hintMessage.includes('找到香蕉'));
    assert.deepEqual({x:current.marker.xLocal,y:current.marker.yLocal},current.hint.position);
    const focusedMap=current.map;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:current.hintRoot.x-145,y:current.hintRoot.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:current.hintRoot.x-70,y:current.hintRoot.y-40,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:current.hintRoot.x-70,y:current.hintRoot.y-40,button:'left',clickCount:1});
    await wait(100);
    assert.deepEqual((await state()).map,focusedMap,'Hint panel leaked a map drag');
    await clickEntity('banana_01');
    current=await until(s=>s.progress.requiredCompleted===1,'Hinted target was not clickable');
    assert.equal(current.hint,null,'Found target retained an obsolete marker');
    assert.equal(current.taskPanelActive,true);
    await click(current.hintButton.x,current.hintButton.y);
    current=await state();
    assert.equal(current.hint?.targetId,'parcel_01','Hint did not move to next unfinished task');
    await wait(4200);
    current=await state();
    assert.equal(current.hint,null,'Timed hint marker remained visible');
    assert.equal(current.marker.active,false);
    assert.equal(current.taskPanelActive,true,'Task list did not return after hint expiry');

    // Replace only the task selector in this browser session to exercise the shipped moving chicken.
    await inCity(`window.stage9ReadTasks=v.hintManager.readTasks;
        v.hintManager.readTasks=()=>[{config:{id:'probe_walk',label:'找到散步的小鸡',
            type:'chickenId',targetId:'chick_blue',required:true},completed:false}];return true;`);
    current=await state();
    await click(current.hintButton.x,current.hintButton.y);
    current=await state();
    assert.equal(current.hint?.targetId,'chick_blue');
    const initialX=current.hint.position.x;
    current=await until(s=>s.hint?.targetId==='chick_blue'&&Math.abs(s.hint.position.x-initialX)>1.5,
        'Moving chicken hint did not update with live coordinates');
    assert.deepEqual({x:current.marker.xLocal,y:current.marker.yLocal},current.hint.position);
    assert.ok(current.marker.x>0&&current.marker.x<1280&&current.marker.y>0&&current.marker.y<720,
        'Moving hint marker left the viewport');
    await inCity('v.hintManager.readTasks=window.stage9ReadTasks;v.hintManager.clear();return true;');
    await wait(100);

    for (const id of ['parcel_01','key_01','chick_gray','chick_yellow']) await clickEntity(id);
    current=await until(s=>s.modal,'Required completion did not open');
    assert.equal(current.progress.requiredCompleted,5);
    assert.equal(current.hint,null);
    assert.equal(current.hintButton.active,false,'Completion did not hide hint control');
    await clickButton('NextCity');
    current=await until(s=>s.city==='harbor_test','City switch failed');
    assert.equal(current.hintPanels,1);
    assert.equal(current.hintMarkers,1);
    assert.equal(current.hint,null,'Previous city hint leaked to next city');
    assert.equal(current.progress.requiredCompleted,0);

    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await wait(800);
    current=await state();
    assert.ok(current.hintButton.x>0&&current.hintButton.x<390&&current.hintButton.y>0&&current.hintButton.y<844);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:current.hintButton.x,y:current.hintButton.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    current=await until(s=>s.hint?.targetId==='harbor_parcel','Mobile hint touch failed');
    assert.equal(current.progress.requiredCompleted,0);
    await screenshot('stage9_hint_mobile');
    await clickEntity('harbor_parcel');
    current=await until(s=>s.modal,'Harbor main task did not complete');
    await clickButton('ContinueExploring');
    current=await state();
    assert.equal(current.hintButton.active,true);
    await click(current.hintButton.x,current.hintButton.y);
    current=await state();
    assert.equal(current.hint?.targetId,'harbor_key','Hint did not select unfinished optional task');
    assert.equal(current.progress.optionalCompleted,0);
    await clickEntity('harbor_key');
    current=await until(s=>s.progress.optionalCompleted===1,'Optional target did not complete');
    await click(current.hintButton.x,current.hintButton.y);
    current=await state();
    assert.equal(current.hint,null);
    assert.ok(current.hintMessage.includes('所有目标已找到'));
    assert.deepEqual(errors,[],`Unexpected browser errors: ${errors.join(' | ')}`);
    console.log('Stage 9 browser smoke passed: hint button, required/optional selection, live moving chicken tracking, progress isolation, panel gesture blocking, expiry on discovery, city cleanup, mobile touch.');
} finally {
    socket?.close();
    edge.kill();
    await new Promise(resolve=>server.close(resolve));
}
