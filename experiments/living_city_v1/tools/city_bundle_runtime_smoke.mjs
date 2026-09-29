import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Exercises the shipping Web Mobile output. Completing tasks in the browser
// session isolates the city loader and CityManager transition from pointer QA.
const root = path.resolve('build/web-mobile');
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build web-mobile before running this smoke test');
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
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
            .end(bytes);
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 12000 + process.pid % 40000;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--window-size=390,844',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-city-bundle-smoke-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
const warnings = [];
const failedRequests = [];
let socket;

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
        if (reply.result.exceptionDetails)
            throw new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text);
        return reply.result.result.value;
    }
    async function state() {
        return evaluate(`(() => {
            if (typeof cc === 'undefined' || cc.director.getScene()?.name !== 'city') return {ready:false};
            const canvas=cc.director.getScene().getChildByName('Canvas');
            const manager=canvas?.getComponent('CityManager');
            const current=manager?.current;
            if (!current) return {ready:false};
            const config=current.content.config, map=current.root.getChildByName('TestMap');
            if (!map) return {ready:false};
            const bundle=current.content.bundle;
            const layer=map.getChildByName(config.cityId==='demo_city'?'WinterMarketCrowd':'SceneDepthLayer');
            const frame=n=>n?.getComponent(cc.Sprite)?.spriteFrame?.name??null;
            const aliases={demo_grid:'city_harbor_background',
                demo_parcel:'prop_parcel',demo_key:'prop_key',
                demo_blue:'chicken_blue_v2',winter_item_bell:'winter_item_bell',
                winter_item_mitten:'winter_item_mitten',winter_item_whistle:'winter_item_whistle'};
            const bundled=name=>!!bundle.get((aliases[name]??name)+'/spriteFrame',cc.SpriteFrame);
            const background=map.getChildByName('MapBackgroundArt');
            const objects=config.hiddenObjects.map(({id,asset})=>{
                const n=layer?.getChildByName(id);
                return {id,asset,frame:frame(n?.getChildByName('PropArt')),bundled:bundled(asset)};
            });
            const chickens=config.chickens.map(({id,skin})=>{
                const n=layer?.getChildByName(id);
                return {id,skin,frame:frame(n?.getChildByName('VisualRoot')),bundled:bundled(skin)};
            });
            const foregrounds=(config.foregroundSprites??[]).map(({id,asset})=>{
                const n=layer?.getChildByName(id);
                return {id,asset,frame:frame(n),bundled:bundled(asset)};
            });
            const crowd=config.cityId==='demo_city'?(layer?.children??[])
                .filter(n=>!!n.getComponent('AmbientChickenNpc'))
                .map(n=>({id:n.name,frame:frame(n.getChildByName('NpcArt'))})):[];
            return {ready:true,city:config.cityId,bundle:bundle.name,
                background:frame(background),backgroundBundled:bundled(config.background),
                objects,chickens,foregrounds,crowd,progress:current.view.progress,
                nextCityId:config.nextCityId,modalOpen:manager.ui?.isOpen??false};
        })()`);
    }
    async function until(predicate, description) {
        let current;
        for (let i=0;i<200;i++) {
            current=await state();
            if (predicate(current)) return current;
            await wait(100);
        }
        throw new Error(`${description}: ${JSON.stringify({current,errors,warnings,failedRequests})}`);
    }
    async function readyCity(cityId) {
        const current=await until(s=>s.ready && s.city===cityId && s.background &&
            s.backgroundBundled && s.objects.every(a=>a.frame && a.bundled) &&
            s.chickens.every(a=>a.frame && a.bundled) &&
            s.foregrounds.every(a=>a.frame && a.bundled) &&
            (cityId!=='demo_city' || s.crowd.length===20 && s.crowd.every(a=>a.frame)),
        `${cityId} art did not finish loading`);
        const bundles={winter_market_block_trial_001:'city_winter_market_block_trial_001',
            demo_city:'city_demo',harbor_test:'city_harbor_test'};
        assert.equal(current.bundle, bundles[cityId], `Unexpected bundle for ${cityId}`);
        return current;
    }
    async function nextCity() {
        return evaluate(`(async()=>{
            const manager=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
            const current=manager.current, config=current.content.config;
            const required=config.tasks.filter(task=>task.required).map(task=>task.id);
            current.view.taskManager.restoreCompletedTaskIds(required);
            await manager.goNext();
            return {city:manager.current?.content.config.cityId,
                failed:manager.failed,requiredCompleted:required.length};
        })()`);
    }

    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    const trial=await readyCity('winter_market_block_trial_001');
    assert.equal(trial.objects.length,1);
    assert.equal(trial.chickens.length,2);
    assert.equal(trial.foregrounds.length,3);
    const first=await nextCity();
    assert.equal(first.failed,false,`Trial -> demo load failed: ${JSON.stringify(first)}`);
    assert.equal(first.city,'demo_city');
    const demo=await readyCity('demo_city');
    assert.equal(demo.objects.length,3);
    assert.equal(demo.crowd.length,20);
    const second=await nextCity();
    assert.equal(second.failed,false,`Demo -> harbor load failed: ${JSON.stringify(second)}`);
    assert.equal(second.city,'harbor_test');
    const harbor=await readyCity('harbor_test');
    assert.equal(harbor.objects.length,2);
    assert.equal(harbor.chickens.length,1);
    await wait(500);
    assert.deepEqual(warnings,[],`Runtime warnings: ${warnings.join('\n')}`);
    assert.deepEqual(errors,[],`Runtime errors: ${errors.join('\n')}`);
    assert.deepEqual(failedRequests,[],`Network failures: ${failedRequests.join('\n')}`);
    console.log(JSON.stringify({status:'passed',cities:[trial,demo,harbor],
        transitions:[first,second],errors,warnings,failedRequests}));
} finally {
    socket?.close();
    edge.kill();
    server.close();
}
