# Dance examples

These are the exact approved files supplied for publication:

1. **Fox dance** — `fox/animation.pup`, 85,387 bytes, PUP2 with compact cubic pose banks and the approved mouth-seam repair. The release runs for 4.633 seconds; the original 4.883-second WebP includes an additional final hold. The comparison ends at the PUP release boundary. Its supplied poses and tail motion are not rebuilt or altered during publication.
2. **Raccoon dance** — `raccoon/animation.pup`, 22,222 bytes, a lossless PUPZ wrapper around the 35,100-byte PUP1 compatibility file. One 4.332-second dance, continuous rig deformation and original SVG colors.
3. **Bird dance** — `bird/animation.pup`, 9,575 bytes, a lossless PUPZ wrapper around 14,828 bytes of PUP1. One 4.033-second dance, alongside the exact supplied 671,718-byte WebP (97 frames). These supplied files are published unchanged.

The fox and raccoon directories contain the original WebP reference plus editable rig/motion snapshots. The bird directory contains the supplied animation and reference. The raccoon also includes its original artwork and a plain PUP1 compatibility download. Demo artwork remains under the root ASSETS.md terms.

Reproduce these releases with the matching compiler:

```sh
pup import examples/dance/fox/rig.svg examples/dance/fox/motion.json fox-dance.pup
pup import examples/dance/raccoon/rig.svg examples/dance/raccoon/motion.json raccoon-dance.compat.pup
pup pack raccoon-dance.compat.pup raccoon-dance.pup
```

No raster frames are embedded in these PUP files. The scrubber sheets are comparison-only resources, generated from the WebPs at build time.

The fox keeps the approved four pose selections (F021 → F004, F035 → F019,
F037 → F004, F052 → F020). The subsequent mouth repair joins the brown oral
regions into a continuous base while preserving the tongue, other 20 banks,
and all motion tracks. Its resulting size is 85,387 bytes.

The raccoon retains the selected raised-hand motion derived from its F8
curves. Its full arms and shoulder links sit behind the head; separate palms
reuse the authored distal curves in front and close smoothly at the wrist.
The foreground palms omit corners created by the original head occlusion.
Head/body/full-arm/leg/tail geometry and motion remain unchanged. The editable
snapshots reproduce these updated files.
