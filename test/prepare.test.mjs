import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('WebP + SVG preparation preserves timing and source parts', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pup-prepare-'));
  const output = path.join(temp, 'work');
  try {
    const command = ['bin/pup.mjs', 'prepare', 'examples/fox/correct.webp', 'examples/fox/artwork.svg', output];
    const result = spawnSync(process.execPath, command, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const timing = JSON.parse(fs.readFileSync(path.join(output, 'reference.json')));
    const parts = JSON.parse(fs.readFileSync(path.join(output, 'parts.json')));
    assert.equal(timing.frameCount, 26); assert.equal(timing.duration, 1083);
    assert(parts.parts.some(part => part.type === 'path'));
    assert.deepEqual(fs.readFileSync(path.join(output, 'reference.webp')), fs.readFileSync('examples/fox/correct.webp'));
    assert(fs.readFileSync(path.join(output, 'AUTHORING.md'), 'utf8').includes('does not automatically infer'));
    const again = spawnSync(process.execPath, command, { encoding: 'utf8' });
    assert.notEqual(again.status, 0, 'Preparation must not overwrite authored work');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
