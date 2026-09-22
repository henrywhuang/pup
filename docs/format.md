# SVG, motion and compact containers

PUP1 is an experimental little-endian binary containing an artboard, transform
hierarchy, shared paths, paints, clipping, optional path-follow/skinning data,
named actions and a default playlist. It is not yet a stable interchange standard.

## SVG

Use semantic, unique IDs. Groups named `behind` and `front` map to layers 0
and 1. A host may draw a card between them. Transforms use the order
`translate(x y) rotate(degrees) scale(x y)`.

The importer accepts a focused SVG shape/path subset with solid fills/strokes
and clip paths. Convert unsupported paint/filter/text effects to supported
geometry before import. Do not silently drop visible artwork.

- `data-follow` and `data-follow-at` attach a shape to an outline.
- `data-bend` names deformation pivots.
- `data-bend-bind` stores one affine bind matrix per pivot.
- `data-bend-weights` stores weights for each vertex and both handles.

See the checked-in rigs for complete examples. Keep geometry sparse and
recognizable; avoid tracing dense contours for every animation frame.

## Motion

```json
{
  "clips": {
    "correct": {
      "fps": 1000,
      "frames": 1083,
      "tracks": {
        "head": { "ty": [[0, 120], [250, 132, "ease"], [1083, 120]] }
      }
    }
  },
  "play": [{"clip": "correct"}]
}
```

Keys and duration use the declared fps; runtime API time is always seconds.
Transform channels are `tx`, `ty`, `rotate`, `sx`, `sy` and `opacity`.
Keys are `[frame, value, easing?]`. Omitted easing is linear; supported easing
includes `hold`, `ease`, `cubic(x1,y1,x2,y2)` and `elastic(amplitude,period)`.

A playlist may cut into another clip with `{"clip":"name","cut":0.5}`.
Applications may instead start actions by name.

The compiler header documents per-vertex position and handle channels.
The examples demonstrate pivot-driven expression morphs.

## Packing

`pup import` performs lossless packing: static geometry sharing, duplicate-track
sharing, redundant constant keys and unanimated identity nodes are consolidated.
Tests compare world-space geometry against the unoptimized representation.
No bitmap frames are stored in the PUP examples.

## Additional supported encodings

- **PUP2:** extends PUP1 geometry with indexed vector pose banks. The frozen
  fox dance uses encoding 3: shared cubic segments, reversible segments and
  repeated poses. A hold track selects the authored pose; the player does not
  interpolate incompatible path topologies. Canvas/SVG paths are cached lazily.
- **PUPZ:** a lossless byte wrapper around PUP1 or PUP2. It uses a small LZ
  decoder and reversible byte transforms, implemented with typed arrays and
  no package dependencies. `pup pack input.pup output.pup` creates it. The
  raccoon dance expands from 22,222 B to the exact 35,100 B compatibility file.
- **PUC1:** the provided bird preview's existing container. Its gzip payload
  contains a static PUP1 rig, shared sample times, track selection bitmaps and
  quantized delta values. The decoder restores the mirrored turnaround tracks
  exactly as the supplied preview does. Loading uses native browser gzip and
  is asynchronous. This project reads this format; it does not re-quantize it.

The bird's semantic bone map is separate metadata, extracted from the original
HTML or supplied as `rig.json`. A pose bank is not a semantic skeleton.
`pup optimize` preserves PUP2/PUPZ bytes instead of silently expanding or
re-encoding their geometry. All encodings are experimental and should be used
with the matching player/compiler release.
