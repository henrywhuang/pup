/** Explicit semantic joints. Morph controls are not inferred to be bones. */
export function skeletonPoints(puppet, bones) {
  if (bones === true) bones = puppet.skeleton;
  if (!bones) return [];
  const points = Object.entries(bones).map(([name, bone]) => {
    const index = bone.runtimeNode;
    if (!Number.isInteger(index) || index < 0 || index >= puppet.art.nodeParent.length)
      throw new Error('Invalid skeleton node: ' + name);
    return { name, label: bone.label ?? name, parent: bone.parent ?? null,
      x: puppet.rig.world[index * 6 + 4], y: puppet.rig.world[index * 6 + 5] };
  });
  // Keep adjacent joint labels readable without moving the actual joints.
  const labels = [];
  for (const point of points) {
    const box = {x:point.x + 7, y:point.y - 6, w:String(point.label).length * 5.5};
    while (labels.some(other => box.x < other.x + other.w && box.x + box.w > other.x && Math.abs(box.y - other.y) < 11)) box.y -= 12;
    point.labelX = box.x; point.labelY = box.y; labels.push(box);
  }
  return points;
}

export function drawSkeleton(puppet, ctx, bones) {
  const points = skeletonPoints(puppet, bones), lookup = new Map(points.map(p => [p.name, p]));
  ctx.save(); ctx.lineWidth = 2; ctx.font = '9px system-ui';
  for (const point of points) {
    ctx.strokeStyle = '#167d85';
    const parent = lookup.get(point.parent);
    if (parent) { ctx.beginPath(); ctx.moveTo(parent.x, parent.y); ctx.lineTo(point.x, point.y); ctx.stroke(); }
    ctx.fillStyle = '#f7fffc'; ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#12646e'; ctx.fillText(point.label, point.labelX, point.labelY);
  }
  ctx.restore();
}

export function syncSvgSkeleton(group, puppet, bones) {
  if (!bones) { group.setAttribute('display', 'none'); return; }
  group.removeAttribute('display');
  const ns = 'http://www.w3.org/2000/svg', points = skeletonPoints(puppet, bones);
  const lookup = new Map(points.map(p => [p.name, p]));
  if (group.childElementCount !== points.length) {
    group.replaceChildren(...points.map(() => {
      const joint = document.createElementNS(ns, 'g');
      for (const tag of ['line', 'circle', 'text']) joint.append(document.createElementNS(ns, tag));
      return joint;
    }));
  }
  points.forEach((point, i) => {
    const [line, circle, text] = group.children[i].children, parent = lookup.get(point.parent);
    line.setAttribute('display', parent ? 'inline' : 'none');
    if (parent) {
      for (const [key, value] of Object.entries({x1:parent.x,y1:parent.y,x2:point.x,y2:point.y,stroke:'#167d85','stroke-width':2})) line.setAttribute(key, value);
    }
    for (const [key, value] of Object.entries({cx:point.x,cy:point.y,r:4,fill:'#f7fffc',stroke:'#167d85','stroke-width':2})) circle.setAttribute(key, value);
    for (const [key, value] of Object.entries({x:point.labelX,y:point.labelY,fill:'#12646e','font-size':9,'font-family':'system-ui'})) text.setAttribute(key, value);
    text.textContent = point.label;
  });
}
