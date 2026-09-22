// Optional inspection helpers. Kept out of the default player bundle.
const nodeProperties = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'];

/** Export the stored binding data, not inferred anatomical bones. */
export function describeRig(puppet, {names = {}, skeleton = null, asset = null} = {}) {
  const {art} = puppet;
  const animated = new Map();
  for (const clip of art.clock.clips) for (const track of clip.tracks) {
    for (const slot of [track[0], track[1]]) if (slot >= 0) {
      if (!animated.has(slot)) animated.set(slot, []);
      if (!animated.get(slot).includes(clip.name)) animated.get(slot).push(clip.name);
    }
  }
  const nodes = Array.from(art.nodeParent, (parent, index) => ({
    index, name: names.nodes?.[index]?.[0] ?? 'Node ' + index,
    aliases: names.nodes?.[index] ?? [], parent,
    rest: Array.from(art.nodeRest.slice(index * 6, index * 6 + 6)),
    animatedProperties: nodeProperties.filter((_, i) => animated.has(index * 6 + i)),
  }));
  const parts = art.shapes.map((shape, index) => {
    const g = art.geoms[shape.geom];
    const vertexChannels = g.verts ? Array.from({length:g.verts.length}, (_, i) => i).filter(i => animated.has(g.slot + i)) : [];
    return {
      index, name: names.shapes?.[index] ?? 'Part ' + (index + 1), node: shape.node,
      layer: shape.layer, geometry: shape.geom,
      kind: g.poses ? 'pose-bank' : shape.bend ? 'weighted' : vertexChannels.length ? 'vertex-morph' : 'transform',
      vertexCount: g.verts ? g.verts.length / 6 : 0,
      animatedVertexChannels: vertexChannels,
      poseCount: g.poses?.length ?? 0, poseSlot: g.poses ? g.slot : null,
      clips: [...shape.clips],
      follow: shape.follow ? {...shape.follow} : null,
      binding: shape.bend ? {
        pivots: Array.from(shape.bend.pivots),
        inverseBindMatrices: Array.from({length:shape.bend.pivots.length}, (_, i) => Array.from(shape.bend.bind.slice(i * 6, i * 6 + 6))),
        weights: Array.from(shape.bend.weights),
      } : null,
    };
  });
  const summary = {
    nodes: nodes.length,
    animatedNodes: nodes.filter(n => n.animatedProperties.length).length,
    weightedParts: parts.filter(p => p.kind === 'weighted').length,
    morphedParts: parts.filter(p => p.kind === 'vertex-morph').length,
    poseBanks: parts.filter(p => p.kind === 'pose-bank').length,
    semanticJoints: skeleton ? Object.keys(skeleton).length : 0,
  };
  return {
    schema: 'pup-rig-inspection', version: 1, asset, artboard: {width:art.w, height:art.h},
    conventions: {
      nodeRest: nodeProperties, rotation: 'radians', matrix: ['a','b','c','d','tx','ty'],
      vertexPoints: ['anchor','incoming','outgoing'],
      vertexChannels: ['x','y','incomingAngle','incomingLength','outgoingAngle','outgoingLength'],
      weights: 'Flat array: vertex × 3 point roles × pivot. Signed morph coefficients are preserved; not all pivots are anatomical joints.',
    },
    summary, nodes, parts, skeleton,
    clips: art.clock.clips.map(c => ({name:c.name, duration:c.duration, tracks:c.tracks.length})),
  };
}

/** Solved anchors/handles for a specific part, in artboard coordinates. */
export function deformationPoints(puppet, partIndex) {
  const {art, rig} = puppet, shape = art.shapes[partIndex];
  if (!shape) throw new Error('Unknown part: ' + partIndex);
  const g = art.geoms[shape.geom];
  if (!g.verts) return [];
  const q = rig.points[shape.geom], m = rig.matrix.subarray(partIndex * 6, partIndex * 6 + 6);
  const point = offset => ({x:m[0]*q[offset]+m[2]*q[offset+1]+m[4], y:m[1]*q[offset]+m[3]*q[offset+1]+m[5]});
  return Array.from({length:q.length/6}, (_, i) => ({index:i,
    anchor:point(i*6), incoming:point(i*6+2), outgoing:point(i*6+4),
    weights: shape.bend ? Array.from({length:3}, (_, role) =>
      Array.from(shape.bend.weights.slice((i*3+role)*shape.bend.pivots.length, (i*3+role+1)*shape.bend.pivots.length))) : null,
  }));
}

export function inspectionModes(descriptor) {
  const s = descriptor.summary, modes = [];
  if (s.semanticJoints) modes.push('skeleton');
  if (s.weightedParts || s.morphedParts) modes.push('deformation');
  if (s.animatedNodes || s.weightedParts) modes.push('transforms');
  if (s.poseBanks) modes.push('poses');
  return modes;
}
