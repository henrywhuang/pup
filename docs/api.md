# Player API

The core has no runtime package dependencies. Browser drawing uses Canvas2D/
Path2D or native SVG. The evaluator is renderer-independent.

## Canvas clock

`CanvasPlayer.load(canvas, url, options)` returns a player. Set the canvas CSS
width/height; ResizeObserver maintains its backing resolution.

- `play(name, { loop: false, speed: 1 })` restarts a named clip. A null name
  selects the default playlist. A non-looping action holds its final pose.
- `pause()` stops the clock without clearing the frame.
- `seek(seconds)` changes position in the current action.
- `stop()` pauses and returns to zero.
- `resize(width, height, dpr)` sets logical size and pixel ratio.
- `dispose()` cancels the clock, disconnects resize observation and clears.

`options.onEnd(name)` receives the completed action.

## Host-owned clocks

```js
import { loadPup, renderCanvas } from '@henrywhuang/pup';
const puppet = await loadPup('fox.pup', { signal: abortController.signal });
renderCanvas(puppet, canvas, 0.375, { clip: 'correct', wireframe: false });
```

`parsePup(bytes)` synchronously accepts PUP1/PUP2/PUPZ as ArrayBuffer,
typed-array byte views or base64. `parsePuc(bytes)` is asynchronous and reads
PUC1 using the browser's native gzip decompressor. `loadPup(url)` detects these
formats, or extracts the data in the supplied self-contained HTML preview.
`durationOf(puppet, clip)` returns seconds; null measures the default playlist.
`poseAt(puppet, seconds, clip)` evaluates a pose.
`drawCanvas(puppet, context, { layer: 0 })` paints a solved pose in artboard
coordinates under the host's transform. Draw layers 0/1 around a host card.

## Native SVG and other renderers

`createSvgRenderer(puppet)` returns `{ svg, render, dispose }`. Append the SVG
to a sized container and call `render(seconds, { clip, wireframe, layer })`.
Clip IDs are unique per instance.

## Explicit skeleton overlays

```js
import { loadPup, renderCanvas, createSvgRenderer } from '@henrywhuang/pup';
const bird = await loadPup('source.html'); // extract data; do not execute HTML
renderCanvas(bird, canvas, 0.6, { clip: 'turn', bones: true });
const renderer = createSvgRenderer(bird);
container.append(renderer.svg);
renderer.render(0.6, { clip: 'turn', bones: true });
```

For a standalone `turn.puc`, load `rig.json` and pass its `bones` object instead
of `true`. Each joint is `{ runtimeNode, parent, label? }`. Node origins come
from the solved world matrices, so lines and labels move with the animation.
`CanvasPlayer.load(canvas, 'source.html', { clip: 'turn', bones: true })` works
with the optional built-in clock too. Set `player.bones = null` to hide them.
`skeletonPoints(puppet, bones)` exposes the solved coordinates to other hosts.

`parsePreview(html)` supports the supplied static `encodedPuppet` and JSON
`map` embedding contract, not arbitrary HTML/JavaScript animation programs.
No HTML scripts are evaluated. PUC1 requires `DecompressionStream('gzip')`;
there is an explicit unsupported-browser error and no downloaded polyfill.

`createRig`, `startClip`, `advance`, `seek` and `solve` expose the evaluator.
After solving, read shape matrices, colors and animated points from the rig.
Each animated vertex contains point x/y, incoming-handle x/y and outgoing-handle
x/y. Connect adjacent vertices with cubics, apply shape matrices and clipping,
then paint in stored order. Canvas and SVG adapters demonstrate this contract.
