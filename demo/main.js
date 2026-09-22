import { loadPup, durationOf, poseAt, drawCanvas, renderCanvas, createSvgRenderer } from '../src/index.js';
import { RiveReference } from './rive-reference.js';
import { RigInspector } from './rig-inspector.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
async function main() {
const manifest = await fetch(__MANIFEST__).then(response => {
  if (!response.ok) throw new Error('Comparison manifest failed to load');
  return response.json();
});
const W = 608; let H = 608;
const reference = $('#reference'), result = $('#result');
const pupCanvas = document.createElement('canvas');
const state = {
  mode: new URLSearchParams(location.search).get('example') || 'fox-dance', character: 'fox', action: 'dance', view: 'side',
  renderer: 'canvas', playing: false, loop: true, wire: false,
  speed: 1, direction: 1, bones: false, time: 0, duration: 1.083, last: null, loading: false,
};
let current = null, loadVersion = 0;
const inspector = new RigInspector(() => render());
const frameCanvas = document.createElement('canvas'); let frameSource = null, copiedFrame = -1;
const selectedCase = () => manifest.cases.find(example => example.id === state.mode);
if (!selectedCase() && !['webp','rive','skin'].includes(state.mode)) state.mode = 'fox-dance';
const imageCache = new Map();
function loadImage(url) {
  if (!imageCache.has(url)) imageCache.set(url, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode ' + url));
    image.src = url;
  }).catch(error => { imageCache.delete(url); throw error; }));
  return imageCache.get(url);
}
const size = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MiB' :
  n >= 1024 ? (n / 1024).toFixed(1) + ' KiB' : n + ' B';

$('#runtime-size').textContent = size(manifest.runtime.pup.gzip);
$('#runtime-comparison').textContent = 'PUP ' + size(manifest.runtime.pup.gzip) +
  ' · Rive ' + size(manifest.runtime.rive.js.gzip + manifest.runtime.rive.wasm.gzip);
$('#runtime-note').textContent = 'Gzip estimates: the bundled PUP player versus Rive Canvas Advanced ' +
  manifest.runtime.rive.version + ' JS + primary WASM. Feature scopes differ. This is not a speed benchmark.';

function controls() {
  const example = selectedCase();
  H = example ? 608 : 378;
  $('#stages').style.setProperty('--stage-ratio', example ? '1' : '608/378');
  $('#actions').hidden = !!example;
  $('#bones').disabled = state.loading || !current?.inspection;
  $('#bones').checked = state.bones;
  inspector.toggle(state.bones && !state.loading);
  $$('#play span').forEach(node => { node.textContent = state.playing ? 'Pause' : 'Play'; });
  $('#play').firstChild.textContent = state.playing ? 'Ⅱ ' : '▶ ';
  $('#play').setAttribute('aria-label', state.playing ? 'Pause animation' : 'Play animation');
  $$('[data-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.mode === state.mode)));
  $$('[data-action]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.action === state.action));
    button.disabled = state.mode === 'rive';
  });
  $$('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  $('#character').disabled = state.mode !== 'rive';
  $('#character').value = state.character;
  $('#renderer').disabled = state.mode === 'rive' || state.view !== 'side';
  $('#renderer').value = state.renderer;
  $('#seek').max = Math.round(state.duration * 1000);
  const svg = state.renderer === 'svg' && state.view === 'side' && state.mode !== 'rive';
  $('#svg-output').hidden = !svg;
  result.hidden = svg;
}

function setPlaying(on) { state.playing = on; state.last = null; controls(); }
function fitStage() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(180, Math.round(reference.getBoundingClientRect().width * dpr));
  const height = Math.round(width * H / W);
  for (const canvas of [reference, result, pupCanvas]) {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }
}
function clear(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.resetTransform(); ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}
function logicalContext(canvas) {
  const ctx = clear(canvas);
  ctx.scale(canvas.width / W, canvas.height / H);
  return ctx;
}

function sourceViews() {
  const strip = $('#source-views');
  strip.replaceChildren(); strip.hidden = !current?.views;
  if (!current?.views) return;
  current.views.forEach((view, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('aria-label', 'Show original ' + view.label.toLowerCase());
    button.setAttribute('aria-pressed', String(index === current.sourceView));
    const image = document.createElement('img'); image.src = view.url; image.alt = '';
    const label = document.createElement('span'); label.textContent = view.label;
    button.append(image, label);
    button.addEventListener('click', () => {
      setPlaying(false); current.sourceView = index;
      [...strip.children].forEach((node, i) => node.setAttribute('aria-pressed', String(i === index)));
      render();
    });
    strip.append(button);
  });
}
function frameAt(time) {
  const frames = current?.timing?.frames;
  if (!frames) return Math.round(time * 60);
  let index = frames.length - 1;
  while (index > 0 && frames[index].start > time * 1000 + 0.002) index--;
  return index;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const card = { x: 124, y: 48, w: 202, h: 262 };
function drawBook(ctx) {
  ctx.save();
  roundRect(ctx, card.x + 3, card.y + 5, card.w, card.h, 13);
  ctx.fillStyle = '#c3cbb6'; ctx.fill();
  roundRect(ctx, card.x, card.y, card.w, card.h, 13);
  ctx.fillStyle = '#dce8cc'; ctx.fill();
  ctx.fillStyle = '#769260'; ctx.fillRect(card.x, card.y + 13, 14, card.h - 26);
  ctx.fillStyle = '#70845d'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('A LITTLE', card.x + card.w / 2 + 5, card.y + 113);
  ctx.font = '700 25px system-ui'; ctx.fillText('STORY', card.x + card.w / 2 + 5, card.y + 146);
  ctx.strokeStyle = '#a7ba94'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(card.x + 62, card.y + 174); ctx.lineTo(card.x + 150, card.y + 174); ctx.stroke();
  ctx.restore();
}
function peekPose(spec) {
  const k = card.h * 0.8 / spec.height;
  return { x: card.x + card.w - 140 * k, y: card.y + (card.h - spec.height * k) / 2, k };
}

function render() {
  if (!current || state.loading) return;
  fitStage();
  const { pup } = current;
  let placement;
  const index = frameAt(state.time);
  if (state.mode === 'rive') {
    const spec = manifest.peek[state.character], pose = peekPose(spec);
    placement = pose;
    const layers = current.rive.render(state.time);
    const left = logicalContext(reference);
    left.drawImage(layers[0], pose.x, pose.y, spec.width * pose.k, spec.height * pose.k);
    drawBook(left);
    left.drawImage(layers[1], pose.x, pose.y, spec.width * pose.k, spec.height * pose.k);
    const right = logicalContext(pupCanvas);
    poseAt(pup, state.time);
    for (const layer of [0, 1]) {
      if (layer === 1) drawBook(right);
      right.save(); right.translate(pose.x, pose.y); right.scale(pose.k, pose.k);
      drawCanvas(pup, right, { layer, wireframe: state.wire }); right.restore();
    }
  } else {
    const left = logicalContext(reference);
    if (current.views) {
      const index = current.sourceView, view = current.views[index], framing = current.framing;
      const height = H * framing.height, width = height * view.width / view.height;
      left.drawImage(current.images[index], (W - width) / 2, H * framing.top, width, height);
      $('#source-title').textContent = 'Original SVG · ' + view.label;
    } else if (current.timing) {
      const timing = current.timing;
      if (frameSource !== current.image || copiedFrame !== index) {
        if (frameCanvas.width !== timing.width || frameCanvas.height !== timing.height) {
          frameCanvas.width = timing.width; frameCanvas.height = timing.height;
        }
        const ctx = frameCanvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0,0,timing.width,timing.height);
        ctx.drawImage(current.image,(index%timing.columns)*timing.width,Math.floor(index/timing.columns)*timing.height,
          timing.width,timing.height,0,0,timing.width,timing.height);
        frameSource = current.image; copiedFrame = index;
      }
      left.drawImage(frameCanvas, 0, 0, W, H);
    } else left.drawImage(current.image, 0, 0, W, H);
    const k = Math.min(W/pup.art.w,H/pup.art.h);
    placement = {k,x:(W-pup.art.w*k)/2,y:(H-pup.art.h*k)/2};
    const options = {clip:state.action,wireframe:state.wire};
    renderCanvas(pup, pupCanvas, state.time, options);
    if (state.renderer === 'svg') current.svg.render(state.time, options);
  }
  const ctx = clear(result);
  if (state.view === 'overlay') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
    ctx.drawImage(reference, 0, 0); ctx.drawImage(pupCanvas, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  } else if (state.view === 'diff') {
    const a = reference.getContext('2d').getImageData(0, 0, reference.width, reference.height).data;
    const b = pupCanvas.getContext('2d').getImageData(0, 0, pupCanvas.width, pupCanvas.height).data;
    const output = ctx.createImageData(result.width, result.height);
    for (let i = 0; i < a.length; i += 4) {
      let error = 0;
      for (let channel = 0; channel < 3; channel++) {
        const x = a[i + channel] * a[i + 3] / 255 + 255 - a[i + 3];
        const y = b[i + channel] * b[i + 3] / 255 + 255 - b[i + 3];
        error = Math.max(error, Math.abs(x - y));
      }
      const k = Math.min(1, error / 55);
      output.data[i] = 249; output.data[i + 1] = Math.round(248 - k * 143);
      output.data[i + 2] = Math.round(242 - k * 171); output.data[i + 3] = 255;
    }
    ctx.putImageData(output, 0, 0);
  } else ctx.drawImage(pupCanvas, 0, 0);
  $('#seek').value = Math.round(state.time * 1000);
  $('#time').textContent = state.time.toFixed(3) + ' / ' + state.duration.toFixed(3) + ' s';
  $('#frame-label').textContent = current.timing ? 'FRAME ' + String(index + 1).padStart(2, '0') + ' / ' + current.timing.frameCount : 'CONTINUOUS VECTOR MOTION';
  $('#phase').textContent = current.phase || (state.mode === 'rive' ? 'Card peek' : state.action === 'wrong' ? 'Squint · shake · reset' : 'Anticipate · smile · celebrate');
  $('#pup-title').textContent = ({ side: current.title || 'Vector reconstruction', overlay: 'Source × PUP', diff: 'Rendered pixel difference' })[state.view];
  $('#pup-format').textContent = state.view === 'side' ? 'PUP / ' + state.renderer.toUpperCase() : state.view === 'overlay' ? '50% / 50%' : 'PIXEL DIFFERENCE';
  inspector.render({width:W,height:H,placement});
}

async function select() {
  const version = ++loadVersion;
  state.loading = true; state.time = 0; state.last = null; state.direction = 1;
  const example = selectedCase();
  if (example) { state.character = example.character; state.action = example.clip; }
  else if (!['correct','wrong'].includes(state.action)) state.action = 'correct';
  $('#loading').hidden = false; $('#error').hidden = true;
  $('#download').removeAttribute('href');
  $('#download').setAttribute('aria-disabled', 'true');
  if (state.mode === 'webp') state.character = 'fox';
  if (state.mode === 'skin') state.character = 'raccoon';
  if (state.mode === 'rive') {
    state.renderer = 'canvas';
    if (!manifest.peek[state.character]) state.character = 'fox';
  }
  if (!example) $('#fidelity-note').textContent = 'Some shapes were intentionally cleaned up: round eyes, smooth smiles and continuous expressions. Pixel differences also include rasterization.';
  controls();
  let next;
  try {
    if (example) {
      const views = example.reference.views;
      const [pup,images] = await Promise.all([loadPup(example.pup.url),
        Promise.all((views ? views.map(view => view.url) : [example.reference.sheet]).map(loadImage))]);
      if (version !== loadVersion) return;
      next = {pup,image:images[0],images,views,sourceView:0,framing:example.reference.framing,
        timing:views ? null : example.reference,svg:createSvgRenderer(pup),bones:example.bones,title:example.title,phase:example.phase,inspection:example.inspection};
      state.duration = example.duration;
      $('#source-title').textContent = views ? 'Original SVG views' : 'Original animation';
      $('#source-format').textContent = views ? '7 SVG VIEWS' : 'WEBP';
      $('#source-size').textContent = size(example.reference.original.bytes);
      $('#source-caption').textContent = views ? 'Seven static SVG files · artwork only' : 'Original WebP file';
      $('#pup-size').textContent = size(example.pup.bytes);
      $('#pup-caption').textContent = 'One ' + example.clip + ' action · ' + example.duration.toFixed(3) + ' s';
      $('#download').href = example.pup.url;
      $('#comparison-note').textContent = example.note;
      $('#geometry').textContent = pup.art.shapes.length + ' shapes · ' + (example.bones ? Object.keys(example.bones).length + ' joints' : 'vector motion');
      $('#fidelity-note').textContent = views ? 'The original seven SVGs are static views. PUP adds continuous motion and rig data. The source size excludes HTML, base64 and player code.' : 'The approved animation file is preserved. Differences include artwork choices, vector reconstruction and rasterization.';
    } else if (state.mode === 'rive') {
      const spec = manifest.peek[state.character];
      const [pup, rive] = await Promise.all([loadPup(spec.pup.url), RiveReference.create(spec, manifest.runtime.rive)]);
      next = { pup, rive, inspection:spec.inspection };
      if (version !== loadVersion) { rive.dispose(); return; }
      state.duration = spec.duration;
      $('#source-title').textContent = 'Original Rive artboards';
      $('#source-format').textContent = 'RIVE / CANVAS';
      $('#source-size').textContent = size(spec.body.bytes + spec.hand.bytes);
      $('#source-caption').textContent = 'Body + hand · two original .riv files';
      $('#pup-size').textContent = size(spec.pup.bytes);
      $('#pup-caption').textContent = 'One .pup · two render layers';
      $('#download').href = spec.pup.url;
      $('#comparison-note').textContent = 'The original body and hand state machines run beside the PUP reconstruction on one clock. Both use the same card and artboard placement. Rive loads only for this comparison.';
      $('#geometry').textContent = pup.art.shapes.length + ' shapes · 2 card layers';
    } else {
      const spec = manifest.quiz[state.character], action = spec.actions[state.action];
      const [pup, image] = await Promise.all([loadPup(spec.pup.url), loadImage(state.mode === 'webp' ? action.reference.sheet : spec.artwork.url)]);
      if (version !== loadVersion) return;
      next = { pup, image, timing: state.mode === 'webp' ? action.reference : null, svg: createSvgRenderer(pup), inspection:spec.inspection };
      state.duration = durationOf(pup, state.action);
      $('#source-title').textContent = state.mode === 'webp' ? 'Original animation' : 'Original SVG artwork';
      $('#source-format').textContent = state.mode === 'webp' ? 'WEBP' : 'SVG / FINAL POSE';
      $('#source-size').textContent = size(state.mode === 'webp' ? action.reference.original.bytes : spec.artwork.bytes);
      $('#source-caption').textContent = state.mode === 'webp' ? 'Selected action · original WebP bytes' : 'One static pose · source geometry';
      $('#pup-size').textContent = size(spec.pup.bytes);
      $('#pup-caption').textContent = 'Correct + wrong · one PUP file';
      $('#download').href = spec.pup.url;
      $('#comparison-note').textContent = state.mode === 'webp'
        ? 'The PUP includes both actions; the WebP above is the selected action only. Scrubbing uses lossless extracted frames. File sizes refer to the original files, not the scrubber sheet.'
        : 'This raccoon uses a different SVG skin with the same two action timings. Its reference is a static final pose; no raccoon WebP was supplied.';
      $('#geometry').textContent = spec.shapes + ' shapes · ' + spec.animatedVertices + ' morph vertices';
    }
    if (version !== loadVersion) { next.rive?.dispose(); next.svg?.dispose(); return; }
    current?.rive?.dispose(); current?.svg?.dispose();
    current = next;
    inspector.setTarget(next.pup, next.inspection);
    frameSource = null; copiedFrame = -1;
    sourceViews();
    $('#svg-output').replaceChildren(...(next.svg ? [next.svg.svg] : []));
    $('#download').download = example ? example.id + (example.id === 'bird-turn' ? '.puc' : '.pup') : state.character + '-' + (state.mode === 'rive' ? 'peek' : 'reactions') + '.pup';
    $('#download').textContent = example?.id === 'bird-turn' ? '↓ Download PUC' : '↓ Download PUP';
    const url = new URL(location.href); url.searchParams.set('example',state.mode); history.replaceState(null,'',url);
    // Large reference sheets are only retained for the active comparison.
    const activeImages = new Set(example?.reference.views?.map(view => view.url) || [example?.reference.sheet ||
      (state.mode === 'webp' ? manifest.quiz.fox.actions[state.action].reference.sheet : state.mode === 'skin' ? manifest.quiz.raccoon.artwork.url : null)]);
    for (const key of imageCache.keys()) if (!activeImages.has(key)) imageCache.delete(key);
    $('#download').setAttribute('aria-label', 'Download ' + $('#download').download);
    $('#download').removeAttribute('aria-disabled');
    state.loading = false; $('#loading').hidden = true;
    controls(); render();
  } catch (error) {
    next?.rive?.dispose(); next?.svg?.dispose();
    if (version !== loadVersion) return;
    state.loading = false; state.playing = false; $('#loading').hidden = true;
    $('#error').hidden = false; $('#error').textContent = error.message;
    controls(); console.error(error);
  }
}

$$('[data-mode]').forEach(button => button.addEventListener('click', () => {
  state.mode = button.dataset.mode; void select();
}));
$$('[data-action]').forEach(button => button.addEventListener('click', () => {
  state.action = button.dataset.action; void select();
}));
$('#character').addEventListener('change', event => { state.character = event.target.value; void select(); });
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  state.view = button.dataset.view; controls(); render();
}));
$('#renderer').addEventListener('change', event => { state.renderer = event.target.value; controls(); render(); });
$('#bones').addEventListener('change', event => { state.bones = event.target.checked; inspector.toggle(state.bones); render(); });
$('#wire').addEventListener('change', event => { state.wire = event.target.checked; render(); });
$('#loop').addEventListener('change', event => { state.loop = event.target.checked; });
$('#speed').addEventListener('change', event => { state.speed = Number(event.target.value); state.last = null; });
$('#play').addEventListener('click', () => {
  if (state.direction === 1 && state.time >= state.duration) state.time = 0;
  if (state.direction === -1 && state.time <= 0) state.time = state.duration;
  setPlaying(!state.playing);
});
$('#restart').addEventListener('click', () => { state.direction = 1; state.time = 0; setPlaying(true); render(); });
$('#reverse').addEventListener('click', () => { state.time = state.duration; state.direction = -1; setPlaying(true); render(); });
$('#seek').addEventListener('input', event => { setPlaying(false); state.time = Number(event.target.value) / 1000; render(); });
function step(direction) {
  setPlaying(false);
  if (current?.timing) {
    const index = Math.max(0, Math.min(current.timing.frameCount - 1, frameAt(state.time) + direction));
    state.time = current.timing.frames[index].start / 1000;
  } else state.time = Math.max(0, Math.min(state.duration, state.time + direction / 60));
  render();
}
$('#previous').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
$('#background').addEventListener('click', () => {
  const list = ['warm', 'white', 'dark', 'grid'], node = $('#stages');
  node.dataset.background = list[(list.indexOf(node.dataset.background) + 1) % list.length];
});
window.addEventListener('keydown', event => {
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); $('#play').click(); }
  if (event.code === 'ArrowLeft') step(-1);
  if (event.code === 'ArrowRight') step(1);
});
new ResizeObserver(() => render()).observe($('#stages'));
document.addEventListener('visibilitychange', () => { state.last = null; });
window.addEventListener('pagehide', () => { current?.rive?.dispose(); });
function tick(now) {
  if (state.playing && !state.loading) {
    if (state.last != null) state.time += Math.min(0.1, (now - state.last) / 1000) * state.speed * state.direction;
    if ((state.direction === 1 && state.time >= state.duration) || (state.direction === -1 && state.time <= 0)) {
      if (state.loop) state.time = state.direction === 1 ? state.time % state.duration : state.duration;
      else { state.time = state.direction === 1 ? state.duration : 0; setPlaying(false); }
    }
    state.last = now; render();
  }
  requestAnimationFrame(tick);
}
await select();
$('.lab').inert = false;
$('.lab').setAttribute('aria-busy', 'false');
if (new URLSearchParams(location.search).has('debug')) {
  window.__pupDemo = { state, manifest, get current() { return current; }, render };
}
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true);
requestAnimationFrame(tick);

}
main().catch(error => {
  document.querySelector('.lab').inert = false;
  document.querySelector('.lab').setAttribute('aria-busy', 'false');
  document.querySelector('#loading').hidden = true;
  document.querySelector("#error").hidden = false;
  document.querySelector("#error").textContent = error.message;
  console.error(error);
});
