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
for (const dir of ['', 'assets/fox', 'assets/raccoon', 'assets/peek', 'assets/dance/fox', 'assets/dance/raccoon', 'assets/dance/bird', 'assets/bird', 'assets/bird/views', 'vendor', 'frames', 'downloads']) {
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
  format: 'PUP', version: '0.1.0', formats: ['PUP1','PUP2','PUPZ','PUC1'],
  runtime: { pup: pupRuntime, rive: { version: riveVersion, js: { ...stats(riveBytes), url: riveFile }, wasm, fallback } },
  quiz: {}, peek: {}, cases: [],
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
const dances = [
  {character:'fox',label:'Fox',phase:'Step · turn · clap',
    note:'The supplied 85,387-byte release is preserved. Compare its first 4.633 seconds with the original WebP; the source’s extra final hold is omitted.'},
  {character:'raccoon',label:'Raccoon',phase:'Step · sway · return',
    note:'The supplied compact release is preserved. Colors come from the SVG; the WebP supplies the motion reference. The tail follows the body with a delayed tip.'},
  {character:'bird',label:'Bird',phase:'Bird dance',
    note:'The supplied 9,575-byte PUP is preserved. One 4.033-second dance, compared with the original 97-frame WebP on the same clock.'},
];
for (const {character, label, phase, note} of dances) {
  const source = 'examples/dance/' + character + '/', target = 'assets/dance/' + character + '/';
  const pup = copy(source + 'animation.pup', target + 'animation.pup');
  const model = parsePup(fs.readFileSync(source + 'animation.pup'));
  const duration = durationOf(model, 'dance'), output = path.join(dist, 'frames', character + '-dance');
  const result = spawnSync(process.env.PUP_PYTHON || 'python3', ['tools/prepare.py', source + 'reference.webp', '-', output, '--frames-only'], {stdio:'inherit'});
  if (result.status !== 0) throw new Error('Could not prepare ' + character + ' dance reference');
  const full = JSON.parse(fs.readFileSync(path.join(output, 'reference.json')));
  const frames = full.frames.filter(f => f.start < Math.round(duration * 1000));
  const reference = {...full, frames, frameCount:frames.length, duration:Math.round(duration*1000),
    originalFrameCount:full.frameCount, originalDuration:full.duration, kind:'webp',
    original:copy(source + 'reference.webp', target + 'reference.webp'),
    sheet:'frames/' + character + '-dance/frames.webp?v=' + hash(fs.readFileSync(path.join(output, 'frames.webp')))};
  manifest.cases.push({id:character+'-dance', character, title:label+' dance', clip:'dance', duration,
    width:model.art.w,height:model.art.h,pup,reference,shapes:model.art.shapes.length,
    bones:null, phase, note,
    compatibility:character==='raccoon'?copy(source+'animation.compat.pup',target+'animation.compat.pup'):null});
}
const birdMapping = JSON.parse(fs.readFileSync('examples/bird/rig.json'));
const birdViews = JSON.parse(fs.readFileSync('examples/bird/views/index.json')).views.map(view => ({
  ...view, ...copy('examples/bird/views/' + view.file, 'assets/bird/views/' + view.file),
}));
const birdSourceBytes = birdViews.reduce((sum, view) => sum + view.bytes, 0);
manifest.cases.push({id:'bird-turn',character:'bird',title:'Little bird turn',clip:'turn',
  duration:birdMapping.durationMs/1000,width:460,height:460,shapes:0,
  pup:copy('examples/bird/turn.puc','assets/bird/turn.puc'),bones:birdMapping.bones,
  rig:copy('examples/bird/rig.json','assets/bird/rig.json'),
  preview:copy('examples/bird/source.html','assets/bird/source.html'),
  reference:{kind:'svg-views',views:birdViews,original:{bytes:birdSourceBytes},
    framing:{top:48/460,height:358/460}},
  phase:'Front · back · front',
  note:'Seven original SVG views from the supplied Figma export are shown on the left. Choose a static view below, then scrub the PUP turnaround to compare. The source size is the seven SVG files only; the PUC file adds the animation. Bones show its eight supplied joints.'});
const downloads = manifest.cases.map(example => ({...example.pup,
  name:example.id+(example.id==='bird-turn'?'.puc':'.pup'),character:example.id==='bird-turn'?'Little bird':({fox:'Fox',raccoon:'Raccoon',bird:'Bird'})[example.character],
  title:example.clip==='dance'?'Dance':'Turnaround',detail:example.clip==='dance'?'One complete dance action':'Front to back and return · 8 joints',
  compatibility:example.compatibility,rig:example.rig}));

for (const group of ['quiz', 'peek']) for (const character of ['fox', 'raccoon']) {
  downloads.push({
    ...manifest[group][character].pup,
    name: character + '-' + (group === 'quiz' ? 'reactions' : 'peek') + '.pup',
    character: character === 'fox' ? 'Fox' : 'Raccoon',
    title: group === 'quiz' ? 'Reactions' : 'Card peek',
    detail: group === 'quiz' ? 'Correct + wrong · two actions' : 'Peek + return · two layers',
  });
}
const bundlePath = 'downloads/pup-examples.zip';
const bundleResult = spawnSync(process.env.PUP_PYTHON || 'python3', ['tools/build-downloads.py'], {
  input: JSON.stringify({
    output: path.join(dist, bundlePath),
    files: [
      ...downloads.map(asset => ({ name: asset.name, path: path.join(dist, asset.url.split('?')[0]) })),
      { name: 'raccoon-dance.compat.pup', path: path.join(root, 'examples/dance/raccoon/animation.compat.pup') },
      { name: 'bird-turn.rig.json', path: path.join(root, 'examples/bird/rig.json') },
      { name: 'bird-README.md', path: path.join(root, 'examples/bird/README.md') },
      { name: 'ASSETS.md', path: path.join(root, 'ASSETS.md') },
    ],
  }),
  encoding: 'utf8',
});
if (bundleResult.error) throw bundleResult.error;
if (bundleResult.status !== 0) throw new Error(bundleResult.stderr || 'Could not build PUP downloads');
const bundleBytes = fs.readFileSync(path.join(dist, bundlePath));
manifest.downloads = {
  files: downloads,
  bundle: { ...stats(bundleBytes), url: bundlePath + '?v=' + hash(bundleBytes) },
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
const manifestName = 'manifest-' + hash(manifestBytes) + '.json';
fs.writeFileSync(path.join(dist, manifestName), manifestBytes);
const app = await build({ entryPoints: ['demo/main.js'], bundle: true, write: false, format: 'esm',
  platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline',
  define: { __MANIFEST__: JSON.stringify(manifestName) } });
const appBytes = app.outputFiles[0].contents, appName = 'app-' + hash(appBytes) + '.js';
fs.writeFileSync(path.join(dist, appName), appBytes);
const stylesheet = copy('demo/style.css', 'style.css');
const size = bytes => (bytes / 1024).toFixed(1) + ' KiB';
const cards = downloads.map(asset =>
  '<article class="download-card"><div><span class="tiny-label">' + asset.character +
  '</span><h3>' + asset.title + '</h3><p>' + asset.detail + '</p><code>' + asset.name +
  '</code></div><div class="download-actions"><a class="download" href="' + asset.url + '" download="' + asset.name +
  '" aria-label="Download ' + asset.name + '">↓ ' + (asset.name.endsWith('.puc') ? '.puc' : '.pup') + '<span>' + size(asset.bytes) + '</span></a>' +
  (asset.rig ? '<a class="download extra-download" href="' + asset.rig.url + '" download="bird-turn.rig.json">↓ Bone map</a>' : '') +
  (asset.compatibility ? '<a class="download extra-download" href="' + asset.compatibility.url + '" download="raccoon-dance.compat.pup">↓ PUP1 compatible</a>' : '') + '</div></article>',
).join('\n');
const html = fs.readFileSync('demo/index.html', 'utf8')
  .replace('APP_SCRIPT', appName)
  .replace('style.css', stylesheet.url)
  .replace('DOWNLOAD_CARDS', cards)
  .replace('DOWNLOAD_BUNDLE_URL', manifest.downloads.bundle.url)
  .replace('DOWNLOAD_BUNDLE_SIZE', size(bundleBytes.length));
fs.writeFileSync(path.join(dist, 'index.html'), html);
for (const file of ['LICENSE', 'LICENSE-RIVE.txt', 'ASSETS.md']) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dist, file));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('PUP runtime: ' + pupRuntime.bytes + ' B raw / ' + pupRuntime.gzip + ' B gzip');
console.log('Built dist/ with matching original Rive and WebP references.');
