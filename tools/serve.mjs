import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const root = path.resolve(args.find(a => !a.startsWith('--')) || 'dist');
const portAt = args.indexOf('--port');
const port = portAt < 0 ? 4320 : Number(args[portAt + 1]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm',
  '.pup': 'application/octet-stream', '.riv': 'application/octet-stream' };
http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('outside root');
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const stat = fs.statSync(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log('PUP demo: http://127.0.0.1:' + port));
