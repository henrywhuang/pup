# Reconstructing from WebP and SVG

The WebP supplies timing and poses; the SVG supplies geometry and colors.
Editable intermediate files make every correction reviewable.

## Author's model recommendation

Use **Astra with max reasoning** for this reconstruction workflow. The author's
experience: only this configuration worked reliably; other models wasted time.
This is project experience, not a controlled benchmark. The compiler and player
are ordinary code and do not require a model.

## Workflow

1. Run `pup prepare reference.webp artwork.svg work/` to extract original frame
   times, a scrubber sheet and SVG IDs. The `--fps` value is only a fallback
   when the WebP lacks usable durations.
2. Identify semantic parts. Preserve original body/face silhouettes. Separate
   hands, head/ears, face skin, expression shapes and tail layers.
3. Fit rigid motion with group transforms; deform only shapes that change.
   Eyes and smiles should remain simple circle/arc geometry.
4. Author named clips in `motion.json` and the rig in `rig.svg`. Preserve
   anticipation, pose switches, holds and reset timing.
5. Compile and compare endpoints plus intermediate frames. Scrub tightly around
   hand-state switches and facial transitions.
6. Keep the sources and reproducible command beside the PUP.

Use [the reconstruction prompt](../prompts/rebuild-pup.md). Preparation produces
evidence; the author or agent performs rigging and motion work.

## Geometry rules

- Fix attachments in limbs or drawing layers. Do not reshape the body to hide
  a hand defect.
- Keep connected face-color regions on the same head transform. A muzzle patch
  moving with the mouth can separate from adjacent eye patches.
- Use genuine continuous eyelid/jaw morphs, not opacity swapping.
- Use separate hand components when the reference changes pose/topology.
- Tail stripes/tips move with the tail silhouette.
- Do not add outlines absent from the artwork.

## Fidelity

The examples include intentional cleanup. Show the differences honestly; do not
claim pixel identity after changing eyes, smiles or timing.
The raccoon retargets the fox timing from an SVG reference. No original raccoon
WebP is included.
