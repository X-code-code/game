import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = join(projectRoot, 'build', 'wechatgame');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const expected = await readJson(join(projectRoot, 'tools', 'wechat-preview.build.json'));
const appid = expected.packages?.wechatgame?.appid;
if (typeof appid !== 'string' || !/^wx[0-9a-f]{16}$/.test(appid)) {
    throw new Error('tools/wechat-preview.build.json has no valid WeChat AppID');
}

const projectPath = join(buildRoot, 'project.config.json');
const project = await readJson(projectPath);
if (project.compileType !== 'game') throw new Error('The build root is not a WeChat game');
if (project.appid !== appid) {
    project.appid = appid;
    await writeFile(projectPath, `${JSON.stringify(project)}\n`, 'utf8');
}

const game = await readJson(join(buildRoot, 'game.json'));
const packages = game.subpackages ?? [];
if (packages.length !== 3) throw new Error(`Expected three city subpackages, found ${packages.length}`);

async function filesUnder(path) {
    const result = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) result.push(...await filesUnder(child));
        else if (entry.isFile()) result.push(child);
    }
    return result;
}

const allFiles = await filesUnder(buildRoot);
let jsonCount = 0;
let mainBytes = 0;
for (const file of allFiles) {
    const rel = relative(buildRoot, file).replaceAll('\\', '/');
    if (file.endsWith('.json')) {
        await readJson(file);
        jsonCount++;
    }
    if (!rel.startsWith('subpackages/')) mainBytes += (await stat(file)).size;
}

const limit = 4 * 1024 * 1024;
if (mainBytes > limit) throw new Error(`Main package exceeds 4 MiB: ${mainBytes} B`);
const sizes = [];
for (const item of packages) {
    if (!/^city_[a-z0-9_]+$/.test(item.name) || item.root !== `subpackages/${item.name}/`) {
        throw new Error(`Unexpected subpackage declaration: ${JSON.stringify(item)}`);
    }
    const prefix = item.root;
    const files = allFiles.filter(file => relative(buildRoot, file).replaceAll('\\', '/').startsWith(prefix));
    if (!files.length) throw new Error(`${item.name} subpackage is empty`);
    let bytes = 0;
    for (const file of files) bytes += (await stat(file)).size;
    if (bytes > limit) throw new Error(`${item.name} exceeds 4 MiB: ${bytes} B`);
    sizes.push({ name: item.name, bytes });
}

const mainScript = await readFile(join(buildRoot, 'assets', 'main', 'index.js'), 'utf8');
if (!mainScript.includes('WinterMarketTeaEvent.ts')) throw new Error('Latest tea event is absent from the game script');
console.log(JSON.stringify({ appid, mainBytes, subpackages: sizes, parsedJsonFiles: jsonCount }, null, 2));
