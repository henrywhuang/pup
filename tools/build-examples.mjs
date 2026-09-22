import fs from 'node:fs';
import { compile, encodePup } from './compiler.mjs';
import { optimizePup } from './optimize.mjs';
import { packPup } from './compact.mjs';
import { previewData } from '../src/preview.js';
for (const character of ['fox', 'raccoon']) {
  const base = 'examples/' + character + '/';
  const bytes = optimizePup(encodePup(compile(base + 'rig.svg', base + 'motion.json')));
  fs.writeFileSync(base + 'animation.pup', bytes);
  console.log(character + ': ' + bytes.length + ' bytes');
}
for (const character of ['fox', 'raccoon']) {
  const base = 'examples/dance/' + character + '/';
  const raw = optimizePup(encodePup(compile(base + 'rig.svg', base + 'motion.json')));
  if (character === 'raccoon') fs.writeFileSync(base + 'animation.compat.pup', raw);
  const bytes = character === 'raccoon' ? packPup(raw).bytes : raw;
  fs.writeFileSync(base + 'animation.pup', bytes);
  console.log(character + ' dance: ' + bytes.length + ' bytes');
}
const bird = previewData(fs.readFileSync('examples/bird/source.html', 'utf8'));
fs.writeFileSync('examples/bird/turn.puc', Buffer.from(bird.encoded, 'base64'));
fs.writeFileSync('examples/bird/rig.json', JSON.stringify(bird.metadata, null, 2) + '\n');
