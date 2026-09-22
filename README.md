# PUP

**Small files. Real vector motion.**

A compact character-animation format with named actions, editable SVG rigs,
keyframes, layered drawing and continuous path deformation. The player uses
Canvas or native SVG, with no WASM and no runtime package dependencies.

[Live comparison](https://henrywhuang.github.io/pup/) ·
[Download PUP files](https://henrywhuang.github.io/pup/#downloads) ·
[中文说明](README.zh-CN.md) · [Authoring guide](docs/authoring.md)

## Real comparisons

- **01 Fox dance / 02 Raccoon dance:** the approved dance files, with the
  original WebP on the left and PUP on the right. Both downloads are preserved byte for byte.
- **03 Bird dance:** the supplied 9,575-byte PUP beside its 97-frame WebP reference.
- **04 Little bird:** seven original SVG views on the left, the supplied
  turnaround animation on the right, including eight moving joints in Canvas and SVG.
- **WebP / PUP:** the original fox reference and its vector reconstruction,
  with synchronized scrubbing, frame stepping, overlay and pixel difference.
- **Rive / PUP:** original fox/raccoon body and hand Rive artboards beside the
  PUP card-peek reconstruction, on the same clock and card placement.
- **SVG / PUP:** the raccoon SVG skin reusing the two feedback action timings.

Sizes are calculated from real files at build time. Runtime distributions and
animation assets are reported separately. PUP is a focused character player;
Rive provides a much broader editor and runtime system.

The demo has a **Download PUP** button below the current animation. Its
Downloads section offers all eight example animations individually or in one ZIP.
The bird uses `.puc` plus a downloadable bone map; the ZIP includes that map
and the raccoon's unwrapped PUP1 compatibility file.
Each reaction file contains both the correct and wrong actions.

## Run

Node.js 22+ and Python with Pillow:

```sh
git clone https://github.com/henrywhuang/pup.git
cd pup
npm ci
python3 -m pip install -r requirements.txt
npm run dev
```

Open `http://127.0.0.1:4320`. Rive's JS/WASM loads only for the Rive comparison.

```sh
npm test
npm run build       # static demo in dist/
npm run examples    # reproduce feedback/dance files and extract the bird preview
```

## WebP + SVG → PUP

The **WebP supplies motion and timing**. The **SVG supplies vector geometry**.
An author or agent produces an editable rig and motion file, then compiles them
into one PUP.

```sh
node bin/pup.mjs prepare reference.webp artwork.svg work/
# Author work/rig.svg and work/motion.json from the frames and part IDs.
node bin/pup.mjs import work/rig.svg work/motion.json work/animation.pup
```

Preparation extracts frame timing, a lossless scrubber sheet and SVG part IDs.
It does not automatically infer a finished rig or expression shapes. Use the
[reconstruction prompt](prompts/rebuild-pup.md) for the agent-assisted workflow.
The included feedback and fox/raccoon dance rigs compile to the exact distributed PUP bytes.
Bird dance preserves the supplied PUP and WebP files without re-authoring them.
The bird preserves the animation embedded in its original HTML preview.

> **Author's workflow note:** Only **Astra + max reasoning** worked reliably
> for this reconstruction workflow in my experience; other models wasted time.
> Use that setup when reproducing the authoring process.
>
> This is the author's project experience, not a cross-model benchmark.
> The compiler and player themselves do not require a model.

## Player

```sh
npm install github:henrywhuang/pup
```

```js
import { CanvasPlayer } from '@henrywhuang/pup';

const actor = await CanvasPlayer.load(canvas, '/characters/fox.pup');
actor.play('correct'); // once, then hold the last pose
actor.play('wrong');
actor.seek(0.375);
actor.pause();
actor.dispose();
```

For native SVG:

```js
import { loadPup, createSvgRenderer } from '@henrywhuang/pup';
const puppet = await loadPup('/characters/fox.pup');
const renderer = createSvgRenderer(puppet);
container.append(renderer.svg);
renderer.render(0.375, { clip: 'correct' });
renderer.dispose();
```

The evaluator is renderer-independent. Hosts can paint its solved paths through
another renderer; the business application uses Skia on mobile. See [the API](docs/api.md).

## Example sizes

| Example | PUP file | Contents |
| --- | ---: | --- |
| Fox dance | 85,387 B | `dance` · PUP2 cubic pose banks |
| Raccoon dance | 22,222 B | `dance` · lossless PUPZ (35,100 B plain PUP1) |
| Bird dance | 9,575 B | `dance` · lossless PUPZ · 4.033 seconds |
| Little bird | 68,136 B | `turn` · PUC1, with a separate eight-joint map |
| Fox feedback | 12,669 B | `correct` + `wrong` |
| Raccoon feedback | 14,563 B | `correct` + `wrong` |
| Fox peek | 10,656 B | body/hand layers + peek playlist |
| Raccoon peek | 6,339 B | body/hand layers + peek playlist |

These are example measurements, not a promise about arbitrary animations.
The original two fox WebPs total 266,476 B. The reconstruction deliberately
regularizes eyes/smiles and adds continuous expressions, so it is not a
pixel-identical copy of the raster reference.

PUP supports transforms, solid paints, clipping, named actions, easing,
path following and weighted control-point deformation. It does not provide
Rive's visual editor, state-machine authoring or full renderer feature set.
See [the authoring contract](docs/format.md).

PUP1, PUP2 and the compact containers remain experimental. Keep the compiler
and runtime from the same release. See [format support](docs/format.md).

## Player changes for these examples

See the [change and dependency report](docs/dance-release.md) for measured
bundle sizes and verification details.

The player reads PUP2 pose banks, the lossless PUPZ wrapper and the supplied
PUC1 container. Canvas and SVG cache pose paths on first use. `loadPup()` can
also extract the bird animation and bone map directly from its HTML, without
executing the embedded scripts. Bones use explicit node mappings; pose-only
files do not acquire a made-up skeleton.

There are **no new npm dependencies**. PUC1 uses the browser's built-in
`DecompressionStream('gzip')`. PUP1/PUP2/PUPZ do not need this API. Rive remains
an existing demo-only development dependency and loads only in the Rive tab.
The shared, minified browser bundle is measured in the live demo; reference
frame sheets are comparison assets and are not part of the player or PUP files.

## License

Code: [MIT](LICENSE). Original character artwork and reference animations:
[asset terms](ASSETS.md). Bring your own artwork for products.
