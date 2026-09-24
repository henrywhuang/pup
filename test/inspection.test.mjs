import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePup, poseAt} from '../src/index.js';
import {describeRig, deformationPoints, inspectionModes} from '../src/inspection.js';
import {inspectFile} from '../tools/rig-inspection.mjs';
import {compile, encodePup} from '../tools/compiler.mjs';
import {optimizePup} from '../tools/optimize.mjs';

const file = name => new URL('../examples/' + name, import.meta.url);
test('inspection preserves exact binding matrices and signed point weights', async () => {
  const path = 'dance/raccoon/';
  const bytes = fs.readFileSync(file(path + 'animation.pup'));
  const puppet = parsePup(bytes), descriptor = await inspectFile(file(path + 'animation.pup'), {
    filename:'raccoon-dance.pup', svg:file(path+'rig.svg'), motion:file(path+'motion.json'),
  });
  assert.equal(descriptor.summary.weightedParts,15);
  const part = descriptor.parts.find(p=>p.name==='hand-left-complete');
  assert(part);
  const skin = puppet.art.shapes[part.index].bend;
  assert.deepEqual(part.binding.pivots,Array.from(skin.pivots));
  assert.deepEqual(part.binding.inverseBindMatrices.flat(),Array.from(skin.bind));
  assert.deepEqual(part.binding.weights,Array.from(skin.weights));
  assert(part.binding.weights.some(w=>w<0), 'Morph coefficients must not be clamped into skin-weight percentages');
  for(const time of [0,.25,.315,.5,2,4.332]){
    poseAt(puppet,time,'dance');
    const points = deformationPoints(puppet,part.index);
    assert.equal(points.length,part.vertexCount);
    const raw=puppet.rig.points[part.geometry];
    for(const point of points){
      assert.equal(point.anchor.x,raw[point.index*6]);
      assert.equal(point.anchor.y,raw[point.index*6+1]);
      assert.deepEqual(point.weights.flat(),part.binding.weights.slice(point.index*3*skin.pivots.length,(point.index+1)*3*skin.pivots.length));
    }
  }
  assert(descriptor.nodes.some(n=>n.aliases.includes('tail-tip')));
});

test('pose-bank fox is not falsely advertised as a skeleton', () => {
  const puppet=parsePup(fs.readFileSync(file('dance/fox/animation.pup'))), data=describeRig(puppet);
  assert.equal(data.summary.poseBanks,24);
  assert.equal(data.summary.animatedNodes,2);
  assert.equal(data.summary.weightedParts,0);
  assert.equal(data.summary.morphedParts,0);
  assert.equal(data.summary.semanticJoints,0);
  assert.deepEqual(inspectionModes(data),['transforms','poses']);
  const foreground=data.parts.find(p=>p.kind==='pose-bank');
  assert.deepEqual(deformationPoints(puppet,foreground.index),[]);
});

test('compiled fox authoring data reproduces the approved file and its real part names', async () => {
  const data=await inspectFile(file('dance/fox/animation.pup'),{compiled:file('dance/fox/rig.json')});
  assert.equal(data.asset.sha256,'077b91411cc61d59b6ca44bc80a7448ca2d133925e909e1508b9717686a458de');
  assert(data.nodes.some(n=>n.name==='tail'));
  assert(data.parts.some(p=>p.name==='tail-cream'&&p.kind==='transform'));
  assert(data.parts.some(p=>p.name==='muzzle-nose'&&p.poseCount===56));
});

test('optimizer inspection reports retained nodes without changing output bytes', () => {
  const art=compile(file('raccoon/rig.svg'),file('raccoon/motion.json'));
  const raw=encodePup(art), report={};
  assert.deepEqual(optimizePup(raw,report),optimizePup(raw));
  const puppet=parsePup(optimizePup(raw));
  assert.equal(report.nodeMap.length,art.nodeParent.length);
  for(let i=0;i<art.shapes.length;i++)assert.equal(report.nodeMap[art.shapes[i].node],puppet.art.shapes[i].node);
});

test('bird IDs are mapped through its original precision recipe without changing the asset', async () => {
  const data=await inspectFile(file('dance/bird/animation.pup'),{
    filename:'bird-dance.pup',svg:file('dance/bird/rig.svg'),motion:file('dance/bird/motion.json'),birdPrecision:true,
  });
  assert.equal(data.asset.bytes,9575);
  assert.equal(data.summary.weightedParts,4);
  assert(data.parts.some(p=>p.name!=='Part '+(p.index+1)));
});
