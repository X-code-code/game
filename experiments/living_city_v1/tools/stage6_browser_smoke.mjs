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
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
            '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' }[path.extname(file)] ?? 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type }).end(data);
    });
});

await new Promise(resolve => server.listen(8768, '127.0.0.1', resolve));
const debugPort = 12000 + (process.pid % 40000);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-debug-task-${process.pid}`)}`, 'about:blank',
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
    const tab = tabs?.find(item => item.type === 'page');
    if (!tab) throw new Error('Edge debugging endpoint did not start');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

    let nextId = 1;
    const pending = new Map();
    const errors = [];
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
    async function state() {
        return JSON.parse(await evaluate(`(() => {
            const scene = cc.director.getScene();
            const canvas = scene?.getChildByName('Canvas');
            const demo = canvas?.getChildByName('CityContent')?.components.find(component => component.targetInput);
            const map = canvas?.getChildByName('CityContent')?.getChildByName('TestMap');
            const camera = canvas?.getChildByName('Camera')?.getComponent(cc.Camera);
            const position = node => {
                const point = camera.worldToScreen(node.worldPosition);
                return { id: node.name, x: point.x, y: innerHeight - point.y };
            };
            return JSON.stringify({
                scene: scene?.name,
                progress: demo?.taskManager?.getProgress(),
                tasks: demo?.taskManager?.getTaskStates().map(state => ({ id: state.config.id, completed: state.completed })),
                title: demo?.taskTitleLabel?.string,
                items: demo?.taskItemsLabel?.string,
                foundCount: demo?.foundCount,
                lastChickenClickedId: demo?.lastChickenClickedId,
                objects: map?.children.filter(node => node.getComponent('HiddenObject')).map(position),
                chickens: map?.children.filter(node => node.getComponent('ChickenCharacter')).map(position),
            });
        })()`));
    }
    async function click(x, y) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await wait(200);
    }
    async function clickEntity(type, id) {
        const before = await state();
        const entity = (type === 'chicken' ? before.chickens : before.objects)?.find(item => item.id === id);
        if (!entity) throw new Error(`Cannot find ${type} ${id}`);
        await click(entity.x, entity.y);
        return state();
    }
    function assertTask(snapshot, id, completed) {
        const task = snapshot.tasks?.find(item => item.id === id);
        if (!task || task.completed !== completed) throw new Error(`Task ${id} completion should be ${completed}: ${JSON.stringify(snapshot.tasks)}`);
    }
    function assertCount(snapshot, count) {
        if (snapshot.progress?.requiredCompleted !== count || snapshot.progress.requiredTotal !== 5 ||
            snapshot.title !== `探索目标 ${count} / 5`) {
            throw new Error(`Expected ${count}/5 in manager and panel: ${JSON.stringify(snapshot)}`);
        }
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:8768/' });
    await wait(8000);

    let current = await state();
    if (!current.progress || current.tasks?.length !== 5 || current.objects?.length !== 3 || current.chickens?.length !== 4) {
        throw new Error(`Stage 6 scene did not load; rebuild Web Mobile: ${JSON.stringify(current)}`);
    }
    assertCount(current, 0);
    if (current.progress.allRequiredComplete) throw new Error('Main exploration completed before any target click');

    const covered = JSON.parse(await evaluate(`(() => {
        const canvas = cc.director.getScene().getChildByName('Canvas');
        const demo = canvas.getChildByName('CityContent').components.find(component => component.targetInput);
        const map = canvas.getChildByName('CityContent')?.getChildByName('TestMap');
        const banana = map.getChildByName('banana_01');
        const panel = canvas.getChildByName('CityContent')?.getChildByName('TaskPanel');
        const camera = canvas.getChildByName('Camera').getComponent(cc.Camera);
        const previous = map.position.clone();
        // Map and panel share Canvas as parent. Align in that local space; using
        // world-space deltas here misplaces the target when Canvas is scaled.
        map.setPosition(panel.position.x - banana.position.x * map.scale.x,
            panel.position.y - banana.position.y * map.scale.y, 0);
        const point = camera.worldToScreen(banana.worldPosition);
        const panelPoint = camera.worldToScreen(panel.worldPosition);
        return JSON.stringify({ x: point.x, y: innerHeight - point.y,
            blocked: demo.isOverTaskPanel(point.x, point.y),
            panelScreen: { x: panelPoint.x, y: innerHeight - panelPoint.y },
            panelPosition: { x: panel.position.x, y: panel.position.y },
            panelSize: { width: panel.components.find(component => component.contentSize)?.contentSize.width,
                height: panel.components.find(component => component.contentSize)?.contentSize.height },
            previous: { x: previous.x, y: previous.y },
            moved: { x: map.position.x, y: map.position.y } });
    })()`));
    if (!covered.blocked) throw new Error(`Could not position a target under the task panel: ${JSON.stringify(covered)}`);
    await click(covered.x, covered.y);
    current = await state();
    assertCount(current, 0);
    if (current.foundCount !== 0) throw new Error('Tapping the task panel discovered a covered target');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: covered.x, y: covered.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: covered.x + 60, y: covered.y + 40, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: covered.x + 60, y: covered.y + 40, button: 'left', clickCount: 1 });
    const mapAfterPanelDrag = JSON.parse(await evaluate(`(() => {
        const map = cc.director.getScene().getChildByName('Canvas').getChildByName('CityContent')?.getChildByName('TestMap');
        return JSON.stringify({ x: map.position.x, y: map.position.y });
    })()`));
    if (Math.abs(mapAfterPanelDrag.x - covered.moved.x) > 0.01 ||
        Math.abs(mapAfterPanelDrag.y - covered.moved.y) > 0.01) throw new Error('Dragging the task panel moved the map');
    await evaluate(`(() => { cc.director.getScene().getChildByName('Canvas').getChildByName('CityContent')?.getChildByName('TestMap')
        .setPosition(${covered.previous.x}, ${covered.previous.y}, 0); return true; })()`);

    current = await clickEntity('hiddenObject', 'banana_01');
    assertCount(current, 1);
    assertTask(current, 'find_banana', true);
    if (!current.items.includes('✓ 找到香蕉') || current.foundCount !== 1) throw new Error('Banana task or UI did not update');
    current = await clickEntity('hiddenObject', 'banana_01');
    assertCount(current, 1);
    if (current.foundCount !== 1) throw new Error('Repeated banana click counted twice');

    current = await clickEntity('chicken', 'chick_gray');
    assertCount(current, 2);
    assertTask(current, 'find_sleeping_chicken', true);
    if (!current.items.includes('✓ 找到睡觉的小鸡')) throw new Error('Sleeping chicken task is not checked in the panel');
    current = await clickEntity('chicken', 'chick_yellow');
    assertCount(current, 3);
    assertTask(current, 'find_yellow_chicken', true);
    current = await clickEntity('chicken', 'chick_yellow');
    assertCount(current, 3);

    current = await clickEntity('chicken', 'chick_blue');
    if (current.lastChickenClickedId !== 'chick_blue') throw new Error('Blue chicken click was not received');
    assertCount(current, 3);

    current = await clickEntity('hiddenObject', 'parcel_01');
    assertCount(current, 4);
    assertTask(current, 'find_parcel', true);
    current = await clickEntity('hiddenObject', 'key_01');
    assertCount(current, 5);
    assertTask(current, 'find_key', true);
    if (!current.progress.allRequiredComplete || current.tasks.some(task => !task.completed)) {
        throw new Error(`All five tasks should be complete: ${JSON.stringify(current)}`);
    }
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:8768/?mobile=1' });
    await wait(4000);
    const mobile = await state();
    assertCount(mobile, 0);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('temp/stage6_mobile.png', Buffer.from(screenshot.result.data, 'base64'));
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
    console.log('Stage 6 browser task wiring passed: 5/5; repeated clicks and non-task chicken did not add progress.');
} finally {
    socket?.close();
    edge.kill();
    await new Promise(resolve => server.close(resolve));
}
