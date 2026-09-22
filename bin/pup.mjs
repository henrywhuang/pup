#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compile, encodePup, decodePup } from '../tools/compiler.mjs';
import { optimizePup } from '../tools/optimize.mjs';
import {packPup,unpackPup} from '../tools/compact.mjs';
import {parsePuc} from '../src/puc.js';

const [command, ...args] = process.argv.slice(2);
const usage = [
  'pup import <rig.svg> <motion.json> <output.pup>',
  'pup inspect <animation.pup>',
  'pup optimize <input.pup> [output.pup]',
  'pup pack <input.pup> [output.pup]',
  'pup prepare <reference.webp> <artwork.svg> <output-directory> [--fps 24]',
].join('\n');
try {
  if (command === 'import' && args.length === 3) {
    const compiled = encodePup(compile(args[0], args[1]));
    const result = optimizePup(compiled);
    fs.writeFileSync(args[2], result);
    console.log(path.basename(args[2]) + ': ' + result.length + ' bytes (lossless packing from ' + compiled.length + ')');
  } else if (['inspect', 'dump'].includes(command) && args.length === 1) {
    const bytes = fs.readFileSync(args[0]);
    const data = bytes.subarray(0,4).toString() === 'PUC1'
      ? {container:'PUC1', ...decodePup(encodePup((await parsePuc(bytes)).art))}
      : decodePup(bytes);
    console.log(JSON.stringify(data, null, 2));
  } else if (command === 'optimize' && args.length >= 1 && args.length <= 2) {
    const input = fs.readFileSync(args[0]), output = optimizePup(input);
    fs.writeFileSync(args[1] ?? args[0], output);
    console.log(input.length + ' -> ' + output.length + ' bytes');
  } else if (command === 'pack' && args.length >= 1 && args.length <= 2) {
    const source = fs.readFileSync(args[0]);
    const raw = unpackPup(source);
    const magic = String.fromCharCode(...raw.subarray(0,4));
    if (magic !== 'PUP1' && magic !== 'PUP2') throw new Error('pack expects a PUP1 or PUP2 animation');
    const packed = packPup(raw).bytes;
    fs.writeFileSync(args[1] ?? args[0], packed);
    console.log(source.length + ' -> ' + packed.length + ' bytes (lossless wrapper)');
  } else if (command === 'prepare' && args.length >= 3) {
    const script = fileURLToPath(new URL('../tools/prepare.py', import.meta.url));
    const result = spawnSync(process.env.PUP_PYTHON || 'python3', [script, ...args], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else if (['help', '--help', '-h'].includes(command) || !command) console.log(usage);
  else { console.error(usage); process.exitCode = 2; }
} catch (error) {
  console.error('pup: ' + error.message);
  process.exitCode = 1;
}
