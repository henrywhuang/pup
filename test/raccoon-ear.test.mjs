import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePup, poseAt } from '../src/index.js';

function outline(geometry) {
  const result = [];
  let offset = 0, previous = [0, 0];
  for (const verb of geometry.verbs) {
    if (verb === 0 || verb === 1) {
      previous = Array.from(geometry.points.slice(offset, offset + 2));
      offset += 2;
      result.push(previous);
    } else if (verb === 2) {
      const p = geometry.points.slice(offset, offset + 6), a = previous;
      offset += 6;
      for (let step = 1; step <= 64; step++) {
        const t = step / 64, u = 1 - t;
        result.push([
          u ** 3 * a[0] + 3 * u * u * t * p[0] + 3 * u * t * t * p[2] + t ** 3 * p[4],
          u ** 3 * a[1] + 3 * u * u * t * p[1] + 3 * u * t * t * p[3] + t ** 3 * p[5],
        ]);
      }
      previous = Array.from(p.slice(4));
    }
  }
  return result;
}

function intersections(points, y) {
  const xs = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
  }
  return xs;
}

test('raccoon ear root overlaps the head throughout its independent squash and turn', () => {
  const base = new URL('../examples/raccoon/', import.meta.url);
  const svg = fs.readFileSync(new URL('rig.svg', base), 'utf8');
  const ids = [...svg.matchAll(/<path\b[^>]*>/g)].map(match => match[0].match(/\sid="([^"]+)"/)[1]);
  const puppet = parsePup(fs.readFileSync(new URL('animation.pup', base)));
  const { art, rig } = puppet;
  assert.equal(ids.length, art.shapes.length);
  const head = ids.indexOf('raccoon-head'), ear = ids.indexOf('ear-right-fur');
  assert(head >= 0 && ear >= 0);
  const headPoints = outline(art.geoms[art.shapes[head].geom]);
  const earPoints = outline(art.geoms[art.shapes[ear].geom]);
  const rows = [];
  for (let y = -80; y <= -20; y += 0.25) {
    const xs = intersections(headPoints, y);
    if (xs.length) rows.push([y, Math.max(...xs)]);
  }
  for (const clip of art.clock.clips) {
    for (let time = 0; time <= clip.duration; time += 1 / 120) {
      poseAt(puppet, time, clip.name);
      const h = rig.matrix.subarray(head * 6, head * 6 + 6);
      const e = rig.matrix.subarray(ear * 6, ear * 6 + 6);
      const determinant = h[0] * h[3] - h[1] * h[2];
      const points = earPoints.map(([x, y]) => {
        const dx = e[0] * x + e[2] * y + e[4] - h[4];
        const dy = e[1] * x + e[3] * y + e[5] - h[5];
        return [(h[3] * dx - h[2] * dy) / determinant, (-h[1] * dx + h[0] * dy) / determinant];
      });
      for (const [y, headRight] of rows) {
        const xs = intersections(points, y);
        if (xs.length) {
          assert(headRight - Math.min(...xs) > 2, 'Ear root lost its overlap at ' + clip.name + ' ' + time);
        }
      }
    }
  }
});
