import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parsePup, parsePuc, parsePreview, poseAt, durationOf, skeletonPoints} from '../src/index.js';
import {previewData} from '../src/preview.js';
import {compile, encodePup} from '../tools/compiler.mjs';
import {packPup, unpackPup} from '../tools/compact.mjs';
import {optimizePup} from '../tools/optimize.mjs';

const file = name => new URL('../examples/' + name, import.meta.url);
const read = name => fs.readFileSync(file(name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('dance sources reproduce the approved downloads without altering their motion', () => {
  for (const [character, size, hash] of [
    ['fox', 85387, '0d0c70d908cc7d70cf0decb10a5acc0c504dfff3be5866455bbb1d890b666601'],
    ['raccoon', 22222, '0b518a49ae3f52a2a44c5126bfc5754b74cf1210578a09af7ad021cabef7e546'],
  ]) {
    const base = 'dance/' + character + '/';
    const bytes = read(base + 'animation.pup');
    assert.equal(bytes.length, size);
    assert.equal(sha(bytes), hash);
    const raw = optimizePup(encodePup(compile(file(base + 'rig.svg'), file(base + 'motion.json'))));
    assert.equal(sha(character === 'raccoon' ? packPup(raw).bytes : raw), hash);
    assert.deepEqual(Buffer.from(optimizePup(bytes)), bytes, 'Optimization must preserve these containers');
    const puppet = parsePup(bytes);
    assert.deepEqual(puppet.art.clock.clips.map(c => c.name), ['dance']);
    if (character === 'raccoon') assert.deepEqual(Buffer.from(unpackPup(bytes)), read(base + 'animation.compat.pup'));
  }
});

test('fox pose banks select the exact stored pose at every key and backward seek', () => {
  const bytes = read('dance/fox/animation.pup'), puppet = parsePup(bytes);
  const track = puppet.art.clock.clips[0].tracks[0];
  const poseGeoms = puppet.art.geoms.map((g, i) => g.poses ? i : -1).filter(i => i >= 0);
  assert.equal(poseGeoms.length, 23);
  for (let key = 3; key < track.length; key += 3) {
    for (const time of [track[key], key + 3 < track.length ? (track[key] + track[key + 3]) / 2 : track[key]]) {
      poseAt(puppet, time, 'dance');
      for (const geom of poseGeoms) assert.equal(puppet.rig.poseIndices[geom], track[key + 1]);
      assert(Array.from(puppet.rig.matrix).every(Number.isFinite));
    }
  }
  poseAt(puppet, 0.15, 'dance');
  const fresh = parsePup(bytes); poseAt(fresh, 0.15, 'dance');
  assert.deepEqual(puppet.rig.poseIndices, fresh.rig.poseIndices);
  assert(Math.abs(durationOf(puppet, 'dance') - 4.633) < 1e-6);
});

test('packed raccoon preserves every evaluated channel across the full dance', () => {
  const a = parsePup(read('dance/raccoon/animation.pup'));
  const b = parsePup(read('dance/raccoon/animation.compat.pup'));
  for (let time = 0; time <= 4.34; time += 1 / 120) {
    poseAt(a, time, 'dance'); poseAt(b, time, 'dance');
    assert.deepEqual(a.rig.props, b.rig.props);
    assert.deepEqual(a.rig.matrix, b.rig.matrix);
    assert.deepEqual(a.rig.points, b.rig.points);
  }
  assert.throws(() => unpackPup(read('dance/raccoon/animation.pup').subarray(0, 100)));
});

test('HTML extraction loads the exact bird and bone map without executing script', async () => {
  const html = read('bird/source.html').toString();
  const data = previewData(html), bytes = read('bird/turn.puc');
  assert.deepEqual(Buffer.from(data.encoded, 'base64'), bytes);
  assert.equal(sha(bytes), '3bb120fbbaf01c00e25d2ba427a20c8673114c04cf83ab3ddcc25af00735b6ce');
  assert.deepEqual(data.metadata, JSON.parse(read('bird/rig.json')));
  const a = await parsePreview(html + '<script>throw Error("must never run")</script>');
  const b = await parsePuc(bytes);
  assert.equal(Object.keys(a.skeleton).length, 8);
  assert.deepEqual(a.art.clock.clips.map(c => c.name), ['turn']);
  for (let time = 0; time <= 1.867; time += 1 / 120) {
    poseAt(a, time, 'turn'); poseAt(b, time, 'turn');
    assert.deepEqual(a.rig.matrix, b.rig.matrix);
    assert.deepEqual(a.rig.points, b.rig.points);
    for (const joint of skeletonPoints(a, true)) {
      const node = a.skeleton[joint.name].runtimeNode;
      assert.equal(joint.x, a.rig.world[node * 6 + 4]);
      assert.equal(joint.y, a.rig.world[node * 6 + 5]);
      assert(Number.isFinite(joint.x + joint.y));
    }
  }
  assert.throws(() => skeletonPoints(a, {bad:{runtimeNode:99999}}), /Invalid skeleton/);
  assert.throws(() => previewData('<script>alert(1)</script>'), /No embedded/);
  await assert.rejects(parsePuc(bytes.subarray(0, 50)));
});
