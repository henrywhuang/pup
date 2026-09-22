# Little bird turnaround

`source.html` is the supplied self-contained animation preview, preserved for compatibility.
`turn.puc` is the exact embedded PUC1 file (68,136 bytes). `rig.json` holds the eight explicit joints and their parent links from that preview. No skeleton is inferred from artwork.

The public player can load the original HTML directly without executing its scripts:

```js
const bird = await loadPup('source.html');
renderCanvas(bird, canvas, 0.6, {clip: 'turn', bones: true});
```

Alternatively load `turn.puc` and pass the `bones` mapping from `rig.json` to the renderer. PUC1 uses the browser's built-in gzip decompression; no gzip package or WASM runtime is added.

`views/` contains the seven original Figma SVGs extracted byte for byte from
the data URLs inside the supplied `preview-v5.html`. They total **48,123 bytes**.
The comparison draws these actual SVGs on the left, with a selector for all
seven views; the right plays the continuous turnaround. Selecting a source
view pauses playback so it can be inspected alongside any scrubbed pose.
These SVGs are static views, not an independent reference animation.

The source-size figure counts only those seven SVG files. The **68,136-byte**
PUC contains geometry and motion. HTML, base64 and player code are excluded
from both figures. The old captured reference sheet is no longer needed.

Code and character asset terms are in the repository root.
