import { poseAt } from './canvas.js';
import {syncSvgSkeleton} from './skeleton.js';

const NS = 'http://www.w3.org/2000/svg';
let nextId = 0;
const element = name => document.createElementNS(NS, name);
const color = n => 'rgba(' + (n >>> 16 & 255) + ',' + (n >>> 8 & 255) + ',' +
  (n & 255) + ',' + ((n >>> 24) / 255) + ')';
const number = n => Number(n.toFixed(6));
const matrix = values => 'matrix(' + Array.from(values, number).join(' ') + ')';

function pathData(geometry, points) {
  if (geometry.verts) {
    const n = points.length / 6;
    let d = 'M' + number(points[0]) + ' ' + number(points[1]);
    for (let i = 0; i < (geometry.closed ? n : n - 1); i++) {
      const a = i * 6, b = ((i + 1) % n) * 6;
      d += 'C' + [points[a + 4], points[a + 5], points[b + 2], points[b + 3], points[b], points[b + 1]].map(number).join(' ');
    }
    return geometry.closed ? d + 'Z' : d;
  }
  let d = '', offset = 0;
  for (const verb of geometry.verbs) {
    const count = [2, 2, 6, 0][verb];
    d += ['M', 'L', 'C', 'Z'][verb] + Array.from(geometry.points.subarray(offset, offset + count), number).join(' ');
    offset += count;
  }
  return d;
}

/** A native SVG renderer. Clip IDs are unique, so multiple puppets can coexist. */
export function createSvgRenderer(puppet, { label = 'PUP animation' } = {}) {
  const { art } = puppet;
  const prefix = 'pup-' + (++nextId) + '-';
  const svg = element('svg');
  svg.setAttribute('viewBox', '0 0 ' + art.w + ' ' + art.h);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const defs = element('defs');
  svg.append(defs);
  const clips = art.clips.map((clip, i) => {
    const node = element('clipPath');
    node.id = prefix + i;
    node.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const path = element('path');
    node.append(path); defs.append(node);
    return path;
  });
  const paths = art.shapes.map(shape => {
    let parent = svg;
    for (const index of shape.clips) {
      const group = element('g');
      group.setAttribute('clip-path', 'url(#' + prefix + index + ')');
      parent.append(group); parent = group;
    }
    const path = element('path');
    if (shape.stroke) {
      path.setAttribute('stroke-width', shape.stroke[1]);
      path.setAttribute('stroke-linecap', ['butt', 'round', 'square'][shape.stroke[2]]);
      path.setAttribute('stroke-linejoin', ['miter', 'round', 'bevel'][shape.stroke[3]]);
    }
    parent.append(path);
    return path;
  });
  const skeleton = element('g');
  skeleton.setAttribute('aria-label', 'Skeleton');
  skeleton.setAttribute('pointer-events', 'none');
  svg.append(skeleton);
  const posePaths = art.geoms.map(g => g.poses ? new Map() : null);
  return {
    svg,
    render(seconds, { clip = null, wireframe = false, layer = null, bones = null } = {}) {
      poseAt(puppet, seconds, clip);
      const { rig } = puppet;
      const ds = art.geoms.map((g, i) => {
        if (!g.poses) return pathData(g, rig.points[i]);
        const index = rig.poseIndices[i], cache = posePaths[i];
        if (!cache.has(index)) cache.set(index, pathData(g.poses[index], null));
        return cache.get(index);
      });
      art.clips.forEach((clip, i) => {
        const shape = art.shapes[clip.source];
        clips[i].setAttribute('d', ds[shape.geom]);
        clips[i].setAttribute('transform', matrix(rig.matrix.subarray(clip.source * 6, clip.source * 6 + 6)));
        clips[i].setAttribute('clip-rule', clip.evenOdd ? 'evenodd' : 'nonzero');
      });
      art.shapes.forEach((shape, i) => {
        const path = paths[i];
        path.setAttribute('d', ds[shape.geom]);
        path.setAttribute('transform', matrix(rig.matrix.subarray(i * 6, i * 6 + 6)));
        path.setAttribute('fill', rig.fillColor[i] ? color(rig.fillColor[i]) : 'none');
        path.setAttribute('fill-rule', shape.evenOdd ? 'evenodd' : 'nonzero');
        path.setAttribute('display', layer != null && shape.layer !== layer ? 'none' : 'inline');
        path.setAttribute('stroke', wireframe ? '#316b7caa' : rig.strokeColor[i] ? color(rig.strokeColor[i]) : 'none');
        if (wireframe || shape.stroke) path.setAttribute('stroke-width', wireframe ? 0.6 : shape.stroke[1]);
      });
      syncSvgSkeleton(skeleton, puppet, bones);
    },
    dispose() { svg.remove(); },
  };
}
