/**
 * pup — the puppet tool. A .pup is one animated character as the app draws
 * it: Skia path verbs and points, transform nodes, paints, clips, and
 * keyframe tracks over the numbers that move, in one little-endian byte
 * layout the runtime reads with typed views (screens/home/critter/
 * critterFormat.ts has the layout; critterRig.ts evaluates it). The .pup files
 * under src/assets/critter/ are the animations; Metro embeds them straight
 * into the bundle (tools/pup-transformer.js).
 *
 *   node bin/pup.mjs import <art.svg> <motion.json> <out.pup>
 *   node bin/pup.mjs dump <file.pup>
 *
 * `import` builds a puppet from an SVG plus a motion file — the way a new
 * character comes in from a design tool; `dump` prints one back as text.
 *
 * The SVG is the art, in ordinary SVG terms plus three attributes of our own:
 *   data-follow="<id>" data-follow-at="<0..1>"   this shape sits on the
 *       outline of shape <id>, at a fraction of its length, turned along it
 *   data-bend="<id> <id>" data-bend-bind="..." data-bend-weights="..."
 *       the path is carried by these pivot groups: every point is placed by
 *       each pivot from where it stood when the weights were painted
 *       (bind: one path→pivot frame per pivot) and blended by its weights
 *       (per vertex: point, in handle, out handle)
 *   clip-path sources are taken in artboard space, wherever the source lives.
 * Element transforms must be `translate(x y) rotate(deg) scale(sx sy)` in
 * that order (any part may be missing): those are the animatable channels.
 *
 * The motion file keys element ids by frame; each clip names its frame
 * rate in wall-clock terms (fps) and its length (frames):
 *   tracks.<id>.<channel> = [[frame, value, ease?], ...]
 *   channels: tx ty rotate sx sy opacity follow, and per vertex i of an
 *   animated path: v<i>.x v<i>.y, its handles as v<i>.angle + v<i>.len (one
 *   handle mirrored through the point), v<i>.angle + v<i>.in.len +
 *   v<i>.out.len (one direction, two lengths) or v<i>.in.angle v<i>.in.len
 *   v<i>.out.angle v<i>.out.len (two free handles); ease is "hold", "ease"
 *   (the standard ease-in-out), "cubic(x1,y1,x2,y2)" or
 *   "elastic(amplitude,period)", linear when absent; play = [{clip, cut?},
 *   ...]: each clip runs until its cut (seconds) or, without one, to its
 *   end. Clips are also playable on demand by name (critterRig startClip).
 *
 * Anything outside this feature set fails the import loudly — extend this
 * file when the art gains a feature, never silently drop ink.
 *
 * @format
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unpackPup} from '../src/compact.js';
import { expandTurns } from './pup-turn.mjs';
import { optimizeKeys, flattenTranslations, reuseParentNode, shareTwinTracks } from './pup-optimize.mjs';

const LAYERS = ['behind', 'front'];
const RAD = Math.PI / 180;

const fail = (name, msg) => {
  throw new Error(`[pup] ${name}: ${msg}`);
};

// ---- tiny XML walk (elements only; the sources carry no text) --------------

function parseAttrs(s) {
  const attrs = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

function parseXml(svg) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g;
  for (const m of svg.matchAll(re)) {
    if (m[1] === '/') {
      stack.pop();
      continue;
    }
    const el = { tag: m[2], attrs: parseAttrs(m[3]), children: [] };
    stack[stack.length - 1].children.push(el);
    if (m[4] !== '/') stack.push(el);
  }
  return root;
}

// ---- attribute parsers -----------------------------------------------------

/** translate(x y) rotate(deg) scale(sx sy), in that order, each optional. */
function parseTransform(name, id, s) {
  const rest = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
  if (!s) return rest;
  const order = ['translate', 'rotate', 'scale'];
  let next = 0;
  for (const t of s.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    const k = order.indexOf(t[1]);
    if (k < next) fail(name, `#${id}: transform must be translate·rotate·scale, got "${s}"`);
    next = k + 1;
    if (t[1] === 'translate') [rest.tx, rest.ty] = [v[0], v[1] ?? 0];
    else if (t[1] === 'rotate') {
      if (v.length !== 1) fail(name, `#${id}: rotate about a point is not supported`);
      rest.rot = v[0] * RAD;
    } else [rest.sx, rest.sy] = [v[0], v[1] ?? v[0]];
  }
  return rest;
}

function parseColor(name, id, s, opacity) {
  if (!s || s === 'none') return 0;
  const m = s.match(/^#([0-9a-f]{6})$/i);
  if (!m) fail(name, `#${id}: colour must be #rrggbb, got "${s}"`);
  const a = Math.round(255 * (opacity === undefined ? 1 : Number(opacity)));
  return ((a << 24) | parseInt(m[1], 16)) >>> 0;
}

/** d → vertices with polar handles: [x, y, inAngle, inLen, outAngle, outLen] each. */
function parseVertices(name, id, d) {
  const tokens = d.match(/[MCLZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const verts = [];
  let closed = false;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      if (verts.length) fail(name, `#${id}: one subpath per animated path`);
      verts.push({ p: [num(), num()], in: null, out: null });
    } else if (cmd === 'C') {
      const c1 = [num(), num()];
      const c2 = [num(), num()];
      const p = [num(), num()];
      verts[verts.length - 1].out = c1;
      verts.push({ p, in: c2, out: null });
    } else if (cmd === 'L') {
      const p = [num(), num()];
      const prev = verts[verts.length - 1];
      prev.out = prev.p;
      verts.push({ p, in: p, out: null });
    } else if (cmd === 'Z') {
      closed = true;
      if (i !== tokens.length) fail(name, `#${id}: Z must end the path`);
    } else fail(name, `#${id}: unsupported path command "${cmd}" (M, C, L, Z absolute only)`);
  }
  if (closed) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (Math.hypot(last.p[0] - first.p[0], last.p[1] - first.p[1]) > 1e-3)
      fail(name, `#${id}: a closed animated path must end on its first vertex`);
    first.in = last.in;
    verts.pop();
  }
  const polar = (p, h) =>
    h == null ? [0, 0] : [Math.atan2(h[1] - p[1], h[0] - p[0]), Math.hypot(h[0] - p[0], h[1] - p[1])];
  return {
    closed,
    verts: verts.flatMap(v => [...v.p, ...polar(v.p, v.in), ...polar(v.p, v.out)]),
  };
}

/** Absolute M/L/C/Z path data → packed verbs (0 M, 1 L, 2 C, 3 Z) and points. */
function packPath(name, id, d) {
  const tokens = d.match(/[MCLZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const verbs = [];
  const points = [];
  let i = 0;
  const take = n => {
    for (let k = 0; k < n; k++) points.push(Number(tokens[i++]));
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const verb = { M: 0, L: 1, C: 2, Z: 3 }[cmd];
    if (verb === undefined) fail(name, `#${id}: unsupported path command "${cmd}" (M, C, L, Z absolute only)`);
    verbs.push(verb);
    take([2, 2, 6, 0][verb]);
  }
  return { verbs, points };
}

function parseEase(name, s) {
  if (s === undefined) return [0];
  if (s === 'hold') return [1];
  if (s === 'ease') return [2, 0.42, 0, 0.58, 1];
  let m = s.match(/^cubic\(([^)]*)\)$/);
  if (m) return [2, ...m[1].split(',').map(Number)];
  m = s.match(/^elastic\(([^)]*)\)$/);
  if (m) return [3, ...m[1].split(',').map(Number)];
  return fail(name, `unknown easing "${s}"`);
}

// ---- per-critter compile ---------------------------------------------------

function compile(svgPath, motionPath) {
  const name = path.basename(svgPath instanceof URL ? fileURLToPath(svgPath) : svgPath);
  const svg = parseXml(fs.readFileSync(svgPath, 'utf8'));
  let motion = JSON.parse(fs.readFileSync(motionPath, 'utf8'));
  const root = svg.children.find(el => el.tag === 'svg') ?? fail(name, 'no <svg>');
  const [, , w, h] = (root.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) fail(name, 'viewBox must be "0 0 w h"');

  const byId = new Map();
  (function index(el) {
    if (el.attrs.id) {
      if (byId.has(el.attrs.id)) fail(name, `duplicate id #${el.attrs.id}`);
      byId.set(el.attrs.id, el);
    }
    el.children.forEach(index);
  })(root);
  motion = expandTurns(motion, id => {
    const el = byId.get(id) ?? fail(name, `turn targets unknown node #${id}`);
    return { ...parseTransform(name, id, el.attrs.transform), opacity: Number(el.attrs.opacity ?? 1) };
  });
  optimizeKeys(motion);
  flattenTranslations(root, motion, el => parseTransform(name, el.attrs.id, el.attrs.transform));
  const clipDefs = new Map(); // clipPath id -> { source id, evenOdd }
  for (const defs of root.children.filter(el => el.tag === 'defs'))
    for (const cp of defs.children) {
      if (cp.tag !== 'clipPath') fail(name, `unsupported <${cp.tag}> in <defs>`);
      const use = cp.children[0];
      if (cp.children.length !== 1 || use.tag !== 'use' || !use.attrs.href?.startsWith('#'))
        fail(name, `<clipPath id="${cp.attrs.id}"> must hold exactly one <use href="#id">`);
      clipDefs.set(cp.attrs.id, { source: use.attrs.href.slice(1), evenOdd: cp.attrs['clip-rule'] === 'evenodd' });
    }

  const nodeParent = [-1];
  const nodeRest = [0, 0, 0, 1, 1, 1];
  const nodeOf = new Map(); // element id -> node index
  const shapes = [];
  const geoms = [];
  const clips = [];
  const clipIndex = new Map();
  const shapeOf = new Map(); // element id -> shape index
  const geomVerts = []; // per geom: vertex count (0 = static)
  const pending = []; // follow/bend/clip references, resolved after the walk
  const poseControllers = new Map();
  // Followers measure their target's outline and clips are cut from their
  // source's outline every frame, so both are compiled as vertices even
  // when nothing animates them.
  const outlined = new Set([...clipDefs.values()].map(def => def.source));
  (function scan(el) {
    if (el.attrs['data-follow']) outlined.add(el.attrs['data-follow']);
    el.children.forEach(scan);
  })(root);

  const addNode = (el, parent) => {
    const id = el.attrs.id;
    const t = parseTransform(name, id, el.attrs.transform);
    const i = nodeParent.length;
    nodeParent.push(parent);
    nodeRest.push(t.tx, t.ty, t.rot, t.sx, t.sy, el.attrs.opacity === undefined ? 1 : Number(el.attrs.opacity));
    if (id) nodeOf.set(id, i);
    return i;
  };

  const walk = (el, parent, layer, clipStack) => {
    for (const child of el.children) {
      const id = child.attrs.id;
      const stack = child.attrs['clip-path'] ? [...clipStack, child.attrs['clip-path']] : clipStack;
      const attached = child.attrs['data-parent'];
      const transformParent = attached
        ? (nodeOf.get(attached) ?? fail(name, `data-parent #${attached} must be declared before #${id}`))
        : parent;
      if (child.tag === 'g') {
        walk(child, addNode(child, transformParent), layer, stack);
      } else if (child.tag === 'path') {
        const reuse = reuseParentNode(child, motion, el => parseTransform(name, el.attrs.id, el.attrs.transform));
        const node = reuse ? transformParent : addNode(child, transformParent);
        if (reuse && id) nodeOf.set(id, node);
        const a = child.attrs;
        const shapeId = id ?? elIdOfSplit(el);
        const dynamic =
          a['data-bend'] !== undefined || outlined.has(shapeId) || motionTouchesVertices(motion, shapeId);
        const geom = geoms.length;
        const bank = motion.poseBanks?.[shapeId];
        if (bank) {
          if (a['data-bend'] || a['data-follow']) fail(name, `#${id}: a pose bank cannot also bend/follow`);
          if (!bank.controller || !Array.isArray(bank.frames) || !bank.frames.length) fail(name, `#${id}: invalid pose bank`);
          const quantum = bank.quantum ?? .0625;
          if (!(quantum > 0)) fail(name, `#${id}: invalid pose quantum`);
          if (bank.cubic !== undefined && typeof bank.cubic !== 'boolean') fail(name, `#${id}: cubic pose flag must be boolean`);
          const stride = bank.cubic ? 6 : 2;
          for (const frame of bank.frames) for (const contour of frame) {
            if (contour.length < (bank.cubic ? 12 : 6) || contour.length % stride) fail(name, `#${id}: invalid closed pose contour`);
            for (const value of contour) if (!Number.isFinite(value) || Math.abs(Math.round(value / quantum)) > 32767) fail(name, `#${id}: pose coordinate out of range`);
          }
          geoms.push({ poses: bank.frames, cubic: !!bank.cubic, compact: !!bank.compact, quantum, controller: bank.controller, slot: -1 });
          geomVerts.push(0);
        } else if (dynamic) {
          const v = parseVertices(name, id ?? el.attrs.id, a.d);
          geoms.push({ verts: v.verts, closed: v.closed, slot: -1 });
          geomVerts.push(v.verts.length / 6);
        } else {
          geoms.push(packPath(name, id ?? el.attrs.id, a.d));
          geomVerts.push(0);
        }
        const cap = { butt: 0, round: 1, square: 2 }[a['stroke-linecap'] ?? 'butt'];
        const join = { miter: 0, round: 1, bevel: 2 }[a['stroke-linejoin'] ?? 'miter'];
        if (cap === undefined || join === undefined) fail(name, `#${id}: bad stroke cap/join`);
        const stroke = parseColor(name, id, a.stroke, a['stroke-opacity']);
        const shape = {
          node,
          layer,
          geom,
          fill: parseColor(name, id, a.fill, a['fill-opacity']),
          evenOdd: a['fill-rule'] === 'evenodd',
          stroke: stroke ? [stroke, Number(a['stroke-width'] ?? 1), cap, join] : null,
          clips: stack,
          follow: null,
          bend: null,
        };
        if (a['data-follow']) pending.push({ shape: shapes.length, follow: a['data-follow'], at: Number(a['data-follow-at'] ?? 0) });
        if (a['data-bend']) pending.push({ shape: shapes.length, bend: a['data-bend'], bind: a['data-bend-bind'], weights: a['data-bend-weights'] });
        // A split shape (<g id><path transform>) keys its vertices on the <g>.
        shapeOf.set(id ?? el.attrs.id, shapes.length);
        shapes.push(shape);
      } else fail(name, `unsupported <${child.tag}> inside the art`);
    }
  };
  const elIdOfSplit = el => (el.tag === 'g' && el.children.length === 1 ? el.attrs.id : undefined);

  const layerEls = LAYERS.map(l => byId.get(l) ?? fail(name, `no <g id="${l}">`));
  layerEls.forEach((el, layer) => walk(el, addNode(el, 0), layer, []));

  if (motion.optimize) {
    const unique = [], counts = [], remap = [], seen = new Map();
    geoms.forEach((g, i) => {
      const key = g.verts || g.poses ? null : JSON.stringify([g.verbs, g.points]);
      if (key !== null && seen.has(key)) remap[i] = seen.get(key);
      else { remap[i] = unique.length; if (key !== null) seen.set(key, unique.length); unique.push(g); counts.push(geomVerts[i]); }
    });
    geoms.splice(0, geoms.length, ...unique); geomVerts.splice(0, geomVerts.length, ...counts);
    for (const shape of shapes) shape.geom = remap[shape.geom];
  }

  // Slots: nodes first (6 each), then animated vertices (6 each), then follows.
  let slot = nodeParent.length * 6;
  geoms.forEach((g, i) => {
    if (geomVerts[i]) {
      g.slot = slot;
      slot += geomVerts[i] * 6;
    }
    if (g.poses) {
      const existing = poseControllers.get(g.controller);
      if (existing && existing.count !== g.poses.length) fail(name, `pose controller ${g.controller} has inconsistent frame counts`);
      if (!existing) poseControllers.set(g.controller, { slot: slot++, count: g.poses.length });
      g.slot = poseControllers.get(g.controller).slot;
    }
  });
  for (const p of pending) {
    const shape = shapes[p.shape];
    if (p.follow) {
      const target = shapeOf.get(p.follow);
      if (target === undefined) fail(name, `data-follow target #${p.follow} is not a shape`);
      if (geoms[shapes[target].geom].poses) fail(name, 'followers cannot target a pose bank');
      shape.follow = { target, slot: slot++, at: p.at };
    } else {
      const pivots = p.bend.split(/\s+/).map(id => nodeOf.get(id) ?? fail(name, `data-bend pivot #${id} unknown`));
      const bind = p.bind.split(';').map(m => m.trim().split(/\s+/).map(Number));
      const weights = p.weights.split(';').map(v => v.trim().split(/\s+/).map(part => part.split(',').map(Number)));
      const n = geomVerts[shape.geom];
      if (bind.length !== pivots.length || bind.some(m => m.length !== 6)) fail(name, 'data-bend-bind: one 6-number frame per pivot');
      if (weights.length !== n || weights.some(v => v.length !== 3 || v.some(part => part.length !== pivots.length)))
        fail(name, `data-bend-weights: ${n} vertices × (point, in, out) × ${pivots.length} pivots`);
      shape.bend = { pivots, bind: bind.flat(), weights: weights.flat(2) };
    }
  }
  for (const shape of shapes) {
    shape.clips = shape.clips.map(ref => {
      const m = ref.match(/^url\(#([^)]+)\)$/);
      const def = m && clipDefs.get(m[1]);
      if (!def) fail(name, `clip-path ${ref} is not a <clipPath> in <defs>`);
      const source = shapeOf.get(def.source);
      if (source === undefined) fail(name, `<clipPath> source #${def.source} is not a shape`);
      const key = `${source}:${def.evenOdd}`;
      if (!clipIndex.has(key)) {
        clipIndex.set(key, clips.length);
        clips.push({ source, evenOdd: def.evenOdd });
      }
      return clipIndex.get(key);
    });
  }

  // Motion → slots.
  const slotFor = (id, prop) => {
    if (prop === 'pose') {
      const controller = poseControllers.get(id);
      if (!controller) fail(name, `unknown pose controller ${id}`);
      return [controller.slot, 1];
    }
    const node = nodeOf.get(id);
    const shape = shapeOf.get(id);
    const nodeProps = { tx: 0, ty: 1, rotate: 2, sx: 3, sy: 4, opacity: 5 };
    if (prop in nodeProps) {
      if (node === undefined) fail(name, `motion targets #${id}.${prop} but no element has that id`);
      return [node * 6 + nodeProps[prop], prop === 'rotate' ? RAD : 1];
    }
    if (shape === undefined) fail(name, `motion targets #${id}.${prop} but #${id} is not a shape`);
    if (prop === 'follow') {
      if (!shapes[shape].follow) fail(name, `#${id} has a follow track but no data-follow`);
      return [shapes[shape].follow.slot, 1];
    }
    const m = prop.match(/^v(\d+)\.(x|y|angle|len|in\.angle|in\.len|out\.angle|out\.len)$/);
    const geom = geoms[shapes[shape].geom];
    if (!m || geom.slot === undefined) fail(name, `#${id}.${prop} is not an animatable channel`);
    const k = Number(m[1]);
    if (k >= geomVerts[shapes[shape].geom]) fail(name, `#${id} has no vertex ${k}`);
    const base = geom.slot + k * 6;
    // Vertex channels: x y inAngle inLen outAngle outLen. A shared handle
    // channel writes the out handle and its twin, the in handle: `angle`
    // mirrors through the point (+π), `len` copies.
    if (m[2] === 'angle') return [base + 4, RAD, base + 2, Math.PI];
    if (m[2] === 'len') return [base + 5, 1, base + 3, 0];
    const part = ['x', 'y', 'in.angle', 'in.len', 'out.angle', 'out.len'].indexOf(m[2]);
    return [base + part, m[2].endsWith('angle') ? RAD : 1];
  };
  const clipNames = Object.keys(motion.clips);
  const clock = {
    clips: clipNames.map(clipName => {
      const clip = motion.clips[clipName];
      const eases = [];
      const easeIndex = new Map();
      const tracks = [];
      for (const [id, props] of Object.entries(clip.tracks))
        for (const [prop, keys] of Object.entries(props)) {
          const [s, scale, twin = -1, twinOffset = 0] = slotFor(id, prop);
          const track = [s, twin, twinOffset];
          let last = -1;
          for (const key of keys) {
            const [frame, v, ease] = key;
            if (prop === 'pose' && (!Number.isInteger(v) || v < 0 || v >= poseControllers.get(id).count)) fail(name, `#${id}: pose index out of range`);
            if (!(frame > last)) fail(name, `#${id}.${prop}: keyframes must be in frame order`);
            last = frame;
            const t = frame / clip.fps;
            const e = JSON.stringify(parseEase(name, prop === 'pose' ? 'hold' : ease));
            if (!easeIndex.has(e)) {
              easeIndex.set(e, eases.length);
              eases.push(JSON.parse(e));
            }
            track.push(t, v * scale, easeIndex.get(e));
          }
          tracks.push(track);
        }
      if (!(clip.fps > 0 && clip.frames > 0)) fail(name, `clip "${clipName}" needs fps and frames`);
      return { name: clipName, duration: clip.frames / clip.fps, tracks: motion.optimize ? shareTwinTracks(tracks) : tracks, eases };
    }),
    play: motion.play.map(step => {
      const clip = clipNames.indexOf(step.clip);
      if (clip < 0) fail(name, `play references unknown clip "${step.clip}"`);
      return { clip, cut: step.cut ?? -1 };
    }),
  };
  if (!clock.play.length) fail(name, 'play is empty');

  return { w, h, slots: slot, nodeParent, nodeRest, shapes, geoms, clips, clock,
    manifest: { nodes: Object.fromEntries(nodeOf), shapes: Object.fromEntries(shapeOf) } };
}

function motionTouchesVertices(motion, id) {
  return Object.values(motion.clips).some(clip =>
    Object.keys(clip.tracks[id] ?? {}).some(prop => prop.startsWith('v')),
  );
}

// ---- emit: .pup bytes, and critterArt.ts embedding them -------------------

/** Little-endian writer over a growing buffer. */
function writer() {
  let buf = new ArrayBuffer(1 << 16);
  let view = new DataView(buf);
  let at = 0;
  const need = n => {
    if (at + n <= buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(buf.byteLength * 2, at + n));
    new Uint8Array(next).set(new Uint8Array(buf, 0, at));
    buf = next;
    view = new DataView(buf);
  };
  return {
    u8: v => {
      need(1);
      view.setUint8(at, v);
      at += 1;
    },
    u16: v => {
      need(2);
      view.setUint16(at, v, true);
      at += 2;
    },
    i16: v => { need(2); view.setInt16(at, v, true); at += 2; },
    delta: v => { let n = ((v << 1) ^ (v >> 31)) >>> 0; do { need(1); view.setUint8(at++, (n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n); },
    u32: v => {
      need(4);
      view.setUint32(at, v >>> 0, true);
      at += 4;
    },
    f32: v => {
      need(4);
      view.setFloat32(at, v, true);
      at += 4;
    },
    bytes: () => new Uint8Array(buf, 0, at).slice(),
  };
}

function encodePup(a) {
  const w = writer();
  const cubicPool = new Map();
  const index = value => { do { w.u8((value & 127) | (value > 127 ? 128 : 0)); value >>>= 7; } while(value); };
  for (const c of a.geoms.some(g => g.poses) ? 'PUP2' : 'PUP1') w.u8(c.charCodeAt(0));
  w.u16(a.w);
  w.u16(a.h);
  w.u16(a.slots);
  w.u16(a.nodeParent.length);
  w.u16(a.shapes.length);
  w.u16(a.geoms.length);
  w.u16(a.clips.length);
  w.u8(a.clock.clips.length);
  w.u8(a.clock.play.length);
  a.nodeParent.forEach((parent, i) => {
    w.u16(parent < 0 ? 0xffff : parent);
    for (let k = 0; k < 6; k++) w.f32(a.nodeRest[i * 6 + k]);
  });
  for (const shape of a.shapes) {
    w.u16(shape.node);
    w.u8(shape.layer);
    w.u16(shape.geom);
    w.u32(shape.fill);
    w.u8((shape.evenOdd ? 1 : 0) | (shape.stroke ? 2 : 0) | (shape.follow ? 4 : 0) | (shape.bend ? 8 : 0));
    w.u8(shape.clips.length);
    shape.clips.forEach(c => w.u16(c));
    if (shape.stroke) {
      w.u32(shape.stroke[0]);
      w.f32(shape.stroke[1]);
      w.u8(shape.stroke[2]);
      w.u8(shape.stroke[3]);
    }
    if (shape.follow) {
      w.u16(shape.follow.target);
      w.u16(shape.follow.slot);
      w.f32(shape.follow.at);
    }
    if (shape.bend) {
      w.u8(shape.bend.pivots.length);
      shape.bend.pivots.forEach(p => w.u16(p));
      shape.bend.bind.forEach(v => w.f32(v));
      w.u16(shape.bend.weights.length);
      shape.bend.weights.forEach(v => w.f32(v));
    }
  }
  for (const geom of a.geoms) {
    if (geom.poses) {
      w.u8(2); w.u16(geom.slot); w.u16(geom.poses.length); w.f32(geom.quantum); w.u8(geom.cubic ? (geom.compact ? 3 : 2) : 1);
      const poseReferences=new Map();
      for (let poseIndex=0;poseIndex<geom.poses.length;poseIndex++) {
        const pose=geom.poses[poseIndex];
        if(geom.cubic&&geom.compact){
          if(!pose.length){index(0);continue;}
          const key=pose.map(c=>c.map(v=>Math.round(v/geom.quantum)).join(',')).join(';');
          if(poseReferences.has(key)){index((poseReferences.get(key)+1)*2);continue;}
          poseReferences.set(key,poseIndex);index(pose.length*2+1);
        }else w.u16(pose.length);
        for (const contour of pose) {
          w.u16(contour.length / (geom.cubic ? 6 : 2)); let x = 0, y = 0;
          if (geom.cubic && geom.compact) {
            const q = contour.map(v => Math.round(v / geom.quantum)), n = q.length / 6;
            w.delta(q[0]); w.delta(q[1]);
            for (let i = 0; i < n; i++) {
              const a=i*6,b=((i+1)%n)*6;
              const c=[q[b]-q[a],q[b+1]-q[a+1],q[a+4]-q[a],q[a+5]-q[a+1],q[b+2]-q[b],q[b+3]-q[b+1]];
              const key=c.join(','), reverse=[-c[0],-c[1],c[4],c[5],c[2],c[3]].join(',');
              if(cubicPool.has(key)) index((cubicPool.get(key)+1)*2);
              else if(cubicPool.has(reverse)) index((cubicPool.get(reverse)+1)*2+1);
              else { if(cubicPool.size>=1048575)throw new Error('Cubic dictionary too large');index(0);c.forEach(v=>w.delta(v));cubicPool.set(key,cubicPool.size); }
            }
          } else {
            for (let k = 0; k < contour.length; k += 2) { const xx = Math.round(contour[k] / geom.quantum), yy = Math.round(contour[k + 1] / geom.quantum); w.delta(xx - x); w.delta(yy - y); x = xx; y = yy; }
          }
        }
      }
    } else if (geom.verts) {
      w.u8(1);
      w.u8(geom.closed ? 1 : 0);
      w.u16(geom.slot);
      w.u16(geom.verts.length / 6);
      geom.verts.forEach(v => w.f32(v));
    } else {
      w.u8(0);
      w.u16(geom.verbs.length);
      geom.verbs.forEach(v => w.u8(v));
      w.u16(geom.points.length / 2);
      geom.points.forEach(v => w.f32(v));
    }
  }
  for (const clip of a.clips) {
    w.u16(clip.source);
    w.u8(clip.evenOdd ? 1 : 0);
  }
  for (const clip of a.clock.clips) {
    const name = Buffer.from(clip.name, 'utf8');
    w.u8(name.length);
    name.forEach(b => w.u8(b));
    w.f32(clip.duration);
    w.u8(clip.eases.length);
    for (const e of clip.eases) {
      w.u8(e[0]);
      for (let k = 1; k <= 4; k++) w.f32(e[k] ?? 0);
    }
    w.u16(clip.tracks.length);
    for (const t of clip.tracks) {
      w.u16(t[0]);
      w.u16(t[1] < 0 ? 0xffff : t[1]);
      w.f32(t[2]);
      w.u16((t.length - 3) / 3);
      for (let i = 3; i < t.length; i += 3) {
        w.f32(t[i]);
        w.f32(t[i + 1]);
        w.u8(t[i + 2]);
      }
    }
  }
  for (const step of a.clock.play) {
    w.u8(step.clip);
    w.f32(step.cut);
  }
  return w.bytes();
}

// ---- dump ------------------------------------------------------------------

function decodePup(bytes) {
  bytes = unpackPup(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const u16 = () => (at += 2, view.getUint16(at - 2, true));
  const i16 = () => (at += 2, view.getInt16(at - 2, true));
  const delta = () => { let value = 0; for (let i = 0; i < 3; i++) { const b = u8(); value |= (b & 127) << (i * 7); if (!(b & 128)) return (value >>> 1) ^ -(value & 1); } throw new Error('bad contour delta'); };
  const u32 = () => (at += 4, view.getUint32(at - 4, true));
  const f32 = () => (at += 4, Number(view.getFloat32(at - 4, true).toPrecision(7)));
  const f32s = n => Array.from({ length: n }, f32);
  const magic = String.fromCharCode(u8(), u8(), u8(), u8());
  if (magic !== 'PUP1' && magic !== 'PUP2') throw new Error('not a .pup');
  const out = { format: magic, w: u16(), h: u16(), slots: u16() };
  const [nodes, shapes, geoms, clips, motionClips, play] = [u16(), u16(), u16(), u16(), u8(), u8()];
  out.nodes = Array.from({ length: nodes }, (_, i) => ({ i, parent: (p => (p === 0xffff ? -1 : p))(u16()), rest: f32s(6) }));
  out.shapes = Array.from({ length: shapes }, (_, i) => {
    const shape = { i, node: u16(), layer: u8(), geom: u16(), fill: '#' + u32().toString(16).padStart(8, '0') };
    const flags = u8();
    shape.evenOdd = !!(flags & 1);
    shape.clips = Array.from({ length: u8() }, u16);
    if (flags & 2) shape.stroke = { color: '#' + u32().toString(16).padStart(8, '0'), width: f32(), cap: u8(), join: u8() };
    if (flags & 4) shape.follow = { target: u16(), slot: u16(), at: f32() };
    if (flags & 8) {
      const pivots = Array.from({ length: u8() }, u16);
      shape.bend = { pivots, bind: f32s(pivots.length * 6), weights: f32s(u16()) };
    }
    return shape;
  });
  const cubicPool=[];
  const index=()=>{let v=0;for(let i=0;i<3;i++){const b=u8();v|=(b&127)<<(i*7);if(!(b&128))return v;}throw new Error('bad cubic reference');};
  out.geoms = Array.from({ length: geoms }, (_, i) => {
    const kind = u8();
    if (kind === 2) {
      const start = at - 1, slot = u16(), count = u16(), quantum = f32(), encoding = u8();
      const poses=[];
      for(let p=0;p<count;p++){
        const token=encoding===3?index():-1;
        if(token===0){poses.push([]);continue;}
        if(token>0&&!(token&1)){const prior=(token>>>1)-1;if(prior>=p)throw new Error('bad pose reference');poses.push(poses[prior]);continue;}
        const pose=Array.from({length:encoding===3?token>>>1:u16()},()=>{
        const n = u16(), points = []; let x = 0, y = 0;
        if(encoding===3){
          x=delta();y=delta();const sx=x,sy=y;
          for(let k=0;k<n;k++){
            const token=index();let c;
            if(!token){c=Array.from({length:6},delta);cubicPool.push(c);}
            else {c=cubicPool[(token>>>1)-1];if(!c)throw new Error('bad cubic reference');if(token&1)c=[-c[0],-c[1],c[4],c[5],c[2],c[3]];}
            const a=k*6,b=((k+1)%n)*6,nx=x+c[0],ny=y+c[1];
            points[a]=x*quantum;points[a+1]=y*quantum;points[a+4]=(x+c[2])*quantum;points[a+5]=(y+c[3])*quantum;
            points[b+2]=(nx+c[4])*quantum;points[b+3]=(ny+c[5])*quantum;x=nx;y=ny;
          }
          if(x!==sx||y!==sy)throw new Error('unclosed cubic contour');
        }else for (let k = 0; k < n * (encoding === 2 ? 3 : 1); k++) { if (encoding) { x += delta(); y += delta(); } else { x = i16(); y = i16(); } points.push(x * quantum, y * quantum); }
        return points;
        });poses.push(pose);
      }
      return { i, slot, quantum, poses, cubic: encoding >= 2, encodedBytes: at - start };
    }
    return kind === 1 ? { i, closed: !!u8(), slot: u16(), verts: f32s(u16() * 6) } : { i, verbs: Array.from({ length: u16() }, u8).map(v => 'MLCZ'[v]).join(''), points: f32s(u16() * 2) };
  });
  out.clips = Array.from({ length: clips }, () => ({ source: u16(), evenOdd: !!u8() }));
  out.motion = Array.from({ length: motionClips }, () => {
    const name = String.fromCharCode(...Array.from({ length: u8() }, u8));
    const clip = { name, duration: f32(), eases: Array.from({ length: u8() }, () => [u8(), ...f32s(4)]) };
    clip.tracks = Array.from({ length: u16() }, () => {
      const track = { slot: u16(), twin: (t => (t === 0xffff ? -1 : t))(u16()), twinOffset: f32(), keys: [] };
      for (let k = u16(); k > 0; k--) track.keys.push([f32(), f32(), u8()]);
      return track;
    });
    return clip;
  });
  out.play = Array.from({ length: play }, () => ({ clip: u8(), cut: f32() }));
  if (at !== bytes.length) throw new Error(`${bytes.length - at} bytes left over`);
  return out;
}


export { compile, encodePup, decodePup };
