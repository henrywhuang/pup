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

`parsePup(bytes)` accepts ArrayBuffer, typed-array byte views or base64.
`durationOf(puppet, clip)` returns seconds; null measures the default playlist.
`poseAt(puppet, seconds, clip)` evaluates a pose.
`drawCanvas(puppet, context, { layer: 0 })` paints a solved pose in artboard
coordinates under the host's transform. Draw layers 0/1 around a host card.

## Native SVG and other renderers

`createSvgRenderer(puppet)` returns `{ svg, render, dispose }`. Append the SVG
to a sized container and call `render(seconds, { clip, wireframe, layer })`.
Clip IDs are unique per instance.

`createRig`, `startClip`, `advance`, `seek` and `solve` expose the evaluator.
After solving, read shape matrices, colors and animated points from the rig.
Each animated vertex contains point x/y, incoming-handle x/y and outgoing-handle
x/y. Connect adjacent vertices with cubics, apply shape matrices and clipping,
then paint in stored order. Canvas and SVG adapters demonstrate this contract.
