# Dance examples

These are the exact approved files supplied for publication:

1. **Fox dance** — `fox/animation.pup`, 76,557 bytes, a lossless PUPZ wrapper around 79,914 bytes of PUP2. The approved G release has 56 foreground poses, a fixed tail prototype, corrected stepping and the F108 shoulder repair. The release runs for 4.633 seconds; the original 4.883-second WebP includes an additional final hold. The comparison ends at the PUP release boundary. The supplied file is preserved byte for byte.
2. **Raccoon dance** — `raccoon/animation.pup`, 22,222 bytes, a lossless PUPZ wrapper around the 35,100-byte PUP1 compatibility file. One 4.332-second dance, continuous rig deformation and original SVG colors.
3. **Bird dance** — `bird/animation.pup`, 9,575 bytes, a lossless PUPZ wrapper around 14,828 bytes of PUP1. One 4.033-second dance, alongside the exact supplied 671,718-byte WebP (97 frames). These supplied files are published unchanged.

All three directories contain the original WebP reference, editable authoring data and binding JSON. Fox uses `rig.json`, a compiled-art snapshot that reproduces the reviewed bytes exactly; the other dances use SVG/motion sources. Bird dance uses the included `tools/bird-precision.mjs` recipe to reproduce its supplied bytes. The raccoon also includes its original artwork and a plain PUP1 compatibility download. Demo artwork remains under the root ASSETS.md terms.

Reproduce these releases with the matching compiler:

```sh
npm run examples # rebuilds the fox from rig.json and refreshes bindings
pup import examples/dance/raccoon/rig.svg examples/dance/raccoon/motion.json raccoon-dance.compat.pup
pup pack raccoon-dance.compat.pup raccoon-dance.pup
```

No raster frames are embedded in these PUP files. The scrubber sheets are comparison-only resources, generated from the WebPs at build time.

The fox uses one 16-phase stepping cycle with eight phases per side. Its
recurring root bounce follows the opposite support-foot height. The complete
tail silhouette stays fixed, and the clapping section reuses the opening sway
through translation and rotation. Cheek/body seams, the nose/mouth connection,
rounded soles and F108 shoulder continuity are preserved in the approved data.
No additional raster frames, runtime package or invented skeleton is used.
The checksum is
`1492c331a8ea7cc8eab3fdb5c48ee11b2dc8081365c1028dd5e2764d9e90a91f`.

The raccoon retains the selected raised-hand motion derived from its F8
curves. Its full arms and shoulder links sit behind the head; separate palms
reuse the authored distal curves in front and close smoothly at the wrist.
The foreground palms omit corners created by the original head occlusion.
Head/body/full-arm/leg/tail geometry and motion remain unchanged. The editable
snapshots reproduce these updated files.
