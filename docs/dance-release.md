# Dance examples and preview compatibility — 2026-09-22

The first two examples are Fox dance and Raccoon dance, with PUP displayed
before the WebP reference. The third is the supplied little bird turnaround
HTML, replayed by the shared player with its eight explicit joints. Existing
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
| Fox dance | 87,035 | Frozen PUP2 dance, 4.633 seconds |
| Raccoon dance | 21,021 | PUPZ dance, 4.332 seconds; 31,068-byte PUP1 fallback |
| Little bird | 68,136 | Original embedded PUC1 turn; separate eight-joint map |

The two dance files are preserved byte for byte and can be reproduced from
the checked-in rigs. The bird file is extracted unchanged from `source.html`.
Downloads include the seven main examples, the bone map and the PUP1 fallback.

## Validation

All 17 automated tests pass, covering released bytes, pose selection, packed
geometry, HTML extraction, skeleton coordinates and existing feedback/peek
regressions. Rebuilding the examples produces identical bytes.

Browser checks cover desktop and 390-pixel mobile layouts, Canvas/SVG,
forward/reverse playback, seek, loop, speed, overlays, outlines, bone toggles,
case switches and real downloads. The default dance page requests no Rive or
WASM files. The bird's Canvas render is pixel-identical to the original HTML
at 0, 0.4, 0.9 and 1.4 seconds. Canvas/SVG comparisons cover 15 representative
poses; the fox is identical at all six checked poses, with only sparse edge
rasterization differences in the other examples.
