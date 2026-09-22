import fs from 'node:fs';
import { compile, encodePup } from './compiler.mjs';
import { optimizePup } from './optimize.mjs';
import { packPup } from './compact.mjs';
import { previewData } from '../src/preview.js';
import { exportExampleBindings } from './rig-inspection.mjs';
import { compactPrecision } from './bird-precision.mjs';
for (const character of ['fox', 'raccoon']) {
  const base = 'examples/' + character + '/';
  const bytes = optimizePup(encodePup(compile(base + 'rig.svg', base + 'motion.json')));
  fs.writeFileSync(base + 'animation.pup', bytes);
  console.log(character + ': ' + bytes.length + ' bytes');
}
for (const character of ['fox', 'raccoon', 'bird']) {
  const base = 'examples/dance/' + character + '/';
  let raw = optimizePup(encodePup(compile(base + 'rig.svg', base + 'motion.json')));
  if (character === 'bird') raw = compactPrecision(raw);
  if (character === 'raccoon') fs.writeFileSync(base + 'animation.compat.pup', raw);
  const bytes = character === 'fox' ? raw : packPup(raw).bytes;
  fs.writeFileSync(base + 'animation.pup', bytes);
  console.log(character + ' dance: ' + bytes.length + ' bytes');
}
const bird = previewData(fs.readFileSync('examples/bird/source.html', 'utf8'));
fs.writeFileSync('examples/bird/turn.puc', Buffer.from(bird.encoded, 'base64'));
fs.writeFileSync('examples/bird/rig.json', JSON.stringify(bird.metadata, null, 2) + '\n');
await exportExampleBindings();
