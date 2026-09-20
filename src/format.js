/**
 * .pup — a puppet: one character's art, rig and keyframes as one
 * little-endian byte layout, written by tools/pup.mjs and read here into the
 * typed views src/rig.js evaluates. Fixed-width fields, in this order:
 *
 *   'PUP1'
 *   u16 w, h, slots · u16 nodes, shapes, geoms, clips · u8 motion clips, play steps
 *   node:  u16 parent (0xFFFF = none) · f32×6 rest (tx ty rotate sx sy opacity)
 *   shape: u16 node · u8 layer · u16 geom · u32 fill · u8 flags (1 evenOdd,
 *          2 stroke, 4 follow, 8 bend) · u8 n + u16×n clips
 *          [stroke: u32 colour f32 width u8 cap u8 join]
 *          [follow: u16 target u16 slot f32 at]
 *          [bend: u8 n + u16×n pivots · f32×6n bind · u16 m + f32×m weights]
 *   geom:  u8 kind — 0: u16 n + u8×n verbs (0 M 1 L 2 C 3 Z) · u16 m + f32×2m points
 *                    1: u8 closed · u16 slot · u16 n · f32×6n vertices
 *   clip:  u16 source · u8 evenOdd
 *   motion clip: u8 n + utf8×n name · f32 duration · u8 n eases (u8 kind f32×4) · u16 n tracks
 *          (u16 slot · u16 twin (0xFFFF none) · f32 twin offset · u16 n keys
 *          (f32 t f32 v u8 ease))
 *   play:  u8 clip · f32 cut
 *
 * The bundle carries each .pup as base64 (tools/pup-transformer.js); decode
 * runs on whichever thread needs the puppet — the UI thread builds its own
 * copy, so nothing here is ever copied across runtimes.
 *
 * @format
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function fromBase64(text) {
    'worklet';
    const lookup = new Uint8Array(128);
    for (let i = 0; i < B64.length; i++)
        lookup[B64.charCodeAt(i)] = i;
    let pad = 0;
    while (text.charCodeAt(text.length - 1 - pad) === 61)
        pad += 1;
    const out = new Uint8Array((text.length / 4) * 3 - pad);
    let o = 0;
    for (let i = 0; i < text.length; i += 4) {
        const n = (lookup[text.charCodeAt(i)] << 18) |
            (lookup[text.charCodeAt(i + 1)] << 12) |
            (lookup[text.charCodeAt(i + 2)] << 6) |
            lookup[text.charCodeAt(i + 3)];
        out[o++] = (n >> 16) & 255;
        if (o < out.length)
            out[o++] = (n >> 8) & 255;
        if (o < out.length)
            out[o++] = n & 255;
    }
    return out;
}
export function decodePup(base64) {
    'worklet';
    const bytes = fromBase64(base64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    const u8 = () => view.getUint8(at++);
    const u16 = () => {
        const v = view.getUint16(at, true);
        at += 2;
        return v;
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
        for (let i = 0; i < n; i++)
            out[i] = f32();
        return out;
    };
    const u16s = (n) => {
        const out = [];
        for (let i = 0; i < n; i++)
            out.push(u16());
        return out;
    };
    if (String.fromCharCode(u8(), u8(), u8(), u8()) !== 'PUP1')
        throw new Error('not a .pup');
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
        nodeParent.push(parent === 0xffff ? -1 : parent);
        for (let k = 0; k < 6; k++)
            nodeRest[i * 6 + k] = f32();
    }
    const shapes = [];
    for (let i = 0; i < shapeCount; i++) {
        const node = u16();
        const layer = u8();
        const geom = u16();
        const fill = u32();
        const flags = u8();
        const clips = u16s(u8());
        const shape = { node, layer, geom, fill, evenOdd: (flags & 1) !== 0, stroke: null, clips, follow: null, bend: null };
        if (flags & 2)
            shape.stroke = [u32(), f32(), u8(), u8()];
        if (flags & 4)
            shape.follow = { target: u16(), slot: u16(), at: f32() };
        if (flags & 8) {
            const pivots = u16s(u8());
            const bind = f32s(pivots.length * 6);
            shape.bend = { pivots, bind, weights: f32s(u16()) };
        }
        shapes.push(shape);
    }
    const geoms = [];
    for (let i = 0; i < geomCount; i++) {
        if (u8() === 1) {
            const closed = u8() === 1;
            const slot = u16();
            geoms.push({ verts: f32s(u16() * 6), closed, slot });
        }
        else {
            const verbs = new Uint8Array(u16());
            for (let k = 0; k < verbs.length; k++)
                verbs[k] = u8();
            geoms.push({ verbs, points: f32s(u16() * 2) });
        }
    }
    const clips = [];
    for (let i = 0; i < clipCount; i++)
        clips.push({ source: u16(), evenOdd: u8() === 1 });
    const motionClips = [];
    for (let i = 0; i < motionCount; i++) {
        let name = '';
        for (let n = u8(); n > 0; n--)
            name += String.fromCharCode(u8());
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
            track[1] = twin === 0xffff ? -1 : twin;
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
    for (let i = 0; i < playCount; i++)
        play.push({ clip: u8(), cut: f32() });
    if (at !== bytes.length)
        throw new Error('.pup: trailing bytes');
    return { w, h, slots, nodeParent, nodeRest, shapes, geoms, clips, clock: { clips: motionClips, play } };
}
