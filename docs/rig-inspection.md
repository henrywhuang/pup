# Inspecting rigs and deformation bindings

The live demo's **Rig / bindings** checkbox exposes the data actually stored
in the selected animation. The available views depend on that data:

- **Named skeleton:** explicit joint metadata supplied with the turnaround bird.
- **Deformation bindings:** select a part to see solved curve anchors and
  handles. Select a bound control to show its relative influence. Blue is
  positive, pink is negative; the coefficient range is displayed numerically.
- **Transform pivots:** node origins and their stored parent links. Coincident
  origins are grouped; out-of-view origins are counted rather than relocated.
  Dense views show labels on hover or after selecting a part.
- **Vector pose banks:** the selected part's current pose index. Fox dance
  has pose banks, not a skeletal rig, so no artificial skeleton is drawn.

The same overlay works with Canvas and SVG. It is separate from animation
rendering, so toggling inspection does not change the artwork pixels or the
pixel-difference comparison. Pivots used as morph coefficients are not
necessarily anatomical joints. Bézier handles can lie outside a filled shape.

## Downloaded data

Each example has a `bindings.json` (the peek examples use character-prefixed
names). Download it from the inspector or the animation's download card.
The ZIP includes all eight binding files.

The JSON records the animation SHA-256, artboard, node hierarchy, rest
transforms, part/node associations, inverse bind matrices and exact signed
per-point weights. Weight layout is **vertex × anchor/incoming/outgoing ×
pivot**, matching the PUP evaluator. Morph channels and pose-bank counts are
included. This is a readable export of the bindings already inside the PUP;
the player does not require the JSON to animate the character.

For the five examples with SVG/motion sources, names are mapped through the
actual optimizer's node remapping and the rebuilt bytes must match the
published asset. The turnaround bird uses its provided named skeleton.
Peek files without authoring IDs use stable node/part indices instead of
invented names. Bird dance's original precision pass is retained, with exact
byte-for-byte verification; it is not applied to other files.

## CLI and optional API

```sh
node bin/pup.mjs bindings animation.pup animation.bindings.json
```

```js
import { loadPup, poseAt } from '@henrywhuang/pup';
import { describeRig, deformationPoints } from '@henrywhuang/pup/inspection';

const puppet = await loadPup('raccoon-dance.pup');
const data = describeRig(puppet);
poseAt(puppet, 0.275, 'dance');
const controls = deformationPoints(puppet, partIndex); // artboard coordinates
```

The inspection module is an optional entry point. It is not imported by the
default player bundle. No npm runtime dependency or WASM is required, and
the demo fetches binding JSON only when inspection is enabled.
