import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parsePup} from '../src/canvas.js';
import {parsePuc} from '../src/puc.js';
import {unpackPup} from '../src/compact.js';
import {describeRig} from '../src/inspection.js';
import {compile, encodePup} from './compiler.mjs';
import {optimizePup} from './optimize.mjs';
import {compactPrecision} from './bird-precision.mjs';

/** Map SVG IDs through the actual lossless optimizer, never by guessed indices. */
export async function inspectFile(file, {svg, motion, birdPrecision = false, skeleton = null, filename = path.basename(file instanceof URL ? fileURLToPath(file) : file)} = {}) {
  const bytes = fs.readFileSync(file);
  const puppet = bytes.subarray(0,4).toString() === 'PUC1' ? await parsePuc(bytes) : parsePup(bytes);
  const names = {nodes:{}, shapes:{}};
  if (svg && motion) {
    const source = compile(svg, motion), report = {};
    let rebuilt = optimizePup(encodePup(source), report);
    if (birdPrecision) rebuilt = compactPrecision(rebuilt);
    if (!Buffer.from(unpackPup(bytes)).equals(Buffer.from(rebuilt))) throw new Error('Rig source does not match published file: ' + file);
    for (const [name, oldIndex] of Object.entries(source.manifest.nodes)) {
      const index = report.nodeMap[oldIndex];
      (names.nodes[index] ??= []).push(name);
    }
    for (const [name, index] of Object.entries(source.manifest.shapes)) names.shapes[index] = name;
  }
  if (skeleton) for (const [name, bone] of Object.entries(skeleton)) {
    names.nodes[bone.runtimeNode] = [bone.label || name, ...(names.nodes[bone.runtimeNode] || [])];
  }
  return describeRig(puppet, {names, skeleton, asset:{
    filename, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'),
  }});
}

export async function exportExampleBindings() {
  const files = [];
  for (const group of ['dance', 'quiz', 'peek']) {
    for (const character of group === 'dance' ? ['fox','raccoon','bird'] : ['fox','raccoon']) {
      const stem = group === 'dance' ? 'examples/dance/' + character : group === 'quiz' ? 'examples/' + character : 'examples/peek';
      const file = stem + '/' + (group === 'peek' ? character : 'animation') + '.pup';
      const source = group === 'peek' ? {} : {svg:stem+'/rig.svg', motion:stem+'/motion.json'};
      const descriptor = await inspectFile(file, {...source, birdPrecision:group==='dance' && character==='bird', filename:character+'-'+(group==='quiz'?'reactions':group)+'.pup'});
      const output = stem + '/' + (group === 'peek' ? character + '.' : '') + 'bindings.json';
      fs.writeFileSync(output, JSON.stringify(descriptor, null, 2) + '\n'); files.push(output);
    }
  }
  const skeleton = JSON.parse(fs.readFileSync('examples/bird/rig.json')).bones;
  const bird = await inspectFile('examples/bird/turn.puc', {skeleton, filename:'bird-turn.puc'});
  fs.writeFileSync('examples/bird/bindings.json', JSON.stringify(bird, null, 2) + '\n');
  return [...files, 'examples/bird/bindings.json'];
}
