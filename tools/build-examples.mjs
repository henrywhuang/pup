import fs from 'node:fs';
import { compile, encodePup } from './compiler.mjs';
import { optimizePup } from './optimize.mjs';
for (const character of ['fox', 'raccoon']) {
  const base = 'examples/' + character + '/';
  const bytes = optimizePup(encodePup(compile(base + 'rig.svg', base + 'motion.json')));
  fs.writeFileSync(base + 'animation.pup', bytes);
  console.log(character + ': ' + bytes.length + ' bytes');
}
