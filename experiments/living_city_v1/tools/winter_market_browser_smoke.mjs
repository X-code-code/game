import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('build/web-mobile');
const outputDir = path.resolve('temp');
fs.mkdirSync(outputDir, { recursive: true });
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
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-winter-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [];
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
            const layer=map.getChildByName('WinterMarketCrowd');
            const items=Object.fromEntries(['winter_brass_bell','winter_blue_mitten','winter_rooster_whistle']
                .map(id=>{const n=layer?.getChildByName(id),s=n?.getChildByName('PropArt')?.getComponent(cc.Sprite);
                    return [id,{frame:s?.spriteFrame?.name??null,visible:n?.activeInHierarchy??false,
                        screen:point(n),x:n?.position.x??null,y:n?.position.y??null}];}));
            const crowd=layer?.children.filter(n=>!!n.getComponent('AmbientChickenNpc')).map(n=>({id:n.name,x:n.position.x,y:n.position.y,
                screen:point(n.getChildByName('NpcArt')),
                frame:n.getChildByName('NpcArt')?.getComponent(cc.Sprite)?.spriteFrame?.name??null,
                pose:n.getComponent('AmbientChickenNpc')?.currentPose?.moving??false}))??[];
            const ordered=layer?.children.every((n,i,children)=>i===0 ||
                (children[i-1].getComponent('AmbientChickenNpc')?.footY??children[i-1].position.y)>=
                (n.getComponent('AmbientChickenNpc')?.footY??n.position.y))??false;
            const background=map.getChildByName('MapBackgroundArt')?.getComponent(cc.Sprite)?.spriteFrame?.name??null;
            return {ready:true,city:city.content.config.cityId,background,items,crowd,ordered,
                progress:city.view.progress,map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                panel:city.view.taskPanel?.activeInHierarchy??false,
                dialogue:{active:city.view.conversations?.root?.activeInHierarchy??false,
                    speaker:city.view.conversations?.root?.getChildByName('SpeakerName')?.getComponent(cc.Label)?.string??null}};
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
    async function shot(name) {
        const image=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(outputDir,name),Buffer.from(image.result.data,'base64'));
    }
    async function click(x,y) {
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
        await wait(150);
    }
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    let current=await until(s=>s.ready && s.background && s.crowd.length===20 &&
        s.crowd.every(n=>n.frame) && Object.values(s.items).every(item=>item.frame),
    'Winter market art did not load');
    assert.equal(current.city,'demo_city');
    assert.equal(current.progress.requiredTotal,3);
    assert.equal(current.ordered,true,'Targets and NPCs are not ordered by ground depth');
    const depthProbe=await evaluate(`(()=>{
        const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const sorter=c.current.view.sceneDepth, layer=sorter.node;
        const npc=layer.getChildByName('winter_arch_vendor');
        const npcFoot=npc.getComponent('AmbientChickenNpc').footY;
        const marker=new cc.Node('DepthProbe');
        let markerFoot=npcFoot+1;
        sorter.addActor(marker,()=>markerFoot);
        sorter.sort();
        const behind=layer.children.indexOf(marker)<layer.children.indexOf(npc);
        markerFoot=npcFoot-1;
        sorter.sort();
        const inFront=layer.children.indexOf(marker)>layer.children.indexOf(npc);
        marker.removeFromParent(); marker.destroy(); sorter.sort();
        return {behind,inFront};
    })()`);
    assert.deepEqual(depthProbe,{behind:true,inFront:true},'Foreground depth crossing failed');
    await shot('winter_market_desktop.png');
    const initialPositions=new Map(current.crowd.map(n=>[n.id,n.x]));
    await wait(5000);
    current=await state();
    assert.equal(current.ordered,true,'Moving NPCs lost ground depth order');
    const moving=current.crowd.filter(n=>Math.abs(n.x-initialPositions.get(n.id))>2);
    assert.ok(moving.length>=3,`Only ${moving.length} NPCs changed position`);
    const id='winter_brass_bell';
    await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const n=c.current.root.getChildByName('TestMap').getChildByName('WinterMarketCrowd').getChildByName('${id}');
        c.current.view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
    await wait(200);
    let p=(await state()).items[id].screen;
    // Drag across the item and wheel zoom: these are navigation, never discoveries.
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+45,y:p.y+25,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+45,y:p.y+25,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:p.y,deltaY:-110,deltaX:0});
    await wait(200);
    assert.equal((await state()).progress.requiredCompleted,0,'Navigation marked a hidden item');
    await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const n=c.current.root.getChildByName('TestMap').getChildByName('WinterMarketCrowd').getChildByName('${id}');
        c.current.view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
    p=(await state()).items[id].screen;
    await shot('winter_bell_focus.png');
    await click(p.x,p.y);
    assert.equal((await state()).progress.requiredCompleted,1,'Bell tap did not advance progress');
    await click(p.x,p.y);
    assert.equal((await state()).progress.requiredCompleted,1,'Repeat bell tap advanced progress');
    const potterId='winter_lower_lane_potter';
    await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
        const n=c.current.root.getChildByName('TestMap').getChildByName('WinterMarketCrowd').getChildByName('${potterId}');
        c.current.view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
    await wait(200);
    const potter=(await state()).crowd.find(n=>n.id===potterId);
    await click(potter.screen.x,potter.screen.y);
    const talk=await state();
    assert.equal(talk.dialogue.active,true,'Potter dialogue did not open');
    assert.equal(talk.dialogue.speaker,'陶匠阿姨', JSON.stringify({potter,
        nearby:talk.crowd.filter(n=>Math.hypot(n.screen.x-potter.screen.x,n.screen.y-potter.screen.y)<80)
            .map(n=>({id:n.id,screen:n.screen}))}));
    assert.equal(talk.progress.requiredCompleted,1,'Conversation changed task progress');
    await shot('winter_potter_dialogue.png');
    for (const [itemId, expected, screenshot] of [
        ['winter_blue_mitten',2,'winter_mitten_focus.png'],
        ['winter_rooster_whistle',3,'winter_whistle_focus.png'],
    ]) {
        await evaluate(`(()=>{const c=cc.director.getScene().getChildByName('Canvas').getComponent('CityManager');
            c.current.view.conversations.dismiss();
            const n=c.current.root.getChildByName('TestMap').getChildByName('WinterMarketCrowd').getChildByName('${itemId}');
            c.current.view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
        await wait(200);
        const target=(await state()).items[itemId].screen;
        await shot(screenshot);
        await click(target.x,target.y);
        assert.equal((await state()).progress.requiredCompleted,expected,`${itemId} did not advance progress`);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Page.reload',{ignoreCache:false});
    current=await until(s=>s.ready && s.crowd.length===20 && s.crowd.every(n=>n.frame) &&
        Object.values(s.items).every(item=>item.frame),'Portrait winter art did not load');
    await shot('winter_market_mobile.png');
    assert.equal(current.progress.requiredCompleted,0,'Progress unexpectedly carried between reloads');
    assert.equal(errors.length,0,`Runtime errors: ${errors.join('\n')}`);
    assert.equal(failedRequests.length,0,`Network failures: ${failedRequests.join('\n')}`);
    console.log(JSON.stringify({status:'passed',crowd:current.crowd.length,moved:moving.length,
        items:Object.fromEntries(Object.entries(current.items).map(([id,item])=>[id,item.frame])),
        screenshots:['temp/winter_market_desktop.png','temp/winter_market_mobile.png']}));
} finally {
    socket?.close();
    edge.kill();
    server.close();
}
