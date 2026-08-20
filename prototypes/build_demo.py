# PROTOTYPE — assembles warp-model-demo.html from warp_demo_src.html,
# inlining out/bands.json and the downscaled plate JPEGs as data URIs.
# Usage: uv run prototypes/build_demo.py  (run extract_bands.py first)

import base64
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

data = json.loads((OUT / "bands.json").read_text())
images = {
    k: "data:image/jpeg;base64,"
    + base64.b64encode((OUT / f"{k}.jpg").read_bytes()).decode()
    for k in data
}

html = (HERE / "warp_demo_src.html").read_text()
html = html.replace("__BANDS_JSON__", json.dumps(data))
html = html.replace("__IMAGES_JSON__", json.dumps(images))
target = HERE / "warp-model-demo.html"
target.write_text(html)
print(f"wrote {target} ({target.stat().st_size / 1024:.0f} KB)")
