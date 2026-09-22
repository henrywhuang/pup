import {unpackPup} from './compact.js';

function poseContours(contours) {
  "worklet";
  const verbs = [], points = [];
  for (const contour of contours) {
    const n = contour.length / 2;
    if (n < 3) continue;
    const tangents = new Float32Array(contour.length);
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n * 2, c = i * 2, q = (i + 1) % n * 2;
      const ax = contour[c] - contour[p], ay = contour[c + 1] - contour[p + 1];
      const bx = contour[q] - contour[c], by = contour[q + 1] - contour[c + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if ((ax * bx + ay * by) / Math.max(1e-3, la * lb) <= -0.15) continue;
      let x = (contour[q] - contour[p]) * 0.16, y = (contour[q + 1] - contour[p + 1]) * 0.16;
      const length = Math.hypot(x, y), limit = Math.min(la, lb) * 0.42;
      if (length > limit) {
        x *= limit / length;
        y *= limit / length;
      }
      tangents[c] = x;
      tangents[c + 1] = y;
    }
    verbs.push(0);
    points.push(contour[0], contour[1]);
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = (i + 1) % n * 2;
      verbs.push(2);
      points.push(contour[a] + tangents[a], contour[a + 1] + tangents[a + 1], contour[b] - tangents[b], contour[b + 1] - tangents[b + 1], contour[b], contour[b + 1]);
    }
    verbs.push(3);
  }
  return { verbs: new Uint8Array(verbs), points: new Float32Array(points) };
}
function cubicPoseContours(contours) {
  "worklet";
  const verbs = [], points = [];
  for (const contour of contours) {
    const count = contour.length / 6;
    if (count < 2) continue;
    verbs.push(0);
    points.push(contour[0], contour[1]);
    for (let i = 0; i < count; i++) {
      const a = i * 6, b = (i + 1) % count * 6;
      verbs.push(2);
      points.push(contour[a + 4], contour[a + 5], contour[b + 2], contour[b + 3], contour[b], contour[b + 1]);
    }
    verbs.push(3);
  }
  return { verbs: new Uint8Array(verbs), points: new Float32Array(points) };
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fromBase64(text) {
  "worklet";
  const lookup = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  let pad = 0;
  while (text.charCodeAt(text.length - 1 - pad) === 61) pad += 1;
  const out = new Uint8Array(text.length / 4 * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n = lookup[text.charCodeAt(i)] << 18 | lookup[text.charCodeAt(i + 1)] << 12 | lookup[text.charCodeAt(i + 2)] << 6 | lookup[text.charCodeAt(i + 3)];
    out[o++] = n >> 16 & 255;
    if (o < out.length) out[o++] = n >> 8 & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
function decodePup(base64) {
  "worklet";
  const bytes = unpackPup(fromBase64(base64));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const u16 = () => {
    const v = view.getUint16(at, true);
    at += 2;
    return v;
  };
  const i16 = () => {
    const v = view.getInt16(at, true);
    at += 2;
    return v;
  };
  const delta = () => {
    let value = 0;
    for (let i = 0; i < 3; i++) {
      const b = u8();
      value |= (b & 127) << i * 7;
      if (!(b & 128)) return value >>> 1 ^ -(value & 1);
    }
    throw new Error(".pup: invalid contour delta");
  };
  const u32 = () => {
    const v = view.getUint32(at, true);
    at += 4;
    return v;
  };
  const f32 = () => {
    const v = view.getFloat32(at, true);
    at += 4;
    return v;
  };
  const f32s = (n) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = f32();
    return out;
  };
  const u16s = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(u16());
    return out;
  };
  const magic = String.fromCharCode(u8(), u8(), u8(), u8());
  if (magic !== "PUP1" && magic !== "PUP2") throw new Error("not a supported .pup");
  const w = u16();
  const h = u16();
  const slots = u16();
  const nodeCount = u16();
  const shapeCount = u16();
  const geomCount = u16();
  const clipCount = u16();
  const motionCount = u8();
  const playCount = u8();
  const nodeParent = [];
  const nodeRest = new Float32Array(nodeCount * 6);
  for (let i = 0; i < nodeCount; i++) {
    const parent = u16();
    nodeParent.push(parent === 65535 ? -1 : parent);
    for (let k = 0; k < 6; k++) nodeRest[i * 6 + k] = f32();
  }
  const shapes = [];
  for (let i = 0; i < shapeCount; i++) {
    const node = u16();
    const layer = u8();
    const geom = u16();
    const fill = u32();
    const flags = u8();
    const clips2 = u16s(u8());
    const shape = { node, layer, geom, fill, evenOdd: (flags & 1) !== 0, stroke: null, clips: clips2, follow: null, bend: null };
    if (flags & 2) shape.stroke = [u32(), f32(), u8(), u8()];
    if (flags & 4) shape.follow = { target: u16(), slot: u16(), at: f32() };
    if (flags & 8) {
      const pivots = u16s(u8());
      const bind = f32s(pivots.length * 6);
      shape.bend = { pivots, bind, weights: f32s(u16()) };
    }
    shapes.push(shape);
  }
  const cubicPool = [];
  const cubicIndex = () => {
    let value = 0;
    for (let i = 0; i < 3; i++) {
      const b = u8();
      value |= (b & 127) << i * 7;
      if (!(b & 128)) return value;
    }
    throw new Error(".pup: invalid cubic reference");
  };
  const geoms = [];
  for (let i = 0; i < geomCount; i++) {
    const kind = u8();
    if (kind === 2 && magic === "PUP2") {
      const slot = u16(), count = u16(), quantum = f32(), encoding = u8();
      if (encoding > 3) throw new Error(".pup: unsupported contour encoding");
      if (!count || !(quantum > 0)) throw new Error(".pup: invalid pose bank");
      const poses = [];
      for (let p = 0; p < count; p++) {
        const token = encoding === 3 ? cubicIndex() : -1;
        if (token === 0) {
          poses.push(cubicPoseContours([]));
          continue;
        }
        if (token > 0 && !(token & 1)) {
          const prior = (token >>> 1) - 1;
          if (prior >= p) throw new Error(".pup: invalid pose reference");
          poses.push(poses[prior]);
          continue;
        }
        const contours = [];
        for (let c = encoding === 3 ? token >>> 1 : u16(); c > 0; c--) {
          const points = new Float32Array(u16() * (encoding >= 2 ? 6 : 2));
          let x = 0, y = 0;
          if (encoding === 3) {
            x = delta();
            y = delta();
            const sx = x, sy = y, n = points.length / 6;
            for (let k = 0; k < n; k++) {
              const token2 = cubicIndex();
              let curve;
              if (!token2) {
                curve = Array.from({ length: 6 }, delta);
                cubicPool.push(curve);
              } else {
                const source = cubicPool[(token2 >>> 1) - 1];
                if (!source) throw new Error(".pup: invalid cubic reference");
                curve = token2 & 1 ? [-source[0], -source[1], source[4], source[5], source[2], source[3]] : source;
              }
              const a = k * 6, b = (k + 1) % n * 6, nx = x + curve[0], ny = y + curve[1];
              points[a] = x * quantum;
              points[a + 1] = y * quantum;
              points[a + 4] = (x + curve[2]) * quantum;
              points[a + 5] = (y + curve[3]) * quantum;
              points[b + 2] = (nx + curve[4]) * quantum;
              points[b + 3] = (ny + curve[5]) * quantum;
              x = nx;
              y = ny;
            }
            if (x !== sx || y !== sy) throw new Error(".pup: unclosed cubic contour");
          } else for (let k = 0; k < points.length; k += 2) {
            if (encoding) {
              x += delta();
              y += delta();
            } else {
              x = i16();
              y = i16();
            }
            points[k] = x * quantum;
            points[k + 1] = y * quantum;
          }
          contours.push(points);
        }
        poses.push(encoding >= 2 ? cubicPoseContours(contours) : poseContours(contours));
      }
      geoms.push({ poses, slot });
    } else if (kind === 1) {
      const closed = u8() === 1;
      const slot = u16();
      geoms.push({ verts: f32s(u16() * 6), closed, slot });
    } else if (kind === 0) {
      const verbs = new Uint8Array(u16());
      for (let k = 0; k < verbs.length; k++) verbs[k] = u8();
      geoms.push({ verbs, points: f32s(u16() * 2) });
    } else throw new Error(".pup: unsupported geometry kind");
  }
  const clips = [];
  for (let i = 0; i < clipCount; i++) clips.push({ source: u16(), evenOdd: u8() === 1 });
  const motionClips = [];
  for (let i = 0; i < motionCount; i++) {
    let name = "";
    for (let n = u8(); n > 0; n--) name += String.fromCharCode(u8());
    const duration = f32();
    const eases = [];
    for (let n = u8(); n > 0; n--) {
      const kind = u8();
      const e = f32s(4);
      eases.push(new Float32Array([kind, e[0], e[1], e[2], e[3]]));
    }
    const tracks = [];
    for (let n = u16(); n > 0; n--) {
      const slot = u16();
      const twin = u16();
      const offset = f32();
      const keys = u16();
      const track = new Float32Array(3 + keys * 3);
      track[0] = slot;
      track[1] = twin === 65535 ? -1 : twin;
      track[2] = offset;
      for (let k = 0; k < keys; k++) {
        track[3 + k * 3] = f32();
        track[4 + k * 3] = f32();
        track[5 + k * 3] = u8();
      }
      tracks.push(track);
    }
    motionClips.push({ name, duration, tracks, eases });
  }
  const play = [];
  for (let i = 0; i < playCount; i++) play.push({ clip: u8(), cut: f32() });
  if (at !== bytes.length) throw new Error(".pup: trailing bytes");
  return { w, h, slots, nodeParent, nodeRest, shapes, geoms, clips, clock: { clips: motionClips, play } };
}
export {
  decodePup
};
