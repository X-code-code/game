import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('build/web-mobile');
const city = JSON.parse(fs.readFileSync('assets/bundles/city_demo/city.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('assets/resources/configs/city_catalog.json', 'utf8'));
const catalogEntry = catalog.cities.find(entry => entry.cityId === city.cityId);
assert.equal(catalog.initialCityId, city.cityId);
assert.ok(catalogEntry?.bundleName, `No Bundle in city catalog for ${city.cityId}`);
assert.equal(city.tasks.filter(task => task.required).length, 5, 'Stage 7 Demo should have five required tasks');

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

await new Promise(resolve => server.listen(8770, '127.0.0.1', resolve));
const debugPort = 12000 + (process.pid % 40000);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-stage8-${process.pid}`)}`, 'about:blank',
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
        ${body}
    })()`);
    async function state() {
        return evaluate(`(() => {
            if (typeof cc === 'undefined' || cc.director.getScene()?.name !== 'city') return {ready:false};
            const canvas = cc.director.getScene().getChildByName('Canvas');
            const m = canvas.getComponent('CityManager');
            if (!m?.current) return {ready:false};
            const v = m.current.view, map = m.current.root.getChildByName('TestMap');
            const cameraNode = canvas.getChildByName('Camera');
            if (!cameraNode) return {ready:false, cameraMissing:true, children:canvas.children.map(n=>({name:n.name,valid:n.isValid})),
                city:m.current.content.config.cityId, root:m.current.root.name,rootValid:m.current.root.isValid};
            const camera = cameraNode.getComponent(cc.Camera);
            const point = n => {
                const p = camera.worldToScreen(n.worldPosition);
                return {name:n.name,x:p.x,y:innerHeight-p.y,active:n.activeInHierarchy};
            };
            const buttons = [];
            const visit = n => { if (n.getComponent('cc.Button')) buttons.push(point(n)); n.children.forEach(visit); };
            visit(m.ui.root);
            return {ready:true,city:m.current.content.config.cityId,modal:m.ui.isOpen,loading:m.loading,failed:m.failed,
                progress:v.progress,discoveries:v.discoveries,tasks:v.taskManager.getTaskStates(),
                roots:canvas.children.filter(n=>n.name==='CityContent').length,
                map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                entities:map.children.map(point),buttons,
                bundles:['city_demo','city_harbor_test'].filter(n=>cc.assetManager.getBundle(n)),
                summary:m.ui.summary.string,message:m.ui.message.string};
        })()`);
    }
    async function until(predicate, description) {
        let s;
        for (let i=0;i<100;i++) {
            s=await state();
            if(predicate(s)) return s;
            await wait(100);
        }
        throw new Error(`${description}: ${JSON.stringify(s)}`);
    }
    async function click(x,y) {
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
        await wait(160);
    }
    async function button(name) {
        const s=await state(), target=s.buttons.find(b=>b.name===name&&b.active);
        assert.ok(target,`Missing active button ${name}: ${JSON.stringify(s)}`);
        await click(target.x,target.y);
    }
    async function target(id) {
        const s=await state(), e=s.entities.find(e=>e.name===id);
        assert.ok(e,`Missing entity ${id}`);
        await click(e.x,e.y);
    }
    async function screenshot(name) {
        await evaluate('cc.profiler.hideStats(); true');
        await wait(80);
        const result=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(`temp/${name}.png`,Buffer.from(result.result.data,'base64'));
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.navigate',{url:'http://127.0.0.1:8770/'});
    let s=await until(s=>s.ready,'Initial city did not load');
    assert.equal(s.city,'demo_city');
    assert.equal(s.modal,false);
    assert.deepEqual(s.bundles,['city_demo'],'Next city was loaded too early');
    await inCity('void m.goNext(); return true;');
    await wait(100);
    assert.equal((await state()).city,'demo_city','Incomplete city allowed travel');
    for(const id of ['banana_01','parcel_01','key_01','chick_gray','chick_yellow']) await target(id);
    s=await until(s=>s.modal,'Completing 5/5 did not open completion');
    assert.equal(s.city,'demo_city');
    assert.equal(s.progress.requiredCompleted,5);
    assert.deepEqual(s.discoveries,{chickens:2,objects:3});
    await screenshot('stage8_completion_desktop');
    const completedTasks=s.tasks, completedMap=s.map;
    await click(1100,400);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:1100,y:400,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1150,y:450,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:1150,y:450,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1100,y:400,deltaY:-100,deltaX:0});
    await wait(100);
    assert.deepEqual((await state()).map,completedMap,'Modal leaked map navigation');
    await button('ContinueExploring');
    s=await state();
    assert.equal(s.modal,false,'Continue button did not dismiss modal');
    assert.deepEqual(s.tasks,completedTasks,'Continue reset progress');
    await target('chick_yellow');
    assert.equal((await state()).discoveries.chickens,2,'Repeated chicken counted twice');
    await target('chick_blue');
    s=await state();
    assert.equal(s.modal,false,'Non-task click reopened completion');
    assert.equal(s.discoveries.chickens,3);
    await button('OpenCompletion');

    // Engine load callback failure: current city stays live, and failed reservations are removed.
    await inCity(`const original=cc.assetManager.loadBundle;
        window.stage8BundleLoad=original;
        cc.assetManager.loadBundle=function(name,...args) {
            if(name==='city_harbor_test') { cc.assetManager.loadBundle=original;
                args[args.length-1](new Error('stage8 injected bundle failure'),null); return; }
            return original.call(this,name,...args);
        }; return true;`);
    await button('NextCity');
    s=await until(s=>s.failed,'Load failure did not offer retry');
    assert.equal(s.city,'demo_city');
    assert.deepEqual(s.tasks,completedTasks);
    assert.deepEqual(s.bundles,['city_demo']);
    assert.ok(s.message.includes('重试'));

    // Corrupt only the returned JsonAsset, exercising real validation and resource cleanup.
    await inCity(`const original=cc.assetManager.loadBundle;
        cc.assetManager.loadBundle=function(name,...args) {
            if(name!=='city_harbor_test') return original.call(this,name,...args);
            cc.assetManager.loadBundle=original;
            const callback=args.pop();
            return original.call(this,name,...args,(err,bundle)=>{
                if(bundle) {
                    const load=bundle.load;
                    bundle.load=function(...loadArgs) {
                        bundle.load=load;
                        const done=loadArgs.pop();
                        return load.call(this,...loadArgs,(e,asset)=>{
                            if(asset) asset.json={...asset.json,cityId:'invalid_stage8'};
                            done(e,asset);
                        });
                    };
                }
                callback(err,bundle);
            });
        }; return true;`);
    await button('NextCity');
    s=await until(s=>s.failed,'Invalid next city was accepted');
    assert.equal(s.city,'demo_city');
    assert.deepEqual(s.bundles,['city_demo']);
    assert.equal(s.roots,1);

    // A view construction failure must also roll back its partially created nodes and listeners.
    await inCity(`const prototype=Object.getPrototypeOf(m.current.view), original=prototype.mount;
        prototype.mount=function(...args) {
            prototype.mount=original;
            original.apply(this,args);
            throw new Error('stage8 injected mount failure');
        }; return true;`);
    await button('NextCity');
    s=await until(s=>s.failed,'Mount failure did not preserve old city');
    await wait(150);
    s=await state();
    assert.deepEqual(s.tasks,completedTasks);
    assert.equal(s.roots,1);
    assert.deepEqual(s.bundles,['city_demo']);

    // Delay a valid request, cancel it from the UI, then release the late result.
    await inCity(`const original=m.loader.load.bind(m.loader);
        window.stage8Load=original; window.stage8LoadCalls=0;
        m.loader.load=async id=>{window.stage8LoadCalls++;const loaded=await original(id);
            await new Promise(r=>window.stage8Resume=r);return loaded;}; return true;`);
    await button('NextCity');
    await until(s=>s.loading&&s.bundles.includes('city_harbor_test'),'Delayed request did not start');
    await inCity('void m.goNext(); void m.goNext(); return true;');
    assert.equal(await evaluate('window.stage8LoadCalls'),1,'Duplicate next calls started multiple loads');
    await button('ContinueExploring');
    assert.equal((await state()).modal,false);
    await evaluate('window.stage8Resume(); true');
    await wait(250);
    s=await state();
    assert.equal(s.city,'demo_city','Cancelled request replaced current city');
    assert.deepEqual(s.bundles,['city_demo'],'Cancelled request leaked next bundle');
    await inCity('m.loader.load=window.stage8Load; return true;');

    // Successful retry swaps once and destroys the old view/resources after the frame.
    await button('OpenCompletion');
    await inCity(`window.stage8Old=m.current;
        window.stage8OldAsset=cc.assetManager.getBundle('city_demo').get('city'); return true;`);
    await button('NextCity');
    s=await until(s=>s.ready&&s.city==='harbor_test'&&!s.loading,'Retry did not reach harbor city');
    await wait(200);
    s=await state();
    assert.equal(s.roots,1);
    assert.deepEqual(s.bundles,['city_harbor_test']);
    assert.equal(s.progress.requiredCompleted,0);
    assert.equal(s.progress.requiredTotal,1);
    assert.equal(s.progress.optionalTotal,1);
    assert.equal(await evaluate('window.stage8Old.root.isValid'),false,'Old city nodes are still live');
    assert.equal(await evaluate('window.stage8Old.view.targetInput === null && window.stage8Old.view.controller === null'),true);
    assert.equal(await evaluate('window.stage8OldAsset.isValid'),false,'Old city JSON was not released');
    await target('harbor_parcel');
    s=await until(s=>s.modal,'Required target did not finish terminal city');
    assert.equal(s.progress.optionalCompleted,0);
    assert.equal(s.buttons.find(b=>b.name==='NextCity').active,false,'Terminal city offers invalid next travel');
    assert.ok(s.message.includes('最后一站'));
    await inCity('void m.goNext(); return true;');
    assert.equal((await state()).city,'harbor_test');
    await button('ContinueExploring');
    await target('harbor_key');
    s=await state();
    assert.equal(s.progress.optionalCompleted,1,'Optional target unavailable after completion');
    assert.equal(s.modal,false,'Optional task forced completion UI open again');
    await button('OpenCompletion');
    assert.ok((await state()).summary.includes('隐藏目标：1 / 1'));

    // Resize the live completion UI to a phone viewport and operate actual touch buttons.
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await wait(800);
    await screenshot('stage8_completion_mobile');
    s=await state();
    const continuePoint=s.buttons.find(b=>b.name==='ContinueExploring'&&b.active);
    assert.ok(continuePoint.x>0&&continuePoint.x<390&&continuePoint.y>0&&continuePoint.y<844);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:continuePoint.x,y:continuePoint.y}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await wait(200);
    assert.equal((await state()).modal,false,'Mobile touch did not continue exploration');
    await screenshot('stage8_harbor_mobile');
    // Exercise the other destruction path: Cocos destroys child nodes before CityManager.onDestroy.
    await inCity('window.stage8Retired=m; cc.director.loadScene("bootstrap"); return true;');
    s=await until(s=>s.ready&&s.city==='demo_city','Scene restart did not recover');
    assert.deepEqual(s.bundles,['city_demo']);
    assert.equal(s.roots,1);
    assert.equal(s.progress.requiredCompleted,0);
    assert.equal(await evaluate('window.stage8Retired.isValid'),false);
    assert.deepEqual(errors,[],`Unexpected browser errors: ${errors.join(' | ')}`);
    console.log('Stage 8 browser smoke passed: 5/5 completion, continue, modal input blocking, load/JSON/mount failure rollback, cancellation, duplicate prevention, retry, old resource cleanup, terminal city, optional target, mobile touch.');
} catch (error) {
    console.error(error);
    console.error('BROWSER_ERRORS', errors);
    if (socket?.readyState===1) {
        const request={id:999999,method:'Runtime.evaluate',params:{expression:`JSON.stringify({scene:cc.director.getScene().name,children:cc.director.getScene().children.map(n=>({name:n.name,children:n.children.map(c=>c.name)}))})`,returnByValue:true}};
        socket.addEventListener('message',event=>{const result=JSON.parse(event.data);if(result.id===999999) console.error('DIAGNOSTIC',JSON.stringify(result));});
        socket.send(JSON.stringify(request));
        await wait(300);
    }
    throw error;
} finally {
    socket?.close();
    edge.kill();
    await new Promise(resolve=>server.close(resolve));
}
