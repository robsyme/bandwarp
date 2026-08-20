# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "pillow"]
# ///
# PROTOTYPE — detection feasibility (wayfinder ticket 003) and data source for
# warp-model-demo.html. Detects lanes and bands on the example plates:
#   1. 2D flat-field background, signal = local darkness
#   2. lane grid from spotting pitch, each lane refined by signal centroid
#   3. noise-adaptive per-lane peak detection
#   4. warp-guided rescue: fit the scaled shared warp (ticket 004's model) on
#      confident bands, then hunt faint bands where row curves predict them
#
# Usage: uv run prototypes/extract_bands.py
# Writes prototypes/out/<plate>.json, <plate>.jpg (downscaled), <plate>_overlay.png

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter, gaussian_filter1d
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
Y_MIN_FRAC, Y_MAX_FRAC = 0.04, 0.76  # exclude plate edge and origin spots


def plate_bbox(g):
    """Bright (fluorescent) region bounding box from the green channel."""
    thr = g.max() * 0.35
    mask = g > thr
    cols = mask.mean(axis=0) > 0.2
    rows = mask.mean(axis=1) > 0.2
    x0, x1 = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
    y0, y1 = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
    return x0, x1, y0, y1


def loess(xs, ys, ev, bw):
    """Gaussian-weighted local linear regression of ys(xs), evaluated at ev."""
    xs, ys, ev = map(np.asarray, (xs, ys, ev))
    W = np.exp(-0.5 * ((ev[:, None] - xs[None, :]) / bw) ** 2)
    sw, swx, swy = W.sum(1), W @ xs, W @ ys
    swxx, swxy = W @ (xs * xs), W @ (xs * ys)
    det = sw * swxx - swx * swx
    b = np.where(np.abs(det) > 1e-9, (sw * swxy - swx * swy) / det, 0.0)
    a = (swy - b * swx) / sw
    return a + b * ev


def detect_lanes(sig, w, h):
    """Lane x centers from the origin spots: every lane was spotted, so the
    origin row (dark round blobs near the bottom) marks every lane — including
    lanes whose sample produced no bands, and independent of the group gaps
    in the spotting layout (no fixed-pitch assumption)."""
    # stay clear of the plate's dark bottom edge, which otherwise wins argmax
    lo, hi = int(0.68 * h), int(0.92 * h)
    rowprof = gaussian_filter1d(sig[lo:hi].mean(axis=1), sigma=h / 200)
    # origins are the BOTTOM-MOST significant row — the lowest compound row
    # can be darker, so take the last qualifying peak, not the global max
    rp, _ = find_peaks(rowprof, prominence=0.05 * rowprof.std())
    cands = [p for p in rp if rowprof[p] > 0.35 * rowprof.max()]
    y_org = lo + int(cands[-1] if cands else np.argmax(rowprof))
    dy = int(0.05 * h)  # wide enough to survive a tilted plate
    band = sig[max(0, y_org - dy):min(h, y_org + dy)]
    org_prof = gaussian_filter1d(band.mean(axis=0), sigma=w / 500)
    org_pk, _ = find_peaks(org_prof, distance=w / 45,
                           prominence=0.06 * org_prof.std())
    gaps = np.diff(org_pk)
    unit = float(np.median(gaps)) if len(gaps) else w / 25
    # a lane with a faint origin can still have strong bands (the standards):
    # union in peaks from the whole-plate column profile
    full_prof = gaussian_filter1d(sig.mean(axis=0), sigma=w / 500)
    full_pk, _ = find_peaks(full_prof, distance=w / 45,
                            prominence=0.06 * full_prof.std())
    peaks = [(int(x), org_prof) for x in org_pk]
    for x in full_pk:
        if all(abs(x - ox) > 0.5 * unit for ox in org_pk):
            peaks.append((int(x), full_prof))
    peaks.sort()
    xs = []
    for x, prof in peaks:
        half = int(unit * 0.3)
        gl, gh = int(max(0, x - half)), int(min(w, x + half))
        win = prof[gl:gh] - prof[gl:gh].min()
        tot = win.sum()
        xs.append(int((win * np.arange(gl, gh)).sum() / tot)
                  if tot > 1e-6 else int(x))
    return xs, unit, y_org


def build_rows(bands, n_lanes, tol):
    """Greedy strongest-first row linking (mirror of the JS module)."""
    by_lane = [[] for _ in range(n_lanes)]
    for b in bands:
        by_lane[b["lane"]].append(b)
    free = {id(b) for b in bands}
    rows = []
    for seed in sorted(bands, key=lambda b: -b["strength"]):
        if id(seed) not in free:
            continue
        free.discard(id(seed))
        members = [seed]
        for step in (1, -1):
            last, prev, gaps = seed, None, 0
            li = seed["lane"] + step
            while 0 <= li < n_lanes and gaps <= 2:
                slope = ((last["y"] - prev["y"]) / (last["lane"] - prev["lane"])
                         if prev else 0.0)
                pred = last["y"] + slope * (li - last["lane"])
                cands = [c for c in by_lane[li]
                         if id(c) in free and abs(c["y"] - pred) < tol]
                if cands:
                    best = min(cands, key=lambda c: abs(c["y"] - pred))
                    free.discard(id(best))
                    members.append(best)
                    prev, last, gaps = last, best, 0
                else:
                    gaps += 1
                li += step
        rows.append(members)
    return rows


def fit_scaled_warp(bands, lane_xs, w, tol):
    """Scaled shared warp (ticket 004): y = o_r + a_r * d(x). Returns rows
    [{o, a, members}] and d per lane, or None if too little structure."""
    L = len(lane_xs)
    rows = [{"o": float(np.mean([b["y"] for b in m])), "a": 1.0, "members": m}
            for m in build_rows(bands, L, tol) if len(m) >= 4]
    if not rows:
        return None
    d = np.zeros(L)
    for _ in range(6):
        num, den = np.zeros(L), np.zeros(L)
        for r in rows:
            for b in r["members"]:
                num[b["lane"]] += r["a"] * (b["y"] - r["o"])
                den[b["lane"]] += r["a"] ** 2
        have = den > 0
        d = loess(np.array(lane_xs)[have], num[have] / den[have],
                  lane_xs, w * 0.08)
        d -= d.mean()
        s = d.std() or 1.0
        d /= s
        for r in rows:
            dv = np.array([d[b["lane"]] for b in r["members"]])
            yv = np.array([b["y"] for b in r["members"]])
            if len(r["members"]) >= 3 and dv.var() > 1e-6:
                a = float(np.cov(dv, yv, bias=True)[0, 1] / dv.var())
                r["a"] = min(max(a, 0.0), tol * 4)
            r["o"] = float(yv.mean() - r["a"] * dv.mean())
        for r in rows:
            r["members"] = []
        for b in bands:
            best = min(rows, key=lambda r: abs(b["y"] - (r["o"] + r["a"] * d[b["lane"]])))
            if abs(b["y"] - (best["o"] + best["a"] * d[b["lane"]])) < tol:
                best["members"].append(b)
        rows = [r for r in rows if len(r["members"]) >= 2]
        if not rows:
            return None
        rows.sort(key=lambda r: r["o"])
        merged = [rows[0]]
        for r in rows[1:]:
            p = merged[-1]
            gap = np.mean(np.abs((p["o"] + p["a"] * d) - (r["o"] + r["a"] * d)))
            if gap < tol * 0.7:
                p["members"] += r["members"]
                yv = np.array([b["y"] for b in p["members"]])
                dv = np.array([d[b["lane"]] for b in p["members"]])
                p["o"] = float(yv.mean() - p["a"] * dv.mean())
            else:
                merged.append(r)
        rows = merged
    return rows, d


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
        tol = 0.035 * h

        # 1. Flat-field: 2D smooth background, signal = fractional darkness
        bg = gaussian_filter(plate, sigma=(h / 6, w / 6))
        sig = np.clip(1.0 - plate / (bg + 1e-6), 0, None)

        # 2. Lanes from origin spots, centroid-refined
        lane_xs, unit, y_org = detect_lanes(sig, w, h)
        half = int(unit * 0.3)

        # 3. Per-lane profiles with noise-adaptive peak detection
        profs, noises, bands = [], [], []
        for li, lx in enumerate(lane_xs):
            prof = sig[:, max(0, lx - half):lx + half].mean(axis=1)
            prof_s = gaussian_filter1d(prof, sigma=h / 300)
            noise = 1.4826 * np.median(np.abs(np.diff(prof_s))) / np.sqrt(2)
            profs.append(prof_s)
            noises.append(noise)
            pk, pp = find_peaks(prof_s, distance=h / 60,
                                prominence=max(3.5 * noise, 0.008))
            for i, y in enumerate(pk):
                if Y_MIN_FRAC * h < y < Y_MAX_FRAC * h:
                    bands.append({"lane": li, "y": int(y),
                                  "strength": float(pp["prominences"][i]),
                                  "rescued": False})

        # 4. Warp-guided rescue of faint bands
        n_rescued = 0
        fit = fit_scaled_warp(bands, lane_xs, w, tol)
        if fit:
            rows, dcurve = fit
            for r in rows:
                have = {b["lane"] for b in r["members"]}
                for li in range(len(lane_xs)):
                    if li in have:
                        continue
                    pred = r["o"] + r["a"] * dcurve[li]
                    if not (Y_MIN_FRAC * h < pred < Y_MAX_FRAC * h):
                        continue
                    lo = int(max(0, pred - 0.6 * tol))
                    hi = int(min(h, pred + 0.6 * tol))
                    seg = profs[li][lo:hi]
                    yi = int(np.argmax(seg))
                    val = float(seg[yi])
                    near_existing = any(b["lane"] == li and abs(b["y"] - (lo + yi)) < tol / 2
                                        for b in bands)
                    if (0 < yi < len(seg) - 1 and not near_existing
                            and val > max(2.0 * noises[li], 0.005)):
                        bands.append({"lane": li, "y": lo + yi,
                                      "strength": val, "rescued": True})
                        n_rescued += 1

        # Collate per lane; empty lanes are kept — an origin spot with no
        # bands is a real lane whose sample simply lacks the compounds
        lanes = []
        for li, lx in enumerate(lane_xs):
            mine = sorted((b for b in bands if b["lane"] == li),
                          key=lambda b: b["y"])
            lanes.append({"x": lx, "bands": mine})

        # Downscaled display image (plate crop only)
        crop = im.crop((x0, y0, x1, y1))
        scale = DISPLAY_W / crop.width
        disp = crop.resize((DISPLAY_W, int(crop.height * scale)))
        disp.save(OUT / f"{name}.jpg", quality=72)

        # Overlay: circles = primary detections, squares = warp-rescued
        ov = crop.copy()
        dr = ImageDraw.Draw(ov)
        for ln in lanes:
            dr.line([(ln["x"], 0), (ln["x"], h)], fill=(255, 0, 0), width=2)
            for b in ln["bands"]:
                r = 12
                box = [ln["x"] - r, b["y"] - r, ln["x"] + r, b["y"] + r]
                if b["rescued"]:
                    dr.rectangle(box, outline=(0, 128, 255), width=4)
                else:
                    dr.ellipse(box, outline=(255, 0, 255), width=4)
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
                        {"y": round(b["y"] * scale, 1),
                         "strength": round(b["strength"], 4),
                         "rescued": b["rescued"]}
                        for b in ln["bands"]
                    ],
                }
                for ln in lanes
            ],
        }
        n_primary = sum(len(l["bands"]) for l in result[name]["lanes"]) - n_rescued
        print(f"{name}: {len(lanes)} lanes, {n_primary} bands detected, "
              f"{n_rescued} rescued by warp")

    (OUT / "bands.json").write_text(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
