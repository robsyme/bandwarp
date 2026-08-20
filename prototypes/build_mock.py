# PROTOTYPE — assembles workflow-mock.html from workflow_mock_src.html,
# inlining out/bands.json and the Gel 4B display JPEG.
# Usage: uv run prototypes/build_mock.py  (run extract_bands.py first)

import base64
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

data = json.loads((OUT / "bands.json").read_text())
images = {
    "gel4b": "data:image/jpeg;base64,"
    + base64.b64encode((OUT / "gel4b.jpg").read_bytes()).decode()
}

html = (HERE / "workflow_mock_src.html").read_text()
html = html.replace("__BANDS_JSON__", json.dumps({"gel4b": data["gel4b"]}))
html = html.replace("__IMAGES_JSON__", json.dumps(images))
target = HERE / "workflow-mock.html"
target.write_text(html)
print(f"wrote {target} ({target.stat().st_size / 1024:.0f} KB)")
