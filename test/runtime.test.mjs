import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePup, poseAt, durationOf } from '../src/index.js';
import { compile, encodePup } from '../tools/compiler.mjs';
import { optimizePup } from '../tools/optimize.mjs';

const source = name => new URL('../examples/' + name, import.meta.url);
function worldPoints(puppet, index) {
  const { art, rig } = puppet, shape = art.shapes[index], geometry = art.geoms[shape.geom];
  const points = geometry.verts ? rig.points[shape.geom] : geometry.points;
  const m = rig.matrix.subarray(index * 6, index * 6 + 6), out = [];
  for (let i = 0; i < points.length; i += 2) {
    out.push(m[0] * points[i] + m[2] * points[i + 1] + m[4]);
    out.push(m[1] * points[i] + m[3] * points[i + 1] + m[5]);
  }
  return out;
}

for (const character of ['fox', 'raccoon']) {
  test(character + ': source rig compiles to the exact released bytes', () => {
    const raw = encodePup(compile(source(character + '/rig.svg'), source(character + '/motion.json')));
    const packed = optimizePup(raw);
    assert.deepEqual(Buffer.from(packed), fs.readFileSync(source(character + '/animation.pup')));
    const a = parsePup(raw), b = parsePup(packed);
    assert.deepEqual(b.art.clock.clips.map(c => c.name), ['correct', 'wrong']);
    let maxError = 0;
    for (const clip of b.art.clock.clips) {
      for (let time = 0; time < clip.duration + 1 / 120; time += 1 / 120) {
        poseAt(a, time, clip.name); poseAt(b, time, clip.name);
        assert(Array.from(b.rig.matrix).every(Number.isFinite));
        for (let i = 0; i < b.art.shapes.length; i++) {
          assert.equal(a.rig.fillColor[i], b.rig.fillColor[i]);
          const before = worldPoints(a, i), after = worldPoints(b, i);
          assert.equal(before.length, after.length);
          for (let j = 0; j < before.length; j++) maxError = Math.max(maxError, Math.abs(before[j] - after[j]));
        }
      }
    }
    assert(maxError < 0.001, 'Lossless packing changed a world-space point');
  });

  test(character + ': a new action resets the old expression', () => {
    const bytes = fs.readFileSync(source(character + '/animation.pup'));
    const reused = parsePup(bytes), fresh = parsePup(bytes);
    poseAt(reused, 0.5, 'wrong'); poseAt(reused, 0, 'correct'); poseAt(fresh, 0, 'correct');
    assert.deepEqual(reused.rig.props, fresh.rig.props);
    assert.deepEqual(reused.rig.matrix, fresh.rig.matrix);
    poseAt(reused, 50, 'correct');
    const held = [...reused.rig.matrix];
    poseAt(reused, 100, 'correct');
    assert.deepEqual([...reused.rig.matrix], held);
    assert(Math.abs(durationOf(reused, 'wrong') - 0.917) < 1e-5);
    assert.throws(() => poseAt(reused, NaN, 'correct'), /finite/);
    assert.throws(() => poseAt(reused, 0, 'missing'), /Unknown/);
  });
}

for (const character of ['fox', 'raccoon']) {
  test(character + ': peek playlist stays finite and seeks backward', () => {
    const bytes = fs.readFileSync(source('peek/' + character + '.pup'));
    const puppet = parsePup(bytes), duration = durationOf(puppet);
    assert(duration > 1);
    for (let time = 0; time <= duration; time += 1 / 60) {
      poseAt(puppet, time); assert(Array.from(puppet.rig.matrix).every(Number.isFinite));
    }
    poseAt(puppet, 0.5);
    const fresh = parsePup(bytes); poseAt(fresh, 0.5);
    assert.deepEqual(puppet.rig.props, fresh.rig.props);
  });
}

test('byte views honor offsets and invalid headers fail', () => {
  const bytes = fs.readFileSync(source('fox/animation.pup'));
  const padded = Buffer.concat([Buffer.alloc(7), bytes, Buffer.alloc(5)]);
  assert.deepEqual(parsePup(padded.subarray(7, 7 + bytes.length)).art.nodeRest, parsePup(bytes).art.nodeRest);
  assert.throws(() => parsePup(new Uint8Array([1, 2, 3, 4])));
  assert.throws(() => parsePup(bytes.subarray(0, 30)));
});

test('fox nose-to-mouth connector stays centered throughout the jaw opening', () => {
  const puppet = parsePup(fs.readFileSync(source('fox/animation.pup')));
  const { art, rig } = puppet;
  const nose = art.shapes.findIndex(shape => shape.fill === 0xffe63321);
  const connector = art.shapes.findIndex(shape =>
    shape.fill === 0xff943f0e && art.geoms[shape.geom].points?.length === 8);
  assert(nose >= 0 && connector >= 0, 'Nose and connector must be present');
  const nosePoints = art.geoms[art.shapes[nose].geom].points;
  const noseXs = Array.from(nosePoints).filter((_, i) => i % 2 === 0);
  const noseCenter = (Math.min(...noseXs) + Math.max(...noseXs)) / 2;
  const points = art.geoms[art.shapes[connector].geom].points;
  for (let time = 0.334; time <= 1.083; time += 1 / 240) {
    poseAt(puppet, time, 'correct');
    const n = rig.matrix.subarray(nose * 6, nose * 6 + 6);
    const c = rig.matrix.subarray(connector * 6, connector * 6 + 6);
    const determinant = n[0] * n[3] - n[1] * n[2];
    for (const [a, b] of [[0, 2], [4, 6]]) {
      const x = (points[a] + points[b]) / 2;
      const y = (points[a + 1] + points[b + 1]) / 2;
      const dx = c[0] * x + c[2] * y + c[4] - n[4];
      const dy = c[1] * x + c[3] * y + c[5] - n[5];
      const localX = (n[3] * dx - n[2] * dy) / determinant;
      assert(Math.abs(localX - noseCenter) < 0.001, 'Connector drifted from the nose axis at ' + time);
    }
  }
});

test('independent followers survive later hierarchy updates and packing', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = fs;
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const directory = mkdtempSync(path.join(tmpdir(), 'pup-follow-'));
  try {
    const svg = '<svg width="400" height="100" viewBox="0 0 400 100"><g id="behind">' +
      '<g id="first"><path id="guide-a" d="M0 0C32 0 64 0 96 0" fill="none"/>' +
      '<path id="hand-a" data-follow="guide-a" data-follow-at="0.25" d="M0 0L2 0L2 2Z" fill="#ff8339"/></g>' +
      '<g id="second" transform="translate(200 0)"><path id="guide-b" d="M0 0C32 0 64 0 96 0" fill="none"/>' +
      '<path id="hand-b" data-follow="guide-b" data-follow-at="0.25" d="M0 0L2 0L2 2Z" fill="#ff8339"/></g>' +
      '</g><g id="front"/></svg>';
    const artFile = path.join(directory, 'rig.svg'), motionFile = path.join(directory, 'motion.json');
    writeFileSync(artFile, svg);
    writeFileSync(motionFile, JSON.stringify({ clips: { idle: { fps: 60, frames: 60, tracks: {} } }, play: [{ clip: 'idle' }] }));
    const raw = encodePup(compile(artFile, motionFile));
    for (const bytes of [raw, optimizePup(raw)]) {
      const puppet = parsePup(bytes);
      poseAt(puppet, 0);
      const hands = puppet.art.shapes.map((s, i) => s.follow ? i : -1).filter(i => i >= 0);
      assert.equal(hands.length, 2);
      assert(Math.abs(puppet.rig.matrix[hands[0] * 6 + 4] - 24) < 0.001);
      assert(Math.abs(puppet.rig.matrix[hands[1] * 6 + 4] - 224) < 0.001);
    }
    writeFileSync(motionFile, JSON.stringify({
      clips: {
        move: { fps: 60, frames: 60, tracks: { second: { tx: [[0, 200], [60, 300]] } } },
        reset: { fps: 60, frames: 60, tracks: { second: { tx: [[0, 200]] } } },
      },
      play: [{ clip: 'move' }, { clip: 'reset' }],
    }));
    const resetBytes = encodePup(compile(artFile, motionFile));
    for (const bytes of [resetBytes, optimizePup(resetBytes)]) {
      const puppet = parsePup(bytes);
      poseAt(puppet, 1.25);
      const hands = puppet.art.shapes.map((s, i) => s.follow ? i : -1).filter(i => i >= 0);
      assert(Math.abs(puppet.rig.matrix[hands[1] * 6 + 4] - 224) < 0.001, 'Packing must retain a later clip’s rest-valued reset');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('seek preserves unkeyed channels through the fox peek/back cut', async () => {
  const { createRig, advance, seek, solve } = await import('../src/rig.js');
  const art = parsePup(fs.readFileSync(source('peek/fox.pup'))).art;
  for (const after of [0, 0.04, 0.2, 0.5]) {
    const played = createRig(art), scrubbed = createRig(art);
    advance(played, 2); advance(played, after); solve(played);
    seek(scrubbed, 2 + after); solve(scrubbed);
    for (let i = 0; i < played.matrix.length; i++) assert(Math.abs(played.matrix[i] - scrubbed.matrix[i]) < 0.0001);
  }
  const uneven = createRig(art);
  let elapsed = 0;
  for (const dt of [0.03, 0.36, 0.714, 0.872, 0.081, 0.062, 0.175, 0.4, 0.5]) {
    elapsed += dt;
    advance(uneven, dt); solve(uneven);
    const scrubbed = createRig(art);
    seek(scrubbed, elapsed); solve(scrubbed);
    for (let i = 0; i < uneven.matrix.length; i++) assert(Math.abs(uneven.matrix[i] - scrubbed.matrix[i]) < 0.0001);
    assert.deepEqual(uneven.fillColor, scrubbed.fillColor);
  }
});
