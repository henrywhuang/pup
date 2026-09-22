# Little bird turnaround

`source.html` is the supplied self-contained preview, preserved as the reference.
`turn.puc` is the exact embedded PUC1 file (68,136 bytes). `rig.json` holds the eight explicit joints and their parent links from that preview. No skeleton is inferred from artwork.

The public player can load the original HTML directly without executing its scripts:

```js
const bird = await loadPup('source.html');
renderCanvas(bird, canvas, 0.6, {clip: 'turn', bones: true});
```

Alternatively load `turn.puc` and pass the `bones` mapping from `rig.json` to the renderer. PUC1 uses the browser's built-in gzip decompression; no gzip package or WASM runtime is added.

`reference.webp` and `reference.json` are transparent, 60 Hz comparison captures from the original HTML's Canvas output, not a separately authored WebP motion reference. The comparison identifies them as original HTML rendering. The HTML bundle size includes its embedded player and base64 payload, while the PUC download contains animation data only.

Code and character asset terms are in the repository root.
