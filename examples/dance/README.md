# Dance examples

These are the exact approved files supplied for publication:

1. **Fox dance** — `fox/animation.pup`, 87,035 bytes, PUP2 with compact cubic pose banks. The frozen release runs for 4.633 seconds; the original 4.883-second WebP includes an additional final hold. The comparison ends at the PUP release boundary. Its supplied poses and tail motion are not rebuilt or altered during publication.
2. **Raccoon dance** — `raccoon/animation.pup`, 21,021 bytes, a lossless PUPZ wrapper around the 31,068-byte PUP1 compatibility file. One 4.332-second dance, continuous rig deformation and original SVG colors.

Both directories contain the original WebP reference plus editable rig/motion snapshots. The raccoon also includes its original artwork and a plain PUP1 compatibility download. Demo artwork remains under the root ASSETS.md terms.

Reproduce these releases with the matching compiler:

```sh
pup import examples/dance/fox/rig.svg examples/dance/fox/motion.json fox-dance.pup
pup import examples/dance/raccoon/rig.svg examples/dance/raccoon/motion.json raccoon-dance.compat.pup
pup pack raccoon-dance.compat.pup raccoon-dance.pup
```

No raster frames are embedded in either PUP. The scrubber sheets are comparison-only resources, generated from the WebPs at build time.
