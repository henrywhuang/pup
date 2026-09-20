"""Bundle the published puppets without adding a browser ZIP dependency."""
import json
from pathlib import Path
import sys
import zipfile

spec = json.load(sys.stdin)
with zipfile.ZipFile(spec["output"], "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for item in spec["files"]:
        info = zipfile.ZipInfo(item["name"], date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, Path(item["path"]).read_bytes(), compresslevel=9)
