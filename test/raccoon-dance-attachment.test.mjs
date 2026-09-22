import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePup, poseAt} from '../src/index.js';

test('raccoon dance shoulders stay behind the head and wrist masks never fold', () => {
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
      const mask = puppet.art.shapes[index('palm-' + side + '-front')], q = puppet.rig.points[mask.geom];
      assert.equal(q.length, 24);
      for (let i = 0; i < 4; i++) {
        const a = i * 6, b = ((i + 1) % 4) * 6, c = ((i + 2) % 4) * 6;
        assert((q[b] - q[a]) * (q[c + 1] - q[b + 1]) - (q[b + 1] - q[a + 1]) * (q[c] - q[b]) > 0,
          side + ' wrist mask folds at ' + time);
      }
    }
  }
});
