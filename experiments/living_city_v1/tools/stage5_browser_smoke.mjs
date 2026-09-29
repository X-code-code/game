import http from 'node:http';
import fs from 'node:fs';
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
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' }[path.extname(file)] ?? 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type }).end(data);
    });
});
await new Promise(resolve => server.listen(8767, '127.0.0.1', resolve));
const debugPort = 12000 + (process.pid % 40000);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-debug-hidden-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
            if (tabs.some(tab => tab.type === 'page')) break;
        } catch {}
        await wait(250);
    }
    if (!tabs?.some(tab => tab.type === 'page')) throw new Error('Edge debugging endpoint did not start');
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 1;
    const pending = new Map();
    const events = [];
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else if (['Runtime.exceptionThrown', 'Runtime.consoleAPICalled', 'Log.entryAdded'].includes(message.method)) events.push(message);
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
    async function state() {
        return JSON.parse(await evaluate(`(() => {
            const scene = cc.director.getScene();
            const canvas = scene?.getChildByName('Canvas');
            const demo = canvas?.getChildByName('CityContent')?.components.find(component => component.targetInput);
            const map = canvas?.getChildByName('CityContent')?.getChildByName('TestMap');
            const camera = canvas?.getChildByName('Camera')?.getComponent(cc.Camera);
            const objects = map?.children.filter(node => node.getComponent('HiddenObject')).map(node => {
                const world = camera.worldToScreen(node.worldPosition);
                return { id: node.name, x: world.x, y: innerHeight - world.y, found: node.children.some(child => child.name === 'FoundBadge') };
            });
            const chickens = map?.children.filter(node => node.getComponent('ChickenCharacter')).map(node => {
                const world = camera.worldToScreen(node.worldPosition);
                const appearance = node.getChildByName('VisualRoot');
                const head = appearance?.getChildByName('Head');
                const character = node.getComponent('ChickenCharacter');
                return { id: node.name, x: world.x, y: innerHeight - world.y, mapX: node.position.x,
                    behavior: character.behaviorType, facingScale: appearance?.scale.x,
                    visualY: appearance?.position.y, visualScaleY: appearance?.scale.y, headY: head?.position.y,
                    eyesClosed: head?.getChildByName('EyeClosed')?.active ?? false,
                    zzz: node.getChildByName('Zzz')?.active ?? false,
                    feedback: node.getChildByName('TapFeedback')?.active ?? false };
            });
            return JSON.stringify({ scene: scene?.name, demo: !!demo, count: demo?.foundCount, chickenStatus: '小鸡点击：' + (demo?.lastChickenClickedId ?? '未点击'), map: { x: map?.position.x, y: map?.position.y, scale: map?.scale.x }, objects, chickens, viewport: { width: innerWidth, height: innerHeight } });
        })()`));
    }
    async function click(x, y) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await wait(250);
    }
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:8767/' });
    await wait(8000);
    let initial = await state();
    console.log('INITIAL', JSON.stringify(initial));
    if (!initial.demo || initial.objects?.length !== 3 || initial.chickens?.length !== 4) throw new Error('Stage 5 scene did not create three objects and four chickens');
    if (initial.chickens.map(chicken => chicken.behavior).join(',') !== 'idle,walk,peck,sleep') throw new Error('Four behaviors not selected by configuration');
    const samples = [initial];
    for (let index = 0; index < 30; index++) {
        await wait(300);
        samples.push(await state());
    }
    const idle = samples.map(sample => sample.chickens[0].visualY);
    const walk = samples.map(sample => sample.chickens[1]);
    const peck = samples.map(sample => sample.chickens[2].headY);
    const sleep = samples.map(sample => sample.chickens[3]);
    if (Math.max(...idle) - Math.min(...idle) < 3) throw new Error('Idle chicken did not bob');
    if (walk.some(chicken => chicken.mapX < 23.9 || chicken.mapX > 168.1)) throw new Error('Walking chicken left its configured bounds');
    if (Math.max(...walk.map(chicken => chicken.mapX)) - Math.min(...walk.map(chicken => chicken.mapX)) < 40) throw new Error('Walking chicken did not move');
    if (new Set(walk.map(chicken => chicken.facingScale)).size !== 2) throw new Error('Walking chicken did not turn at a boundary');
    if (Math.min(...peck) > 5 || Math.max(...peck) < 17) throw new Error('Pecking chicken did not dip and recover');
    if (sleep.some(chicken => !chicken.eyesClosed || !chicken.zzz)) throw new Error('Sleeping chicken did not close its eyes and show Zzz');
    if (Math.max(...sleep.map(chicken => chicken.visualScaleY)) - Math.min(...sleep.map(chicken => chicken.visualScaleY)) < 0.04) throw new Error('Sleeping chicken did not breathe');
    console.log('BEHAVIORS_OK', JSON.stringify({ walkMin: Math.min(...walk.map(chicken => chicken.mapX)), walkMax: Math.max(...walk.map(chicken => chicken.mapX)),
        walkFacings: [...new Set(walk.map(chicken => chicken.facingScale))], peckMinHeadY: Math.min(...peck), sleepScaleRange: Math.max(...sleep.map(chicken => chicken.visualScaleY)) - Math.min(...sleep.map(chicken => chicken.visualScaleY)) }));
    const yellowX = (await state()).chickens[0].mapX;
    await evaluate(`(() => { const node = cc.director.getScene().getChildByName('Canvas').getChildByName('CityContent')?.getChildByName('TestMap').getChildByName('chick_yellow');
        node.getComponent('ChickenCharacter').setBehavior({ behaviorType: 'sleep', behaviorConfig: { showZzz: true } }); return true; })()`);
    const switched = (await state()).chickens[0];
    if (switched.behavior !== 'sleep' || !switched.eyesClosed || !switched.zzz || switched.mapX !== yellowX) throw new Error('Runtime behavior transition failed');
    await evaluate(`(() => { const node = cc.director.getScene().getChildByName('Canvas').getChildByName('CityContent')?.getChildByName('TestMap').getChildByName('chick_yellow');
        node.getComponent('ChickenCharacter').setBehavior({ behaviorType: 'idle', behaviorConfig: { bobHeight: 4 } }); return true; })()`);
    if ((await state()).chickens[0].behavior !== 'idle') throw new Error('Return to idle failed');
    console.log('TRANSITION_OK');
    const beforeHold = await state();
    const blueBeforeHold = beforeHold.chickens[1];
    const banana = beforeHold.objects[0];
    const targetWorldX = blueBeforeHold.mapX < 96 ? 168 : 24;
    const pixelsPerWorld = (blueBeforeHold.x - banana.x) / (blueBeforeHold.mapX + 48);
    const holdX = banana.x + (targetWorldX + 48) * pixelsPerWorld;
    const holdY = blueBeforeHold.y;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: holdX, y: holdY, button: 'left', clickCount: 1 });
    let blueAtHold = false;
    for (let attempt = 0; attempt < 70; attempt++) {
        await wait(100);
        if (Math.abs((await state()).chickens[1].mapX - targetWorldX) < 12) {
            blueAtHold = true;
            break;
        }
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: holdX, y: holdY, button: 'left', clickCount: 1 });
    if (!blueAtHold) throw new Error('Walking chicken never reached the held pointer');
    if ((await state()).chickenStatus !== '小鸡点击：未点击') throw new Error('Chicken walking under a stationary pointer caused a false tap');
    console.log('MOVING_UNDER_HOLD_OK');
    for (const chicken of initial.chickens) {
        const current = (await state()).chickens.find(item => item.id === chicken.id);
        await click(current.x, current.y);
        const clicked = await state();
        console.log('CHICKEN_CLICK', chicken.id, clicked.chickenStatus);
        if (clicked.chickenStatus !== `小鸡点击：${chicken.id}` || clicked.count !== 0) throw new Error('Chicken tap did not report without changing object count');
        if (!clicked.chickens.find(current => current.id === chicken.id)?.feedback) throw new Error('Chicken tap had no visual feedback');
    }
    const yellowNow = (await state()).chickens[0];
    await click(yellowNow.x, yellowNow.y);
    if ((await state()).count !== 0) throw new Error('Repeated chicken tap changed object count');
    const dragTarget = (await state()).chickens[1];
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragTarget.x, y: dragTarget.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragTarget.x + 90, y: dragTarget.y + 40, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragTarget.x + 90, y: dragTarget.y + 40, button: 'left', clickCount: 1 });
    await wait(250);
    const afterDrag = await state();
    console.log('DRAG', afterDrag.chickenStatus, afterDrag.count);
    if (afterDrag.count !== 0 || afterDrag.chickenStatus !== '小鸡点击：chick_yellow') throw new Error('A map drag activated a target');
    await send('Page.navigate', { url: 'http://127.0.0.1:8767/?reset=1' });
    await wait(4000);
    initial = await state();
    for (const object of initial.objects) {
        await click(object.x, object.y);
        console.log('CLICK', object.id, (await state()).count);
    }
    await click(initial.objects[0].x, initial.objects[0].y);
    const duplicate = await state();
    console.log('DUPLICATE', duplicate.count);
    if (duplicate.count !== 3) throw new Error('Repeat click counted the same object');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('temp/stage5_desktop.png', Buffer.from(shot.result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await send('Page.navigate', { url: 'http://127.0.0.1:8767/?mobile=1' });
    await wait(5000);
    const mobileInitial = await state();
    console.log('MOBILE_INITIAL', JSON.stringify(mobileInitial));
    if (mobileInitial.chickens[1].x >= mobileInitial.viewport.width - 40) throw new Error('Blue chicken is too close to portrait viewport edge');
    const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('temp/stage5_mobile.png', Buffer.from(mobileShot.result.data, 'base64'));
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 145, y: 420, id: 1 }, { x: 245, y: 420, id: 2 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 420, id: 1 }, { x: 270, y: 420, id: 2 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(300);
    const afterPinch = await state();
    console.log('MOBILE_PINCH', JSON.stringify(afterPinch));
    if (afterPinch.count !== 0) throw new Error('A pinch discovered an object');
    const mobileChicken = afterPinch.chickens[0];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mobileChicken.x, y: mobileChicken.y, id: 4 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(300);
    const afterChickenTap = await state();
    console.log('MOBILE_CHICKEN_TAP', afterChickenTap.chickenStatus);
    if (afterChickenTap.chickenStatus !== `小鸡点击：${mobileChicken.id}` || afterChickenTap.count !== 0) throw new Error('Mobile chicken tap did not report correctly');
    const movingChicken = (await state()).chickens[1];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: movingChicken.x, y: movingChicken.y, id: 5 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(300);
    const afterMovingTap = await state();
    console.log('MOBILE_MOVING_TAP', afterMovingTap.chickenStatus);
    if (afterMovingTap.chickenStatus !== '小鸡点击：chick_blue' || afterMovingTap.count !== 0) throw new Error('Moving chicken did not receive a touch tap');
    const mobileTarget = afterPinch.objects[0];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mobileTarget.x, y: mobileTarget.y, id: 3 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(300);
    const afterTap = await state();
    console.log('MOBILE_TAP', afterTap.count);
    if (afterTap.count !== 1) throw new Error('A mobile tap did not discover the object');
    if (events.some(event => event.method === 'Runtime.exceptionThrown')) throw new Error('Browser runtime exception');
    if (events.some(event => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')) throw new Error('Browser console error');
    if (events.some(event => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')) throw new Error('Browser resource error');
    for (const event of events) {
        if (event.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
        if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') console.log('CONSOLE_ERROR', event.params.args.map(arg => arg.value ?? arg.description).join(' '));
        if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') console.log('LOG_ERROR', event.params.entry.text);
    }
    await send('Browser.close');
} finally {
    socket?.close();
    edge.kill();
    server.close();
}
