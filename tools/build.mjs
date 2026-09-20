import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { parsePup, durationOf } from '../src/canvas.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
for (const dir of ['', 'assets/fox', 'assets/raccoon', 'assets/peek', 'vendor', 'frames']) {
  fs.mkdirSync(path.join(dist, dir), { recursive: true });
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const stats = bytes => ({ bytes: bytes.length, gzip: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') });
function copy(source, target) {
  const bytes = fs.readFileSync(source);
  fs.writeFileSync(path.join(dist, target), bytes);
  return { ...stats(bytes), url: target + '?v=' + hash(bytes) };
}

await build({ entryPoints: ['src/index.js'], outfile: path.join(dist, 'pup.js'), bundle: true,
  format: 'esm', platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline' });
const pupRuntime = { ...stats(fs.readFileSync(path.join(dist, 'pup.js'))), url: 'pup.js' };

const riveEntry = require.resolve('@rive-app/canvas-advanced');
const riveResult = await build({ stdin: { contents: "export { default } from '@rive-app/canvas-advanced';", resolveDir: root },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline' });
const riveBytes = riveResult.outputFiles[0].contents;
const riveFile = 'vendor/rive-' + hash(riveBytes) + '.js';
fs.writeFileSync(path.join(dist, riveFile), riveBytes);
const riveRoot = path.dirname(riveEntry);
const riveVersion = JSON.parse(fs.readFileSync(path.join(riveRoot, 'package.json'), 'utf8')).version;
const wasm = copy(path.join(riveRoot, 'rive.wasm'), 'vendor/rive.wasm');
const fallback = copy(path.join(riveRoot, 'rive_fallback.wasm'), 'vendor/rive_fallback.wasm');
const manifest = {
  format: 'PUP1', version: '0.1.0',
  runtime: { pup: pupRuntime, rive: { version: riveVersion, js: { ...stats(riveBytes), url: riveFile }, wasm, fallback } },
  quiz: {}, peek: {},
};
for (const character of ['fox', 'raccoon']) {
  const source = 'examples/' + character + '/';
  const pup = copy(source + 'animation.pup', 'assets/' + character + '/animation.pup');
  const artwork = copy(source + 'artwork.svg', 'assets/' + character + '/artwork.svg');
  const model = parsePup(fs.readFileSync(source + 'animation.pup'));
  manifest.quiz[character] = { pup, artwork, width: model.art.w, height: model.art.h,
    shapes: model.art.shapes.length,
    animatedVertices: model.art.geoms.reduce((n, g) => n + (g.verts ? g.verts.length / 6 : 0), 0),
    actions: Object.fromEntries(model.art.clock.clips.map(clip => [clip.name, { duration: clip.duration }])) };
  const peek = copy('examples/peek/' + character + '.pup', 'assets/peek/' + character + '.pup');
  const peekModel = parsePup(fs.readFileSync('examples/peek/' + character + '.pup'));
  manifest.peek[character] = {
    pup: peek, duration: durationOf(peekModel), width: peekModel.art.w, height: peekModel.art.h,
    body: copy('examples/peek/' + character + '-body.riv', 'assets/peek/' + character + '-body.riv'),
    hand: copy('examples/peek/' + character + '-hand.riv', 'assets/peek/' + character + '-hand.riv'),
  };
}
for (const action of ['correct', 'wrong']) {
  const out = path.join(dist, 'frames', action);
  const result = spawnSync(process.env.PUP_PYTHON || 'python3', [
    'tools/prepare.py', 'examples/fox/' + action + '.webp', 'examples/fox/artwork.svg', out, '--frames-only',
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
  const timing = JSON.parse(fs.readFileSync(path.join(out, 'reference.json'), 'utf8'));
  const webp = copy('examples/fox/' + action + '.webp', 'assets/fox/' + action + '.webp');
  const frameBytes = fs.readFileSync(path.join(out, 'frames.webp'));
  manifest.quiz.fox.actions[action].reference = {
    ...timing, original: webp, sheet: 'frames/' + action + '/frames.webp?v=' + hash(frameBytes),
  };
}
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
const manifestName = 'manifest-' + hash(manifestBytes) + '.json';
fs.writeFileSync(path.join(dist, manifestName), manifestBytes);
const app = await build({ entryPoints: ['demo/main.js'], bundle: true, write: false, format: 'esm',
  platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline',
  define: { __MANIFEST__: JSON.stringify(manifestName) } });
const appBytes = app.outputFiles[0].contents, appName = 'app-' + hash(appBytes) + '.js';
fs.writeFileSync(path.join(dist, appName), appBytes);
fs.copyFileSync('demo/style.css', path.join(dist, 'style.css'));
fs.writeFileSync(path.join(dist, 'index.html'), fs.readFileSync('demo/index.html', 'utf8').replace('APP_SCRIPT', appName));
for (const file of ['LICENSE', 'LICENSE-RIVE.txt', 'ASSETS.md']) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dist, file));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('PUP runtime: ' + pupRuntime.bytes + ' B raw / ' + pupRuntime.gzip + ' B gzip');
console.log('Built dist/ with matching original Rive and WebP references.');
