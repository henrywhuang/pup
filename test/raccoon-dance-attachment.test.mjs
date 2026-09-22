import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePup, poseAt} from '../src/index.js';

test('raccoon dance shoulders stay behind the head throughout the motion', () => {
  const base = new URL('../examples/dance/raccoon/', import.meta.url);
  const puppet = parsePup(fs.readFileSync(new URL('animation.pup', base)));
  const ids = [...fs.readFileSync(new URL('rig.svg', base), 'utf8').matchAll(/<path id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, puppet.art.shapes.length);
  const index = id => { const i = ids.indexOf(id); assert(i >= 0, id); return i; };
  const head = index('head-脑袋'), geometry = puppet.art.geoms[puppet.art.shapes[head].geom];
  const outline = [];
  poseAt(puppet, 0, 'dance');
  function cubic(a, b, c, d) {
    for (let k = 1; k <= 80; k++) {
      const t = k / 80, u = 1 - t;
      outline.push([0, 1].map(j => u ** 3 * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t ** 3 * d[j]));
    }
  }
  if (geometry.verts) {
    const q = puppet.rig.points[puppet.art.shapes[head].geom];
    for (let i = 0; i < q.length; i += 6) {
      const j = (i + 6) % q.length;
      cubic(q.slice(i, i + 2), q.slice(i + 4, i + 6), q.slice(j + 2, j + 4), q.slice(j, j + 2));
    }
  } else {
    let offset = 0, from;
    const point = () => { const p = geometry.points.slice(offset, offset + 2); offset += 2; return p; };
    for (const verb of geometry.verbs) {
      if (verb < 2) { from = point(); outline.push(from); }
      else if (verb === 2) { const a = point(), b = point(), to = point(); cubic(from, a, b, to); from = to; }
    }
  }
  function inside(x, y) {
    let result = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i], b = outline[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  }
  for (const time of [0.466, 0.5, ...Array.from({length:521}, (_, i) => Math.min(4.332, i / 120))]) {
    poseAt(puppet, time, 'dance');
    const m = puppet.rig.matrix.subarray(head * 6, head * 6 + 6), det = m[0] * m[3] - m[1] * m[2];
    for (const side of ['left', 'right']) {
      const link = puppet.art.shapes[index('shoulder-' + side + '-link')];
      const points = puppet.rig.points[link.geom];
      for (const k of [12, 18]) {
        const x = points[k] - m[4], y = points[k + 1] - m[5];
        assert(inside((m[3] * x - m[2] * y) / det, (-m[1] * x + m[0] * y) / det), side + ' shoulder detaches at ' + time);
      }
    }
  }
});

test('raccoon palms close smoothly and exclude the exposed shoulder-root corner', () => {
  const base = new URL('../examples/dance/raccoon/', import.meta.url);
  const puppet = parsePup(fs.readFileSync(new URL('animation.pup', base)));
  const ids = [...fs.readFileSync(new URL('rig.svg', base), 'utf8').matchAll(/<path id="([^"]+)"/g)].map(m => m[1]);
  const shape = id => { const i = ids.indexOf(id); assert(i >= 0, id); return puppet.art.shapes[i]; };
  function sample(q, i, t) {
    const a = i * 6, b = (a + 6) % q.length, u = 1 - t;
    return [0, 1].map(j => u ** 3 * q[a + j] + 3 * u * u * t * q[a + 4 + j] + 3 * u * t * t * q[b + 2 + j] + t ** 3 * q[b + j]);
  }
  function contains(q, point) {
    const polygon = [];
    for (let i = 0; i < q.length / 6; i++) for (let j = 0; j < 16; j++) polygon.push(sample(q, i, j / 16));
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  }
  for (let ms = 0; ms <= 4332; ms++) {
    poseAt(puppet, ms / 1000, 'dance');
    for (const side of ['left', 'right']) {
      const palm = shape('palm-' + side + '-front'), q = puppet.rig.points[palm.geom];
      // A real closed palm, not a polygon intersected with a hand/head mask.
      assert.equal(palm.clips.length, 0);
      assert(puppet.art.geoms[palm.geom].closed);
      for (const vertex of [0, q.length - 6]) for (const axis of [0, 1]) {
        assert(Math.abs(q[vertex + 2 + axis] + q[vertex + 4 + axis] - 2 * q[vertex + axis]) < 0.001,
          side + ' wrist loses tangent continuity at ' + ms + ' ms');
      }
      if (ms >= 236 && ms <= 315) {
        const arm = puppet.rig.points[shape('hand-' + side + '-ink').geom];
        assert(!contains(q, sample(arm, 1, 0.05)), side + ' shoulder corner leaks into the front palm at ' + ms + ' ms');
      }
    }
  }
});
