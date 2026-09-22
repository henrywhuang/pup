import { decodePup } from './format.js';
import {parsePuc} from './puc.js';
import {parsePreview} from './preview.js';
import {drawSkeleton} from './skeleton.js';
import { createRig, restart, seek, solve, startClip } from './rig.js';

const rgba = value => 'rgba(' + (value >>> 16 & 255) + ',' + (value >>> 8 & 255) +
  ',' + (value & 255) + ',' + ((value >>> 24) / 255) + ')';

/** Decode bytes or a base64 string into an independent, playable puppet. */
export function parsePup(input) {
  let encoded = input;
  if (typeof input !== 'string') {
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let raw = '';
    for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    encoded = btoa(raw);
  }
  const art = decodePup(encoded);
  return { art, rig: createRig(art), activeClip: null, revision: 0 };
}

export async function loadPup(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('PUP request failed: HTTP ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 60) return parsePreview(new TextDecoder().decode(bytes));
  return bytes[0] === 80 && bytes[1] === 85 && bytes[2] === 67 && bytes[3] === 49
    ? parsePuc(bytes) : parsePup(bytes);
}

export function durationOf(puppet, clip = null) {
  const { clock } = puppet.art;
  if (clip != null) {
    const action = clock.clips.find(c => c.name === clip);
    if (!action) throw new Error('Unknown PUP clip: ' + clip);
    return action.duration;
  }
  return clock.play.reduce((total, step) =>
    total + (step.cut >= 0 ? step.cut : clock.clips[step.clip].duration), 0);
}

export function poseAt(puppet, seconds, clip = null) {
  if (!Number.isFinite(seconds)) throw new Error('PUP time must be finite');
  if (puppet.activeClip !== clip) {
    if (clip == null) restart(puppet.rig);
    else if (!startClip(puppet.rig, clip)) throw new Error('Unknown PUP clip: ' + clip);
    puppet.activeClip = clip;
  }
  // Key times are float32 in the file; keep an exact-ms scrubber on its key.
  seek(puppet.rig, Math.max(0, seconds) + 1e-7);
  solve(puppet.rig);
  puppet.revision++;
  return puppet;
}

function pathFor(geometry, points) {
  const path = new Path2D();
  if (geometry.verts) {
    const n = points.length / 6;
    path.moveTo(points[0], points[1]);
    for (let i = 0; i < (geometry.closed ? n : n - 1); i++) {
      const a = i * 6, b = ((i + 1) % n) * 6;
      path.bezierCurveTo(points[a + 4], points[a + 5], points[b + 2], points[b + 3], points[b], points[b + 1]);
    }
    if (geometry.closed) path.closePath();
  } else {
    let offset = 0;
    for (const verb of geometry.verbs) {
      const p = geometry.points;
      if (verb === 0) path.moveTo(p[offset], p[offset + 1]);
      else if (verb === 1) path.lineTo(p[offset], p[offset + 1]);
      else if (verb === 2) path.bezierCurveTo(...p.subarray(offset, offset + 6));
      else path.closePath();
      offset += [2, 2, 6, 0][verb];
    }
  }
  return path;
}

/** Draw a solved pose in artboard coordinates; the host owns the transform. */
export function drawCanvas(puppet, ctx, { layer = null, wireframe = false, bones = null } = {}) {
  const { art, rig } = puppet;
  puppet.staticPaths ??= art.geoms.map(g => g.verts || g.poses ? null : pathFor(g, null));
  if (puppet.pathRevision !== puppet.revision) {
    puppet.posePaths ??= art.geoms.map(g => g.poses ? new Map() : null);
    puppet.paths = art.geoms.map((g, i) => {
      if (!g.poses) return puppet.staticPaths[i] ?? pathFor(g, rig.points[i]);
      const index = rig.poseIndices[i], cache = puppet.posePaths[i];
      if (!cache.has(index)) cache.set(index, pathFor(g.poses[index], null));
      return cache.get(index);
    });
    puppet.pathRevision = puppet.revision;
  }
  const paths = puppet.paths;
  art.shapes.forEach((shape, i) => {
    if (layer != null && shape.layer !== layer) return;
    ctx.save();
    for (const index of shape.clips) {
      const clip = art.clips[index], source = art.shapes[clip.source];
      const path = new Path2D();
      path.addPath(paths[source.geom], new DOMMatrix(Array.from(rig.matrix.subarray(clip.source * 6, clip.source * 6 + 6))));
      ctx.clip(path, clip.evenOdd ? 'evenodd' : 'nonzero');
    }
    ctx.transform(...rig.matrix.subarray(i * 6, i * 6 + 6));
    if (rig.fillColor[i]) {
      ctx.fillStyle = rgba(rig.fillColor[i]);
      ctx.fill(paths[shape.geom], shape.evenOdd ? 'evenodd' : 'nonzero');
    }
    if (shape.stroke && rig.strokeColor[i]) {
      ctx.strokeStyle = rgba(rig.strokeColor[i]);
      ctx.lineWidth = shape.stroke[1];
      ctx.lineCap = ['butt', 'round', 'square'][shape.stroke[2]];
      ctx.lineJoin = ['miter', 'round', 'bevel'][shape.stroke[3]];
      ctx.stroke(paths[shape.geom]);
    }
    if (wireframe) {
      ctx.strokeStyle = '#316b7caa';
      ctx.lineWidth = 0.6;
      ctx.stroke(paths[shape.geom]);
    }
    ctx.restore();
  });
  if (bones) drawSkeleton(puppet, ctx, bones);
}

export function renderCanvas(puppet, canvas, seconds, { clip = null, ...options } = {}) {
  poseAt(puppet, seconds, clip);
  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const k = Math.min(canvas.width / puppet.art.w, canvas.height / puppet.art.h);
  ctx.translate((canvas.width - puppet.art.w * k) / 2, (canvas.height - puppet.art.h * k) / 2);
  ctx.scale(k, k);
  drawCanvas(puppet, ctx, options);
  ctx.resetTransform();
}
