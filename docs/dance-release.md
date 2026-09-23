# Dance examples and preview compatibility — 2026-09-23

The first two examples are Fox dance and Raccoon dance, with the original
on the left and PUP on the right. Bird dance is third. The fourth compares seven original bird SVG
views with the turnaround animation and its eight explicit joints. Existing
WebP, Rive and SVG comparisons remain available.

## Player changes

- Read PUP2 cubic pose banks and select their authored hold poses, including
  at exact float32 key boundaries and when seeking backward.
- Decode PUPZ losslessly. Cache Canvas/SVG pose paths when first encountered.
- Read the provided PUC1 container using native gzip decompression. Extract
  the supplied HTML's animation and JSON bone mapping without running scripts.
- Draw mapped joints, parent links and legible labels in Canvas or SVG. Joint
  positions come from the same solved transforms as the animation.
- Add reverse playback to the demo and release inactive reference sheets
  when switching cases. The public CanvasPlayer API remains compatible.

## Dependencies and size

No npm dependencies were added. `package-lock.json` is unchanged. The PUP
runtime has no package dependencies or WASM. Existing `esbuild` and Rive
Canvas Advanced remain development dependencies; Rive JS/WASM is requested
only when the Rive comparison is selected. Python/Pillow remains build-only.

With the same esbuild settings as baseline commit `8bb99b3`, the complete
browser player changes from 15,066 to 24,569 bytes minified, and from 6,196 to
9,888 bytes gzip: **+3,692 bytes gzip**. These numbers exclude demo UI and
reference images. A host using the player does not load the reference sheets.

PUC1 requires the browser's `DecompressionStream('gzip')`; there is no new
polyfill. PUP1/PUP2/PUPZ do not require that API. HTML support follows the
supplied static embedding convention, not arbitrary JavaScript previews.

## Released animation data

| Example | Exact file bytes | Contents |
| --- | ---: | --- |
| Fox dance | 76,557 | Approved G, PUPZ / PUP2, 56 foreground poses, 4.633 seconds |
| Raccoon dance | 22,222 | PUPZ dance, 4.332 seconds; 35,100-byte PUP1 fallback |
| Bird dance | 9,575 | Supplied PUPZ dance, 4.033 seconds; 97-frame WebP reference |
| Little bird | 68,136 | Original embedded PUC1 turn; separate eight-joint map |

The three dance files can be reproduced from the checked-in rigs (including
Bird dance's original precision recipe). The turnaround bird is extracted unchanged from `source.html`.
Downloads include the eight main examples, the bone map and the PUP1 fallback.

The bird's seven source SVGs are extracted unchanged from `preview-v5.html`
and total **48,123 bytes**. They are static views; the 68,136-byte PUC adds
motion data. The comparison excludes the HTML bundle and base64 overhead.
Users can select any original view on the left and scrub the animation on the
right. The original responsive stage dimensions are preserved.

The latest fox is the same approved G file now used by Piyo Mobile and Web:
76,557 bytes, SHA-256
`1492c331a8ea7cc8eab3fdb5c48ee11b2dc8081365c1028dd5e2764d9e90a91f`.
It includes the F108 shoulder correction, continuous cheek/body boundaries,
a regular stepping cycle and a fixed complete tail reusing the opening sway.
The checked-in `examples/dance/fox/rig.json` compiled-art snapshot rebuilds its
exact bytes; the binding inspector reads its real tail/body transforms and
foreground pose banks. The superseded SVG/motion snapshots remain in Git
history. This asset update adds no player runtime code or npm dependency.

The raccoon keeps the selected raised-hand motion and overlapping shoulder
attachments. Its neck-transition repair separates the foreground palm from
the upper arm: the original SVG's occlusion corner is excluded from the palm,
which closes with matching Bézier tangents. This removes the hard cut that
appeared around 0.236–0.315 seconds. The head, body, full-arm outlines and
motion are unchanged. The new PUP is 22,222 bytes, 282 bytes more than the
prior release. No new keyframes, player code or dependencies are needed.

## Validation

All 24 automated tests pass, covering released bytes, pose selection, packed
geometry, HTML extraction, skeleton coordinates and existing feedback/peek
regressions, including shoulder attachment, smooth palm closure and the reported neck-transition interval.
Rebuilding the examples produces identical bytes.

The preceding 2026-09-22 browser checks covered desktop and 390-pixel mobile layouts, Canvas/SVG,
forward/reverse playback, seek, loop, speed, overlays, outlines, bone toggles,
case switches and real downloads. The default dance page requests no Rive or
WASM files. The bird's Canvas render is pixel-identical to the original HTML
at 0, 0.4, 0.9 and 1.4 seconds. Canvas/SVG comparisons cover 15 representative
poses; the fox is identical at all six checked poses, with only sparse edge
rasterization differences in the other examples.

The optional rig inspector now exposes actual binding data for every example.
Its code and JSON load separately from the default PUP player, whose bundle
size remains unchanged. No runtime package or WASM dependency was added.
See [rig inspection](rig-inspection.md) for the data and display conventions.
