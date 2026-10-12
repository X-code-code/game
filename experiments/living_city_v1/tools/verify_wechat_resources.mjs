import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reviewRoot = join(projectRoot, 'art/review/wechat_v17');
const remoteRoot = join(projectRoot, 'build/wechatgame/remote');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const slash = value => value.replaceAll('\\', '/');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const startedAt = new Date().toISOString();

async function filesUnder(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await filesUnder(path));
        else if (entry.isFile()) files.push(path);
    }
    return files.sort();
}

async function parallel(items, concurrency, callback) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await callback(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

async function request(url, method = 'HEAD') {
    return fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(10000) });
}

const report = {
    startedAt, server: null, remoteDirectory: slash(remoteRoot),
    verified: false, headFilesChecked: 0, headBytesChecked: 0,
    bundles: [], getSamples: [], excludedPaths: [], failures: [],
    devtoolsRuntimeVerified: false, phoneRuntimeVerified: false,
};

try {
    const build = await readJson(join(reviewRoot, 'build_report.json'));
    const filter = await readJson(join(reviewRoot, 'asset_filter_report.json'));
    const server = new URL(build.server);
    assert.equal(server.protocol, 'http:', 'Verification is for the existing local preview server.');
    assert.equal(server.hostname, '127.0.0.1');
    assert.equal(server.port, '8790');
    assert.equal(server.pathname, '/');
    report.server = server.href;
    const urlFor = path => new URL(`remote/${slash(relative(remoteRoot, path))
        .split('/').map(encodeURIComponent).join('/')}`, server).href;

    const names = build.remoteBundles.map(bundle => bundle.name).sort();
    const directories = (await readdir(remoteRoot, { withFileTypes: true }))
        .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.deepEqual(directories, names, 'Remote folders differ from the verified build report.');

    const records = [];
    for (const expected of build.remoteBundles) {
        const files = await filesUnder(join(remoteRoot, expected.name));
        const entries = await Promise.all(files.map(async file => ({
            file, path: slash(relative(remoteRoot, file)), bytes: (await stat(file)).size,
            bundle: expected.name,
        })));
        const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
        assert.equal(files.length, expected.files, `${expected.name}: file count changed since build verification.`);
        assert.equal(bytes, expected.bytes, `${expected.name}: bytes changed since build verification.`);
        records.push(...entries);
        report.bundles.push({ name: expected.name, files: files.length, bytes, headVerified: false });
    }
    assert.equal(records.reduce((sum, entry) => sum + entry.bytes, 0), build.remoteBytes);

    const heads = await parallel(records, 12, async record => {
        try {
            const response = await request(urlFor(record.file));
            assert.equal(response.status, 200, `${record.path}: HTTP status`);
            assert.equal(response.headers.get('content-length'), String(record.bytes),
                `${record.path}: HTTP Content-Length`);
            return { path: record.path, bytes: record.bytes, verified: true };
        } catch (error) {
            return { path: record.path, bytes: record.bytes, verified: false, error: error.message };
        }
    });
    const failedHeads = heads.filter(record => !record.verified);
    report.headFilesChecked = heads.length;
    report.headBytesChecked = heads.reduce((sum, record) => sum + record.bytes, 0);
    report.failures.push(...failedHeads);
    for (const bundle of report.bundles) {
        bundle.headVerified = !failedHeads.some(record => record.path.startsWith(`${bundle.name}/`));
    }

    for (const name of names) {
        const pngs = records.filter(record => record.bundle === name && record.file.endsWith('.png'));
        assert.ok(pngs.length, `${name}: no PNG to download.`);
        // Exercise a substantial image download instead of choosing a tiny icon.
        const largestPng = [...pngs].sort((a, b) => b.bytes - a.bytes)[0];
        const configs = records.filter(record => record.bundle === name &&
            /^config(?:\.[a-f0-9]+)?\.json$/.test(record.path.slice(name.length + 1)));
        assert.equal(configs.length, 1, `${name}: expected one plain or versioned bundle config.`);
        const config = configs[0];
        for (const sample of [config, largestPng]) {
            const url = urlFor(sample.file);
            const response = await request(url, 'GET');
            assert.equal(response.status, 200, `${sample.path}: GET status`);
            const body = Buffer.from(await response.arrayBuffer());
            assert.equal(body.length, sample.bytes, `${sample.path}: GET body size`);
            const localHash = sha256(await readFile(sample.file));
            const servedHash = sha256(body);
            assert.equal(servedHash, localHash, `${sample.path}: GET SHA-256 differs from the build.`);
            if (sample === config) JSON.parse(body.toString('utf8'));
            report.getSamples.push({
                path: sample.path, url, bytes: body.length, sha256: servedHash,
                kind: sample === config ? 'bundle_config' : 'largest_bundle_png', verified: true,
            });
        }
    }

    for (const bundle of filter.excludedBundles) {
        assert.ok(!names.includes(bundle.name), `${bundle.name}: excluded bundle unexpectedly became active.`);
        const url = new URL(`remote/${encodeURIComponent(bundle.name)}/config.json`, server).href;
        const response = await request(url);
        assert.equal(response.status, 404, `${bundle.name}: excluded bundle is still served.`);
        report.excludedPaths.push({ url, expectedStatus: 404, actualStatus: response.status, verified: true });
    }
    // Cocos requests /remote/<bundle>; exposing a bare bundle route can hide a
    // wrong server prefix during development, so reject it explicitly.
    const bareUrl = new URL(`${encodeURIComponent(names[0])}/config.json`, server).href;
    const bareResponse = await request(bareUrl);
    assert.equal(bareResponse.status, 404, 'Server must only expose the /remote/ prefix.');
    report.excludedPaths.push({
        url: bareUrl, expectedStatus: 404, actualStatus: bareResponse.status, verified: true,
    });
    assert.equal(failedHeads.length, 0, `${failedHeads.length} remote file HEAD checks failed.`);
    report.verified = true;
} catch (error) {
    report.failures.push({ stage: 'verification', error: error.message });
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    await mkdir(reviewRoot, { recursive: true });
    await writeFile(join(reviewRoot, 'http_report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
}
