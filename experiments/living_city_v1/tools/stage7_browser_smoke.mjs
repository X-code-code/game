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

await new Promise(resolve => server.listen(8769, '127.0.0.1', resolve));
const debugPort = 12000 + (process.pid % 40000);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--use-angle=swiftshader', '--window-size=1280,720', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.resolve(`temp/edge-debug-city-${process.pid}`)}`, 'about:blank',
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
            if (typeof cc === 'undefined') return JSON.stringify({ ready: false });
            const scene = cc.director.getScene();
            if (!scene || scene.name !== 'city') return JSON.stringify({ ready: false, scene: scene?.name });
            const canvas = scene?.getChildByName('Canvas');
            const demo = canvas?.getChildByName('CityContent')?.components.find(component => component.cityConfig || component.taskManager || component.targetInput);
            const map = canvas?.getChildByName('CityContent')?.getChildByName('TestMap');
            const camera = canvas?.getChildByName('Camera')?.getComponent(cc.Camera);
            const bundle = cc.assetManager.getBundle(${JSON.stringify(catalogEntry.bundleName)});
            const position = node => {
                const screen = camera.worldToScreen(node.worldPosition);
                return { id: node.name, x: node.position.x, y: node.position.y,
                    scale: node.scale.x, screenX: screen.x, screenY: innerHeight - screen.y };
            };
            return JSON.stringify({
                ready: !!(demo?.targetInput && demo?.taskManager && map && camera),
                scene: scene?.name,
                cityConfig: demo?.cityConfig ?? null,
                bundleName: bundle?.name ?? null,
                bundleCityId: bundle?.get('city')?.json?.cityId ?? null,
                mapSize: map ? (() => {
                    const transform = map.components.find(component => component.contentSize?.width);
                    return transform ? { width: transform.contentSize.width, height: transform.contentSize.height } : null;
                })() : null,
                objects: map && camera ? map.children.filter(node => node.getComponent('HiddenObject')).map(position) : [],
                chickens: map && camera ? map.children.filter(node => node.getComponent('ChickenCharacter'))
                    .map(node => ({ ...position(node), behavior: node.getComponent('ChickenCharacter').behaviorType })) : [],
                tasks: demo?.taskManager?.getTaskStates().map(task => ({ ...task.config, completed: task.completed })) ?? [],
                progress: demo?.taskManager?.getProgress() ?? null,
                title: demo?.taskTitleLabel?.string ?? null,
            });
        })()`));
    }
    async function click(x, y) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await wait(220);
    }
    function checkPosition(actual, config, label) {
        assert.ok(actual, `${label} ${config.id} was not created`);
        const expectedX = (config.x - 0.5) * city.mapSize.width;
        const expectedY = (config.y - 0.5) * city.mapSize.height;
        const tolerance = 0.6;
        assert.ok(Math.abs(actual.y - expectedY) < tolerance, `${label} ${config.id} has wrong y: ${actual.y} vs ${expectedY}`);
        if (config.behaviorType === 'walk') {
            const minX = (config.movementRange.minX - 0.5) * city.mapSize.width;
            const maxX = (config.movementRange.maxX - 0.5) * city.mapSize.width;
            assert.ok(actual.x >= minX - tolerance && actual.x <= maxX + tolerance,
                `${label} ${config.id} left its JSON movement range: ${actual.x}`);
        } else {
            assert.ok(Math.abs(actual.x - expectedX) < tolerance,
                `${label} ${config.id} has wrong x: ${actual.x} vs ${expectedX}`);
        }
        assert.ok(Math.abs(actual.scale - config.scale) < 0.001, `${label} ${config.id} has wrong scale`);
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:8769/' });

    let current;
    for (let attempt = 0; attempt < 80; attempt++) {
        await wait(250);
        current = await state();
        if (current.ready && current.bundleCityId === city.cityId) break;
    }
    assert.ok(current.ready, `Stage 7 city did not load: ${JSON.stringify(current)}`);
    assert.equal(current.bundleName, catalogEntry.bundleName, 'City Bundle did not load');
    assert.equal(current.bundleCityId, city.cityId, 'City JSON was not loaded from its Bundle');
    assert.deepEqual(current.cityConfig, city, 'Runtime CityConfig differs from the source JSON');
    assert.deepEqual(current.mapSize, city.mapSize, 'Map dimensions do not match CityConfig');
    assert.deepEqual(current.objects.map(item => item.id).sort(), city.hiddenObjects.map(item => item.id).sort());
    assert.deepEqual(current.chickens.map(item => item.id).sort(), city.chickens.map(item => item.id).sort());
    for (const config of city.hiddenObjects) {
        checkPosition(current.objects.find(item => item.id === config.id), config, 'Hidden object');
    }
    for (const config of city.chickens) {
        const actual = current.chickens.find(item => item.id === config.id);
        checkPosition(actual, config, 'Chicken');
        assert.equal(actual.behavior, config.behaviorType, `Chicken ${config.id} has wrong behavior`);
    }
    assert.deepEqual(current.tasks.map(({ completed, ...config }) => config), city.tasks,
        'Runtime task list differs from CityConfig');
    assert.ok(current.tasks.every(task => !task.completed), 'A task started completed');
    assert.equal(current.progress.requiredCompleted, 0);
    assert.equal(current.progress.requiredTotal, 5);
    assert.equal(current.progress.optionalTotal, city.tasks.filter(task => !task.required).length);

    for (const task of city.tasks) {
        if (current.tasks.find(item => item.id === task.id)?.completed) continue;
        const kind = task.type === 'hiddenObject' ? 'objects' : 'chickens';
        const id = task.type === 'chickenTag'
            ? city.chickens.find(chicken => chicken.tags.includes(task.targetTag))?.id
            : task.targetId;
        assert.ok(id, `No entity in CityConfig matches task ${task.id}`);
        let completed = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            current = await state();
            const target = current[kind].find(item => item.id === id);
            assert.ok(target, `No runtime entity ${id} for task ${task.id}`);
            await click(target.screenX, target.screenY);
            current = await state();
            if (current.tasks.find(item => item.id === task.id)?.completed) {
                completed = true;
                break;
            }
        }
        assert.ok(completed, `Clicking ${id} did not complete task ${task.id}`);
        assert.equal(current.title, `探索目标 ${current.progress.requiredCompleted} / 5`);
    }

    assert.equal(current.progress.requiredCompleted, 5);
    assert.equal(current.progress.requiredTotal, 5);
    assert.equal(current.progress.allRequiredComplete, true);
    assert.ok(current.tasks.every(task => task.completed), 'Some CityConfig tasks did not complete');
    assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
    console.log(`Stage 7 browser smoke passed: ${city.cityId} loaded from ${catalogEntry.bundleName}; ` +
        `${city.hiddenObjects.length} objects, ${city.chickens.length} chickens, tasks 5/5.`);
} finally {
    socket?.close();
    edge.kill();
    await new Promise(resolve => server.close(resolve));
}
