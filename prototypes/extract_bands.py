# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "pillow"]
# ///
# PROTOTYPE — throwaway band-center extraction feeding warp-model-demo.html.
# Not the detection ticket's answer; just gets realistic band centers per lane.
#
# Usage: uv run prototypes/extract_bands.py
# Writes prototypes/out/<plate>.json, <plate>.jpg (downscaled), <plate>_overlay.png

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

PLATES = {
    "gel4a": "examples/Gel4A_Bef.jpeg",
    "gel4b": "examples/Gel4B_Aft.jpg",
    "gel5a": "examples/Gel5A_Aft.jpeg",
}

# Each photo shows two developed regions; the labeled analysis region is the
# lower one. In the real tool the Operator marks this — here it's hard-coded
# as a fraction of the bright-plate bounding box height.
REGION = {
    "gel4a": (0.08, 1.0),
    "gel4b": (0.35, 1.0),
    "gel5a": (0.30, 1.0),
}

DISPLAY_W = 1400


def plate_bbox(g):
    """Bright (fluorescent) region bounding box from the green channel."""
    thr = g.max() * 0.35
    mask = g > thr
    cols = mask.mean(axis=0) > 0.2
    rows = mask.mean(axis=1) > 0.2
    x0, x1 = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
    y0, y1 = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
    return x0, x1, y0, y1


def main():
    result = {}
    for name, rel in PLATES.items():
        im = ImageOps.exif_transpose(Image.open(ROOT / rel)).convert("RGB")
        g = np.asarray(im, dtype=np.float32)[:, :, 1]
        x0, x1, y0, y1 = plate_bbox(g)
        f0, f1 = REGION[name]
        y0, y1 = y0 + int(f0 * (y1 - y0)), y0 + int(f1 * (y1 - y0))
        plate = g[y0:y1, x0:x1]
        h, w = plate.shape

        # Signal = local darkness on the bright plate. Normalize each column
        # by a heavily smoothed background estimate to flatten illumination.
        bg = gaussian_filter1d(plate, sigma=h / 8, axis=0)
        sig = np.clip(1.0 - plate / (bg + 1e-6), 0, None)

        # Lanes: column profile of signal, smoothed; peaks = lane centers.
        # Lanes are spotted on a regular pitch, so detect confident peaks,
        # take the median spacing as the pitch, and fill interior gaps.
        colprof = gaussian_filter1d(sig.mean(axis=0), sigma=w / 400)
        strong, _ = find_peaks(colprof, distance=w / 50,
                               prominence=0.25 * colprof.std())
        weak, _ = find_peaks(colprof, distance=w / 50,
                             prominence=0.05 * colprof.std())
        # Regular spotting pitch: smallest strong gap is one lane; estimate
        # the unit, then lay a full grid across the plate, snapping to weak
        # peaks where present. Grid lanes with no bands are dropped later.
        d = np.diff(strong)
        unit0 = d.min()
        unit = float(np.median(d / np.round(d / unit0)))
        lane_px = []
        k0 = -int(strong[0] // unit)
        k = k0
        while (x := strong[0] + k * unit) < w - unit / 3:
            if x > unit / 3:
                near = [wx for wx in weak if abs(wx - x) < 0.3 * unit]
                lane_px.append(int(min(near, key=lambda wx: abs(wx - x))
                                   if near else round(x)))
            k += 1
        lanes = []
        half = int(w / 70)
        for lx in lane_px:
            lane = sig[:, max(0, lx - half):lx + half].mean(axis=1)
            lane_s = gaussian_filter1d(lane, sigma=h / 300)
            pk, pp = find_peaks(lane_s, distance=h / 60,
                                prominence=max(0.012, 0.8 * lane_s.std()))
            # drop origin spots (bottom ~quarter) and the plate's top edge
            keep = [(int(y), float(pp["prominences"][i]))
                    for i, y in enumerate(pk)
                    if 0.04 * h < y < 0.76 * h]
            if keep:
                lanes.append({
                    "x": int(lx),
                    "bands": [{"y": y, "strength": round(s, 4)} for y, s in keep],
                })

        # Downscaled display image (plate crop only)
        crop = im.crop((x0, y0, x1, y1))
        scale = DISPLAY_W / crop.width
        disp = crop.resize((DISPLAY_W, int(crop.height * scale)))
        disp.save(OUT / f"{name}.jpg", quality=72)

        # Overlay for my own verification (full res crop, marked)
        ov = crop.copy()
        d = ImageDraw.Draw(ov)
        for ln in lanes:
            d.line([(ln["x"], 0), (ln["x"], h)], fill=(255, 0, 0), width=2)
            for b in ln["bands"]:
                r = 12
                d.ellipse([ln["x"] - r, b["y"] - r, ln["x"] + r, b["y"] + r],
                          outline=(255, 0, 255), width=4)
        ov.resize((DISPLAY_W, int(crop.height * scale))).save(
            OUT / f"{name}_overlay.png")

        result[name] = {
            "source": rel,
            "crop": [int(x0), int(y0), int(x1), int(y1)],
            "scale": round(scale, 5),
            "width": DISPLAY_W,
            "height": disp.height,
            "lanes": [
                {
                    "x": round(ln["x"] * scale, 1),
                    "bands": [
                        {"y": round(b["y"] * scale, 1), "strength": b["strength"]}
                        for b in ln["bands"]
                    ],
                }
                for ln in lanes
            ],
        }
        print(f"{name}: {len(lanes)} lanes, "
              f"{sum(len(l['bands']) for l in result[name]['lanes'])} bands")

    (OUT / "bands.json").write_text(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
