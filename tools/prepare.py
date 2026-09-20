#!/usr/bin/env python3
"""Prepare WebP frames and SVG part metadata for vector motion authoring."""
from pathlib import Path
import argparse
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET

try:
    from PIL import Image
except ImportError as error:
    raise SystemExit("Install the authoring helper: python3 -m pip install Pillow") from error


def extract(reference, output, fps=24):
    output.mkdir(parents=True, exist_ok=True)
    image = Image.open(reference)
    if image.format != "WEBP":
        raise ValueError("The motion reference must be a WebP file")
    count = getattr(image, "n_frames", 1)
    if count > 600 or image.width * image.height * count > 100_000_000:
        raise ValueError("Reference is too large for one contact sheet; use a shorter or smaller clip")
    columns = min(7, count)
    sheet = Image.new("RGBA", (image.width * columns, image.height * math.ceil(count / columns)))
    frames, now, fallback = [], 0.0, False
    for index in range(count):
        image.seek(index)
        image.load()
        duration = image.info.get("duration", 0)
        if not duration or duration <= 0:
            duration = 1000 / fps
            fallback = True
        frame = image.convert("RGBA")
        sheet.paste(frame, ((index % columns) * image.width, (index // columns) * image.height))
        frames.append({"index": index, "start": round(now, 6), "duration": round(duration, 6)})
        now += duration
    sheet.save(output / "frames.webp", lossless=True)
    result = {
        "width": image.width, "height": image.height, "columns": columns,
        "frameCount": count, "duration": round(now, 6), "frames": frames,
        "timing": "fallback fps " + str(fps) if fallback else "WebP frame metadata",
    }
    (output / "reference.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def prepare(reference, artwork, output, fps):
    if output.exists() and any(output.iterdir()):
        raise ValueError("Choose an empty output directory so existing authored work is not overwritten")
    timing = extract(reference, output, fps)
    root = ET.parse(artwork).getroot()
    if root.tag.rsplit("}", 1)[-1] != "svg":
        raise ValueError("The artwork must have an SVG root")
    parts = []
    unsupported = set()
    supported = {"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "clipPath", "title", "desc", "metadata"}
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in supported:
            unsupported.add(tag)
        if node.get("id") or tag in {"path", "circle", "ellipse", "rect"}:
            parts.append({
                "id": node.get("id"), "type": tag,
                "fill": node.get("fill"), "stroke": node.get("stroke"),
            })
    shutil.copy2(reference, output / "reference.webp")
    shutil.copy2(artwork, output / "artwork.svg")
    (output / "parts.json").write_text(json.dumps({
        "viewBox": root.get("viewBox"), "parts": parts,
        "featuresToReview": sorted(unsupported),
    }, ensure_ascii=False, indent=2) + "\n")
    clip = re.sub(r"[^a-zA-Z0-9_-]+", "-", reference.stem).strip("-") or "action"
    (output / "motion.template.json").write_text(json.dumps({
        "clips": {clip: {"fps": 1000, "frames": timing["duration"], "tracks": {}}},
        "play": [{"clip": clip}],
    }, indent=2) + "\n")
    (output / "AUTHORING.md").write_text(
        "# Two source files, editable vector motion\n\n"
        "reference.webp supplies motion and timing; artwork.svg supplies curves and colors.\n"
        "frames.webp/reference.json let you inspect every reference frame. parts.json lists SVG IDs.\n\n"
        "This preparation step does not automatically infer a rig or facial deformation. "
        "Use the repository's prompts/rebuild-pup.md with an animation-capable agent, "
        "or author the rig and keyframes manually. Save the result as rig.svg and motion.json.\n\n"
        "Compile with: pup import rig.svg motion.json animation.pup\n\n"
        "Keep original body contours, model eyes and smiles as simple primitives, "
        "and validate transitions rather than only the endpoints. "
        "Do not replace vector parts with per-frame raster tracings.\n"
    )
    print(str(output) + ": " + str(timing["frameCount"]) + " reference frames, " + str(len(parts)) + " SVG parts")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("artwork", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=float, default=24)
    parser.add_argument("--frames-only", action="store_true", help="Build only the scrubber sheet and frame timing")
    args = parser.parse_args()
    if args.fps <= 0 or not math.isfinite(args.fps):
        parser.error("--fps must be a positive finite number")
    if args.frames_only:
        info = extract(args.reference, args.output, args.fps)
        print(json.dumps({"frames": info["frameCount"], "duration": info["duration"]}))
    else:
        prepare(args.reference, args.artwork, args.output, args.fps)


if __name__ == "__main__":
    main()
