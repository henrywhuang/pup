/**
 * The critter rig: evaluates a puppet (assets/critter/*.pup, decoded by
 * src/format.js) into per-frame geometry, with nothing but arithmetic —
 * no Skia, no React, no thread. The UI-thread frame loop (useCritterPeek)
 * and the Jest suite both drive it.
 *
 * A critter is
 *   - channels: one float per animatable number — six per transform node
 *     (tx, ty, rotate, sx, sy, opacity), six per animated vertex (x, y, in
 *     handle angle + length, out handle angle + length), one per follower;
 *   - nodes: the transform tree, parent-first, node 0 the artboard;
 *   - shapes, in paint order: a node, a geometry, a fill and/or stroke, the
 *     clips it draws under, and optionally a follow (it rides the outline of
 *     another shape) or a bend (its points are carried by pivot nodes);
 *   - a clock: named clips of keyframe tracks over the channels, played in
 *     order (each until its cut, or its end), or one at a time by name.
 *
 * advance(dt) moves the clock and writes the channels; solve() turns the
 * channels into world matrices, colours and (for animated geometry) points.
 *
 * Every function here runs on the UI thread as a worklet; helpers are
 * declared before the functions that use them, which is how the worklet
 * closures find them.
 *
 * @format
 */
const EASE_HOLD = 1;
const EASE_CUBIC = 2;
const EASE_ELASTIC = 3;
/** y of the unit cubic bezier (0,0)-(x1,y1)-(x2,y2)-(1,1) at horizontal x. */
function cubicEase(x, x1, y1, x2, y2) {
    'worklet';
    if (x <= 0)
        return 0;
    if (x >= 1)
        return 1;
    const ax = 1 - 3 * x2 + 3 * x1;
    const bx = 3 * x2 - 6 * x1;
    const cx = 3 * x1;
    let t = x;
    for (let i = 0; i < 8; i++) {
        const fx = ((ax * t + bx) * t + cx) * t - x;
        const dx = (3 * ax * t + 2 * bx) * t + cx;
        if (Math.abs(fx) < 1e-6 || dx < 1e-6)
            break;
        t -= fx / dx;
    }
    if (t < 0 || t > 1) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 20; i++) {
            t = (lo + hi) / 2;
            if (((ax * t + bx) * t + cx) * t < x)
                lo = t;
            else
                hi = t;
        }
    }
    const ay = 1 - 3 * y2 + 3 * y1;
    const by = 3 * y2 - 6 * y1;
    return ((ay * t + by) * t + 3 * y1) * t;
}
/** Ease-out elastic: overshoot by `amplitude`, ring with `period`. */
function elasticEase(x, amplitude, period) {
    'worklet';
    if (x <= 0)
        return 0;
    if (x >= 1)
        return 1;
    const a = amplitude < 1 ? 1 : amplitude;
    const s = (period / (2 * Math.PI)) * Math.asin(1 / a);
    return a * Math.pow(2, -10 * x) * Math.sin(((x - s) * 2 * Math.PI) / period) + 1;
}
function ease(kind, f) {
    'worklet';
    switch (kind[0]) {
        case EASE_HOLD:
            return 0;
        case EASE_CUBIC:
            return cubicEase(f, kind[1], kind[2], kind[3], kind[4]);
        case EASE_ELASTIC:
            return elasticEase(f, kind[1], kind[2]);
        default:
            return f;
    }
}
/** Writes every track of the clip at time t into the channels. */
function applyClip(rig, clip, t) {
    'worklet';
    const { tracks, eases } = rig.art.clock.clips[clip];
    const props = rig.props;
    for (let k = 0; k < tracks.length; k++) {
        const track = tracks[k];
        const last = track.length - 3;
        let value;
        const sampleTime = t + (rig.poseSlots[track[0]] ? 1e-6 : 0);
        if (sampleTime <= track[3])
            value = track[4];
        else if (sampleTime >= track[last])
            value = track[last + 1];
        else {
            let i = 3;
            while (track[i + 3] <= sampleTime)
                i += 3;
            const t0 = track[i];
            const v0 = track[i + 1];
            const t1 = track[i + 3];
            const v1 = track[i + 4];
            value = v0 + (v1 - v0) * ease(eases[track[i + 2]], Math.max(0, Math.min(1, (sampleTime - t0) / (t1 - t0))));
        }
        props[track[0]] = value;
        if (track[1] >= 0)
            props[track[1]] = value + track[2];
    }
}
/** Back to the first pose of the first clip. */
export function restart(rig) {
    'worklet';
    const { art, props } = rig;
    for (let i = 0; i < art.nodeRest.length; i++)
        props[i] = art.nodeRest[i];
    for (const g of art.geoms)
        if (g.verts)
            for (let i = 0; i < g.verts.length; i++)
                props[g.slot + i] = g.verts[i];
        else if (g.poses)
            props[g.slot] = 0;
    rig.poseIndices.fill(0xffff);
    for (const s of art.shapes)
        if (s.follow)
            props[s.follow.slot] = s.follow.at;
    rig.playlist = art.clock.play;
    rig.step = 0;
    rig.time = 0;
    rig.done = false;
    applyClip(rig, art.clock.play[0].clip, 0);
}
/** Rest, then play just this clip (to its end). False when no clip has the name. */
export function startClip(rig, name) {
    'worklet';
    const clips = rig.art.clock.clips;
    for (let i = 0; i < clips.length; i++) {
        if (clips[i].name !== name)
            continue;
        restart(rig);
        rig.playlist = [{ clip: i, cut: -1 }];
        applyClip(rig, i, 0);
        return true;
    }
    return false;
}
export function createRig(art) {
    'worklet';
    const n = art.nodeParent.length;
    const rig = {
        art,
        props: new Float32Array(art.slots),
        world: new Float32Array(n * 6),
        alpha: new Float32Array(n),
        matrix: new Float32Array(art.shapes.length * 6),
        fillColor: new Uint32Array(art.shapes.length),
        strokeColor: new Uint32Array(art.shapes.length),
        points: art.geoms.map(g => (g.verts ? new Float32Array(g.verts) : null)),
        poseIndices: new Uint16Array(art.geoms.length).fill(0xffff),
        poseDirty: new Uint8Array(art.geoms.length),
        poseSlots: new Uint8Array(art.slots),
        followerShapes: art.shapes
            .map((shape, index) => (shape.follow ? index : -1))
            .filter(index => index >= 0)
            .sort((a, b) => art.shapes[a].node - art.shapes[b].node),
        followDirty: new Uint8Array(n),
        playlist: art.clock.play,
        step: 0,
        time: 0,
        done: false,
    };
    for (const geom of art.geoms) if (geom.poses) rig.poseSlots[geom.slot] = 1;
    restart(rig);
    return rig;
}
/**
 * Moves the clock by dt seconds. Returns false once the last clip has been
 * written at its end — that pose is still worth drawing; the next call is not.
 */
export function advance(rig, dt) {
    'worklet';
    if (rig.done)
        return false;
    const play = rig.playlist;
    const clips = rig.art.clock.clips;
    let remaining = Math.max(0, dt);
    while (!rig.done) {
        const step = play[rig.step];
        const clip = clips[step.clip];
        const end = step.cut >= 0 ? step.cut : clip.duration;
        const elapsed = Math.min(remaining, Math.max(0, end - rig.time));
        rig.time += elapsed;
        applyClip(rig, step.clip, Math.min(rig.time, clip.duration));
        if (rig.time < end)
            break;
        if (rig.step + 1 >= play.length) {
            rig.done = true;
            break;
        }
        // Carry the cut pose into sparse clips and retain the frame's extra time.
        remaining -= elapsed;
        rig.step += 1;
        rig.time = 0;
    }
    return !rig.done;
}
function bezierAt(pts, a, b, t, out) {
    'worklet';
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out[0] = w0 * pts[a] + w1 * pts[a + 4] + w2 * pts[b + 2] + w3 * pts[b];
    out[1] = w0 * pts[a + 1] + w1 * pts[a + 5] + w2 * pts[b + 3] + w3 * pts[b + 1];
}
const OUTLINE_STEPS = 16;
/** Point and heading at a fraction of the outline's length (wrapping). */
function alongOutline(pts, closed, fraction, out) {
    'worklet';
    const n = pts.length / 6;
    const segs = closed ? n : n - 1;
    const p = [0, 0];
    // Pass 1: the flattened length of every segment.
    const lengths = [];
    let total = 0;
    for (let s = 0; s < segs; s++) {
        const a = s * 6;
        const b = ((s + 1) % n) * 6;
        let px = pts[a];
        let py = pts[a + 1];
        let len = 0;
        for (let i = 1; i <= OUTLINE_STEPS; i++) {
            bezierAt(pts, a, b, i / OUTLINE_STEPS, p);
            len += Math.hypot(p[0] - px, p[1] - py);
            px = p[0];
            py = p[1];
        }
        lengths.push(len);
        total += len;
    }
    let f = fraction - Math.floor(fraction);
    if (fraction !== 0 && f === 0)
        f = 1;
    let target = f * total;
    // Pass 2: the segment holding that distance, then the step inside it.
    let s = 0;
    while (s < segs - 1 && target > lengths[s]) {
        target -= lengths[s];
        s += 1;
    }
    const a = s * 6;
    const b = ((s + 1) % n) * 6;
    let px = pts[a];
    let py = pts[a + 1];
    let acc = 0;
    let t = 1;
    for (let i = 1; i <= OUTLINE_STEPS; i++) {
        bezierAt(pts, a, b, i / OUTLINE_STEPS, p);
        const d = Math.hypot(p[0] - px, p[1] - py);
        if (acc + d >= target || i === OUTLINE_STEPS) {
            t = (i - 1 + (d > 0 ? Math.min(1, (target - acc) / d) : 0)) / OUTLINE_STEPS;
            break;
        }
        acc += d;
        px = p[0];
        py = p[1];
    }
    bezierAt(pts, a, b, t, p);
    out[0] = p[0];
    out[1] = p[1];
    const u = 1 - t;
    const dx = 3 * u * u * (pts[a + 4] - pts[a]) + 6 * u * t * (pts[b + 2] - pts[a + 4]) + 3 * t * t * (pts[b] - pts[b + 2]);
    const dy = 3 * u * u * (pts[a + 5] - pts[a + 1]) + 6 * u * t * (pts[b + 3] - pts[a + 5]) + 3 * t * t * (pts[b + 1] - pts[b + 3]);
    out[2] = Math.atan2(dy, dx);
}
function nodeWorld(rig, i) {
    'worklet';
    const { props, world, alpha } = rig;
    const p = rig.art.nodeParent[i];
    const s = i * 6;
    const c = Math.cos(props[s + 2]);
    const sn = Math.sin(props[s + 2]);
    const a = c * props[s + 3];
    const b = sn * props[s + 3];
    const cc = -sn * props[s + 4];
    const d = c * props[s + 4];
    const e = props[s];
    const f = props[s + 1];
    const q = p * 6;
    const pa = world[q];
    const pb = world[q + 1];
    const pc = world[q + 2];
    const pd = world[q + 3];
    world[s] = pa * a + pc * b;
    world[s + 1] = pb * a + pd * b;
    world[s + 2] = pa * cc + pc * d;
    world[s + 3] = pb * cc + pd * d;
    world[s + 4] = pa * e + pc * f + world[q + 4];
    world[s + 5] = pb * e + pd * f + world[q + 5];
    alpha[i] = alpha[p] * props[s + 5];
}
/** Local vertex channels → points (in the geometry's own space). */
function geomPoints(props, slot, out) {
    'worklet';
    for (let k = 0; k < out.length; k += 6) {
        const x = props[slot + k];
        const y = props[slot + k + 1];
        out[k] = x;
        out[k + 1] = y;
        out[k + 2] = x + Math.cos(props[slot + k + 2]) * props[slot + k + 3];
        out[k + 3] = y + Math.sin(props[slot + k + 2]) * props[slot + k + 3];
        out[k + 4] = x + Math.cos(props[slot + k + 4]) * props[slot + k + 5];
        out[k + 5] = y + Math.sin(props[slot + k + 4]) * props[slot + k + 5];
    }
}
function withOpacity(argb, opacity) {
    'worklet';
    if (argb === 0)
        return 0;
    // eslint-disable-next-line no-bitwise
    const a = Math.round((argb >>> 24) * Math.max(0, Math.min(1, opacity)));
    // eslint-disable-next-line no-bitwise
    return ((a << 24) | (argb & 0xffffff)) >>> 0;
}
/** Channels → world matrices, colours and animated points. */
export function solve(rig) {
    'worklet';
    const { art, props, world, alpha, matrix, points } = rig;
    const n = art.nodeParent.length;
    world[0] = 1;
    world[1] = 0;
    world[2] = 0;
    world[3] = 1;
    world[4] = 0;
    world[5] = 0;
    alpha[0] = 1;
    for (let i = 1; i < n; i++)
        nodeWorld(rig, i);
    for (let g = 0; g < art.geoms.length; g++) {
        const geom = art.geoms[g];
        if (geom.verts)
            geomPoints(props, geom.slot, points[g]);
        else if (geom.poses) {
            const index = Math.max(0, Math.min(geom.poses.length - 1, Math.floor(props[geom.slot] + 1e-5)));
            rig.poseDirty[g] = rig.poseIndices[g] !== index ? 1 : 0;
            rig.poseIndices[g] = index;
        }
    }
    // Followers: the node's position and heading become a point on the
    // target's outline (targets are always compiled as vertices), then
    // whatever hangs below the follower is derived again.
    const at = [0, 0, 0];
    for (const i of rig.followerShapes) {
        const follow = art.shapes[i].follow;
        const target = art.shapes[follow.target];
        const geom = art.geoms[target.geom];
        const local = points[target.geom];
        const tw = target.node * 6;
        const pts = new Float32Array(local.length);
        for (let k = 0; k < local.length; k += 2) {
            pts[k] = world[tw] * local[k] + world[tw + 2] * local[k + 1] + world[tw + 4];
            pts[k + 1] = world[tw + 1] * local[k] + world[tw + 3] * local[k + 1] + world[tw + 5];
        }
        alongOutline(pts, geom.verts ? geom.closed : true, props[follow.slot], at);
        const node = art.shapes[i].node;
        const s = node * 6;
        const sx = Math.hypot(world[s], world[s + 1]);
        const sy = sx === 0 ? 0 : (world[s] * world[s + 3] - world[s + 2] * world[s + 1]) / sx;
        const c = Math.cos(at[2]);
        const sn = Math.sin(at[2]);
        world[s] = c * sx;
        world[s + 1] = sn * sx;
        world[s + 2] = -sn * sy;
        world[s + 3] = c * sy;
        world[s + 4] = at[0];
        world[s + 5] = at[1];
        // Only this follower's actual descendants inherit its new matrix.
        // A later independent follower must not be overwritten with its rest pose.
        const dirty = rig.followDirty;
        dirty.fill(0);
        dirty[node] = 1;
        for (let child = node + 1; child < n; child++) {
            const parent = art.nodeParent[child];
            if (parent >= 0 && dirty[parent]) {
                nodeWorld(rig, child);
                dirty[child] = 1;
            }
        }
    }
    for (let i = 0; i < art.shapes.length; i++) {
        const shape = art.shapes[i];
        const m = i * 6;
        if (shape.bend) {
            // Points ride their pivots: each pivot carries the point from where it
            // stood at bind time; the weights blend the carried copies.
            const { pivots, bind, weights } = shape.bend;
            const carried = [];
            for (let p = 0; p < pivots.length; p++) {
                const w = pivots[p] * 6;
                const b = p * 6;
                carried.push(world[w] * bind[b] + world[w + 2] * bind[b + 1], world[w + 1] * bind[b] + world[w + 3] * bind[b + 1], world[w] * bind[b + 2] + world[w + 2] * bind[b + 3], world[w + 1] * bind[b + 2] + world[w + 3] * bind[b + 3], world[w] * bind[b + 4] + world[w + 2] * bind[b + 5] + world[w + 4], world[w + 1] * bind[b + 4] + world[w + 3] * bind[b + 5] + world[w + 5]);
            }
            const pts = points[shape.geom];
            const np = pivots.length;
            for (let k = 0; k < pts.length; k += 2) {
                const x = pts[k];
                const y = pts[k + 1];
                let wx = 0;
                let wy = 0;
                const wo = (k / 2) * np;
                for (let p = 0; p < np; p++) {
                    const wt = weights[wo + p];
                    if (wt === 0)
                        continue;
                    const c = p * 6;
                    wx += wt * (carried[c] * x + carried[c + 2] * y + carried[c + 4]);
                    wy += wt * (carried[c + 1] * x + carried[c + 3] * y + carried[c + 5]);
                }
                pts[k] = wx;
                pts[k + 1] = wy;
            }
            matrix[m] = 1;
            matrix[m + 1] = 0;
            matrix[m + 2] = 0;
            matrix[m + 3] = 1;
            matrix[m + 4] = 0;
            matrix[m + 5] = 0;
        }
        else {
            const w = shape.node * 6;
            for (let k = 0; k < 6; k++)
                matrix[m + k] = world[w + k];
        }
        const a = alpha[shape.node];
        rig.fillColor[i] = withOpacity(shape.fill, a);
        rig.strokeColor[i] = shape.stroke ? withOpacity(shape.stroke[0], a) : 0;
    }
}
/** Jumps the clock to `seconds` from the start (the debug lab's scrubber). */
export function seek(rig, seconds) {
    'worklet';
    const play = rig.playlist;
    const clips = rig.art.clock.clips;
    restart(rig);
    rig.playlist = play;
    let t = Math.max(0, seconds);
    for (let i = 0; i < play.length; i++) {
        const step = play[i];
        const clip = clips[step.clip];
        const end = step.cut >= 0 ? step.cut : clip.duration;
        if (t >= end && i + 1 < play.length) {
            // Clips are sparse: carry unkeyed channels from the previous cut pose,
            // exactly as sequential playback does, before applying the next clip.
            applyClip(rig, step.clip, Math.min(end, clip.duration));
            t -= end;
            continue;
        }
        rig.step = i;
        rig.time = Math.min(t, end);
        applyClip(rig, step.clip, Math.min(rig.time, clip.duration));
        rig.done = i + 1 >= play.length && t >= end;
        return;
    }
}
