import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// Local interactive preview of the isolated Creator build. Rebuild in Creator,
// then refresh the same tab; this server always reads current files on disk.
const root = path.resolve('build/web-mobile');
const port = Number(process.env.LIVING_CITY_PREVIEW_PORT ?? 8788);
const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};

http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
    }
    fs.stat(file, (error, stat) => {
        if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(response);
    });
}).listen(port, '127.0.0.1', () => {
    console.log(`Living city preview: http://127.0.0.1:${port}/`);
});
