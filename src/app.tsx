// The Workspace shell (ticket 014): plate canvas center-stage, step
// checklist left, context panel right — variant B of the workflow mock,
// wired to the real pipeline, detection, and warp modules for steps 1-6.
// Steps 7-9 stay stubs until the quantification build (ticket 015).

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Calibration, fitCalibration, predictArea } from "./analysis/calibrate";
import type { Rect, RegionDetection } from "./analysis/detectRegion";
import type { Pt } from "./analysis/geometry";
import type { PipelineResult } from "./analysis/pipeline";
import {
  type Bounds,
  defaultBounds,
  type Integration,
  integrateBand,
  isSaturated,
  laneProfileOD,
  smoothProfile,
} from "./analysis/profile";
import {
  type AnalysisFile,
  APP_VERSION,
  bandsToSaved,
  base64ToBytes,
  bytesToBase64,
  parseAnalysis,
  savedToBands,
  SCHEMA_VERSION,
  serializeAnalysis,
} from "./io";
import { buildRows, type CellMeasure, toCSV } from "./results";
import {
  addBand,
  addLane,
  assignRows,
  bandsFromDetection,
  compoundName,
  lanesFromDetection,
  type Lane,
  PALETTE,
  type PlacedBand,
  removeLane,
  sortedLanes,
} from "./state";
import { Stage, type StagePt } from "./ui/stage";
import { detectPlateRegion, processPlate } from "./worker/client";
import samplePhoto from "../examples/Gel4B_Aft.jpg";

interface Photo {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  name: string;
  /** Original file bytes, embedded verbatim in the Analysis File. */
  bytes: ArrayBuffer;
  mime: string;
}

const STEPS = [
  { id: "photo", t: "Photo", hint: "Load the plate photo. EXIF rotation is applied automatically." },
  { id: "corners", t: "Corners", hint: "Drag the four numbered handles onto the plate corners so the image can be rectified — lanes become vertical, rows comparable." },
  { id: "region", t: "Region", hint: "Drag a box around the developed region to analyse (a photo can hold two). Detection reruns whenever the region changes." },
  { id: "lanes", t: "Lanes", hint: "Auto-detected lanes: drag a line to fix its position, right-click the plate to add one. Type each lane's label; tick the standards and enter their dilution amounts." },
  { id: "setup", t: "Compounds", hint: "Name the compound rows (top row first) and set the amount unit. The coloured curves show the fitted warp per row." },
  { id: "bands", t: "Bands", hint: "Auto-detected bands grouped into compound rows by the warp fit. Click a dot to remove it; click on a lane to add one. Dark-ringed dots were warp-rescued — double-check them." },
  { id: "profiles", t: "Profiles", hint: "Per-lane OD profile with each band's integration bounds and valley-to-valley baseline. Drag a bound edge on the profile if a valley landed wrong." },
  { id: "calib", t: "Calibration", hint: "Per-compound calibration from the on-plate standards: linear and Michaelis-Menten fitted, the better one chosen. Points, curve, and residuals shown." },
  { id: "results", t: "Results", hint: "Calibrated lane x compound table with QC flags. Export the CSV; save the Analysis File to reopen or rerun later." },
] as const;

type StepId = (typeof STEPS)[number]["id"];

async function decode(blob: Blob, name: string): Promise<Photo> {
  const bytes = await blob.arrayBuffer();
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const g = cv.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height);
  return {
    rgba: data.data,
    width: bmp.width,
    height: bmp.height,
    name,
    bytes,
    mime: blob.type || "image/jpeg",
  };
}

function download(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function defaultCorners(w: number, h: number): Pt[] {
  const dx = w * 0.03;
  const dy = h * 0.03;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

function Bitmap({ rgba, width, height }: { rgba: Uint8ClampedArray; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    cv.width = width;
    cv.height = height;
    cv.getContext("2d")!.putImageData(new ImageData(rgba.slice(), width, height), 0, 0);
  }, [rgba, width, height]);
  return <canvas ref={ref} style="width:100%;border-radius:6px" />;
}

interface BandQuant {
  bounds: Bounds;
  integ: Integration;
  saturated: boolean;
  row: number;
}

/**
 * One lane's OD profile with each band's integration bounds shaded, the
 * valley-to-valley baseline dashed, and the bound edges draggable.
 */
function ProfileView({
  prof,
  region,
  bandsInLane,
  quant,
  onBounds,
}: {
  prof: Float64Array;
  region: Rect;
  bandsInLane: PlacedBand[];
  quant: Map<number, BandQuant>;
  onBounds: (bandId: number, bounds: Bounds) => void;
}) {
  const W = 560;
  const H = 170;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ bandId: number; side: "a" | "b" } | null>(null);
  const regionH = region.y1 - region.y0;
  let maxOD = 0.05;
  for (const v of prof) if (v > maxOD) maxOD = v;
  const sx = (y: number) => ((y - region.y0) / regionH) * W;
  const sy = (od: number) => H - 12 - (Math.max(od, 0) / (maxOD * 1.08)) * (H - 26);
  const toPlateY = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return region.y0 + ((clientX - r.left) / r.width) * regionH;
  };
  const pts = Array.from(prof, (v, i) => `${sx(region.y0 + i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style="width:100%;background:#fff;border:1px solid var(--line);border-radius:6px;touch-action:none"
      onPointerDown={(e) => {
        // hit a bound edge within 6 svg px
        const y = toPlateY(e.clientX);
        let best: { bandId: number; side: "a" | "b"; d: number } | null = null;
        for (const b of bandsInLane) {
          const q = quant.get(b.id);
          if (!q) continue;
          for (const side of ["a", "b"] as const) {
            const d = Math.abs(sx(q.bounds[side]) - sx(y));
            if (d < 8 && (!best || d < best.d)) best = { bandId: b.id, side, d };
          }
        }
        if (best) {
          dragRef.current = best;
          svgRef.current!.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const band = bandsInLane.find((b) => b.id === d.bandId);
        const q = quant.get(d.bandId);
        if (!band || !q) return;
        let y = Math.min(Math.max(toPlateY(e.clientX), region.y0), region.y1 - 1);
        const next: Bounds =
          d.side === "a"
            ? { a: Math.min(y, band.y - 2), b: q.bounds.b }
            : { a: q.bounds.a, b: Math.max(y, band.y + 2) };
        onBounds(d.bandId, next);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      {bandsInLane.map((b) => {
        const q = quant.get(b.id);
        if (!q) return null;
        const color = q.row >= 0 ? PALETTE[q.row % PALETTE.length] : "#9aa4ae";
        return (
          <g key={b.id}>
            <rect
              x={sx(q.bounds.a)}
              y={10}
              width={Math.max(1, sx(q.bounds.b) - sx(q.bounds.a))}
              height={H - 22}
              fill={`${color}22`}
            />
            <line
              x1={sx(q.bounds.a)}
              y1={sy(q.integ.base0)}
              x2={sx(q.bounds.b)}
              y2={sy(q.integ.base1)}
              stroke="#888"
              stroke-dasharray="4 3"
            />
            {(["a", "b"] as const).map((side) => (
              <line
                key={side}
                x1={sx(q.bounds[side])}
                y1={10}
                x2={sx(q.bounds[side])}
                y2={H - 12}
                stroke={color}
                stroke-width="2.5"
                style="cursor:ew-resize"
              />
            ))}
          </g>
        );
      })}
      <polyline points={pts} fill="none" stroke="#334" stroke-width="1.3" />
      <text x="6" y="14" font-size="10" fill="#778">
        OD along the lane · shaded = integration bounds (drag edges) · dashed = baseline
      </text>
    </svg>
  );
}

/** Per-compound calibration: fitted curve, standard points, residual bars. */
function CalibView({ cal, unit }: { cal: Calibration; unit: string }) {
  const W = 300;
  const H = 170;
  const RH = 46;
  const top = cal.topAmount * 1.08;
  const maxArea = Math.max(...cal.points.map((p) => p.area), ...cal.fitted) * 1.1;
  const px = (a: number) => 32 + (a / top) * (W - 42);
  const py = (v: number) => H - 24 - (Math.max(v, 0) / maxArea) * (H - 42);
  const curve: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = (top * i) / 60;
    curve.push(`${px(a).toFixed(1)},${py(predictArea(cal, a)).toFixed(1)}`);
  }
  const residuals = cal.points.map((p, i) => p.area - cal.fitted[i]);
  const maxRes = Math.max(...residuals.map(Math.abs), 1e-9);
  const modelName = cal.model === "linear" ? "linear" : "Michaelis-Menten";
  return (
    <svg
      viewBox={`0 0 ${W} ${H + RH}`}
      style="width:100%;background:#fff;border:1px solid var(--line);border-radius:6px"
    >
      <polyline points={curve.join(" ")} fill="none" stroke="#2e86ab" stroke-width="1.5" />
      {cal.points.map((p, i) => (
        <circle key={i} cx={px(p.amount)} cy={py(p.area)} r="3.5" fill="#e4572e" />
      ))}
      <line x1={32} y1={H - 24} x2={W - 8} y2={H - 24} stroke="#99a" />
      <line x1={32} y1={H - 24} x2={32} y2={10} stroke="#99a" />
      <text x={W - 130} y={18} font-size="10" fill="#445">
        {modelName} · r² {cal.r2.toFixed(4)}
      </text>
      <text x={W / 2 - 24} y={H - 8} font-size="10" fill="#778">
        {unit} spotted
      </text>
      <text x={6} y={14} font-size="10" fill="#778">
        area
      </text>
      {/* residual bars share the x scale */}
      <line x1={32} y1={H + RH / 2} x2={W - 8} y2={H + RH / 2} stroke="#ccd" />
      {cal.points.map((p, i) => {
        const h = (residuals[i] / maxRes) * (RH / 2 - 4);
        return (
          <rect
            key={i}
            x={px(p.amount) - 2.5}
            y={h >= 0 ? H + RH / 2 - h : H + RH / 2}
            width="5"
            height={Math.abs(h)}
            fill="#e4572e"
          />
        );
      })}
      <text x={6} y={H + 12} font-size="9" fill="#778">
        residuals
      </text>
    </svg>
  );
}

type Drag =
  | { kind: "corner"; i: number }
  | { kind: "region"; ax: number; ay: number }
  | { kind: "lane"; id: number }
  | { kind: "tap"; hit: number | null; ax: number; ay: number };

export function App() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [draftCorners, setDraftCorners] = useState<Pt[] | null>(null);
  const [rect, setRect] = useState<PipelineResult | null>(null);
  const [region, setRegion] = useState<Rect | null>(null);
  const [draftRegion, setDraftRegion] = useState<Rect | null>(null);
  const [det, setDet] = useState<RegionDetection | null>(null);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [bands, setBands] = useState<PlacedBand[]>([]);
  const [compounds, setCompounds] = useState<string[]>([]);
  const [unit, setUnit] = useState("µg");
  const [rectifying, setRectifying] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [selectedLaneId, setSelectedLaneId] = useState<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const jobsRef = useRef({ rect: 0, det: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const analysisFileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<AnalysisFile | null>(null);

  const stepId: StepId = STEPS[step].id;

  const loadPhoto = (p: Photo) => {
    setPhoto(p);
    setCorners(defaultCorners(p.width, p.height));
    setRect(null);
    setRegion(null);
    setDet(null);
    setLanes([]);
    setBands([]);
    setCompounds([]);
    setStep(1);
  };

  // rectify whenever the photo or committed corners change
  useEffect(() => {
    if (!photo || !corners) return;
    const job = ++jobsRef.current.rect;
    setRectifying(true);
    processPlate(photo.rgba.slice(), photo.width, photo.height, corners)
      .then((r) => {
        if (job !== jobsRef.current.rect) return;
        setRect(r);
        setRegion(restoreRef.current ? restoreRef.current.region : { x0: 0, y0: 0, x1: r.width, y1: r.height });
      })
      .finally(() => {
        if (job === jobsRef.current.rect) setRectifying(false);
      });
  }, [photo, corners]);

  // re-detect whenever the rectified image or the analysis region changes;
  // a pending Analysis File restore supplies the saved state instead
  useEffect(() => {
    if (!rect || !region) return;
    const saved = restoreRef.current;
    if (saved) {
      restoreRef.current = null;
      setDet(
        saved.detection
          ? { lanes: [], unit: saved.detection.unit, yOrigin: saved.detection.yOrigin, bands: [] }
          : null,
      );
      setLanes(saved.lanes);
      setBands(savedToBands(saved.bands));
      setCompounds(saved.compounds);
      setUnit(saved.unit);
      return;
    }
    const job = ++jobsRef.current.det;
    setDetecting(true);
    detectPlateRegion(rect.rectified.slice(), rect.width, rect.height, region)
      .then((d) => {
        if (job !== jobsRef.current.det) return;
        setDet(d);
        const ls = d ? lanesFromDetection(d) : [];
        setLanes(ls);
        setBands(d ? bandsFromDetection(d, ls) : []);
      })
      .finally(() => {
        if (job === jobsRef.current.det) setDetecting(false);
      });
  }, [rect, region]);

  const assignment = useMemo(
    () => assignRows(lanes, bands, region ? region.x1 - region.x0 : 1, region ? region.y1 - region.y0 : 1),
    [lanes, bands, region],
  );

  // keep one compound name per detected row (never discard typed names)
  useEffect(() => {
    setCompounds((prev) => {
      if (assignment.rowCount <= prev.length) return prev;
      const out = [...prev];
      while (out.length < assignment.rowCount) out.push(compoundName(out.length));
      return out;
    });
  }, [assignment.rowCount]);

  const slanes = useMemo(() => sortedLanes(lanes), [lanes]);
  const laneX = useMemo(() => new Map(lanes.map((l) => [l.id, l.x])), [lanes]);
  const unitPx = det?.unit ?? (region ? (region.x1 - region.x0) / 25 : 50);
  const rowCount = assignment.rowCount;

  /* --------------------------- quantification --------------------------- */

  const halfPx = unitPx * 0.3;

  // per-lane OD profiles over the region (heavier: only on lane/region change)
  const profs = useMemo(() => {
    const out = new Map<number, { prof: Float64Array; smooth: Float64Array }>();
    if (!rect || !region) return out;
    const y0 = Math.round(region.y0);
    const y1 = Math.round(region.y1);
    for (const l of lanes) {
      const prof = laneProfileOD(rect.od, rect.width, l.x, halfPx, y0, y1);
      out.set(l.id, { prof, smooth: smoothProfile(prof) });
    }
    return out;
  }, [rect, region, lanes, halfPx]);

  // per-band bounds (override or auto valleys), area, saturation, row
  const bandQuant = useMemo(() => {
    const out = new Map<number, BandQuant>();
    if (!rect || !region) return out;
    const y0 = Math.round(region.y0);
    const regionH = region.y1 - region.y0;
    for (const b of bands) {
      const lp = profs.get(b.laneId);
      const lx = laneX.get(b.laneId);
      if (!lp || lx === undefined) continue;
      const neighbours = bands.filter((o) => o.laneId === b.laneId && o.id !== b.id).map((o) => o.y);
      const bounds = b.bounds ?? defaultBounds(lp.smooth, y0, b.y, neighbours, regionH);
      out.set(b.id, {
        bounds,
        integ: integrateBand(lp.prof, y0, bounds),
        saturated: isSaturated(rect.rectified, rect.width, lx, halfPx, bounds),
        row: assignment.rowOf.get(b.id) ?? -1,
      });
    }
    return out;
  }, [rect, region, bands, profs, laneX, halfPx, assignment]);

  // lane x compound cells: nearest band to the row curve wins duplicates
  const cells = useMemo(() => {
    const out = new Map<string, CellMeasure & { bandId: number }>();
    if (!region) return out;
    const laneIdx = new Map(slanes.map((l, i) => [l.id, i]));
    for (const b of bands) {
      const q = bandQuant.get(b.id);
      if (!q || q.row < 0) continue;
      const key = `${b.laneId}:${q.row}`;
      const prev = out.get(key);
      if (prev) {
        const li = laneIdx.get(b.laneId)!;
        const curveY = assignment.curves[q.row]?.[li] ?? b.y;
        const prevB = bands.find((x) => x.id === prev.bandId)!;
        if (Math.abs(b.y - curveY) >= Math.abs(prevB.y - curveY)) continue;
      }
      out.set(key, {
        bandId: b.id,
        area: q.integ.area,
        y: b.y,
        rescued: b.rescued,
        manual: b.manual,
        saturated: q.saturated,
      });
    }
    return out;
  }, [bands, bandQuant, assignment, slanes, region]);

  // per-compound calibration from the ticked standards
  const calibrations = useMemo(() => {
    const out: (Calibration | null)[] = [];
    for (let row = 0; row < rowCount; row++) {
      const pts = slanes
        .filter((l) => l.isStandard && Number.isFinite(parseFloat(l.amount)))
        .flatMap((l) => {
          const cell = cells.get(`${l.id}:${row}`);
          return cell ? [{ amount: parseFloat(l.amount), area: cell.area }] : [];
        });
      out.push(fitCalibration(pts));
    }
    return out;
  }, [slanes, cells, rowCount]);

  const provenance = useMemo(() => {
    const fits = compounds
      .slice(0, rowCount)
      .map((c, i) => `${c}=${calibrations[i]?.model ?? "none"}`)
      .join(", ");
    return `${APP_VERSION} · schema ${SCHEMA_VERSION} · sRGB-linearized green log-ratio OD vs 2D local background · valley-to-valley baseline · rf vs region top · calibration: ${fits || "none"}`;
  }, [compounds, rowCount, calibrations]);

  const rfOf = (y: number) =>
    det && region && det.yOrigin - region.y0 > 1 ? (det.yOrigin - y) / (det.yOrigin - region.y0) : null;

  const resultRows = useMemo(
    () => (region ? buildRows(slanes, compounds.slice(0, rowCount), cells, calibrations, rfOf) : []),
    [slanes, compounds, rowCount, cells, calibrations, det, region],
  );

  /* ------------------------------ file io ------------------------------- */

  const saveAnalysis = () => {
    if (!photo || !corners || !region) return;
    const file: AnalysisFile = {
      schemaVersion: SCHEMA_VERSION,
      app: APP_VERSION,
      photo: { name: photo.name, mime: photo.mime, base64: bytesToBase64(new Uint8Array(photo.bytes)) },
      corners,
      region,
      detection: det ? { unit: det.unit, yOrigin: det.yOrigin } : null,
      lanes,
      compounds,
      unit,
      bands: bandsToSaved(
        bands.map((b) => ({ ...b, bounds: b.bounds ?? bandQuant.get(b.id)?.bounds ?? null })),
      ),
      warp: rowCount ? { laneXs: assignment.laneXs, curves: assignment.curves } : null,
      calibrations: calibrations.map((cal, i) =>
        cal
          ? { compound: compounds[i] ?? "", model: cal.model, params: cal.params, r2: cal.r2, points: cal.points }
          : null,
      ),
      provenance,
    };
    download(photo.name.replace(/\.[^.]+$/, "") + ".analysis.json", "application/json", serializeAnalysis(file));
  };

  const openAnalysis = async (f: File) => {
    try {
      const parsed = parseAnalysis(await f.text());
      const bytes = base64ToBytes(parsed.photo.base64);
      const blob = new Blob([bytes as BlobPart], { type: parsed.photo.mime });
      const p = await decode(blob, parsed.photo.name);
      restoreRef.current = parsed;
      setRect(null);
      setRegion(null);
      setDet(null);
      setLanes([]);
      setBands([]);
      setCompounds([]);
      setPhoto(p);
      setCorners(parsed.corners);
      setStep(8);
    } catch (err) {
      alert(`Could not open Analysis File: ${err instanceof Error ? err.message : err}`);
    }
  };

  const exportCSV = () => {
    if (!photo || !resultRows.length) return;
    download(
      photo.name.replace(/\.[^.]+$/, "") + ".results.csv",
      "text/csv",
      toCSV(resultRows, photo.name, unit, provenance),
    );
  };

  /* ------------------------------ gestures ------------------------------ */

  const onDown = (p: StagePt) => {
    if (stepId === "corners" && corners) {
      const i = corners.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) < 22 * p.scale);
      if (i >= 0) {
        dragRef.current = { kind: "corner", i };
        setDraftCorners(corners);
      }
    } else if (stepId === "region" && rect) {
      dragRef.current = { kind: "region", ax: p.x, ay: p.y };
    } else if (stepId === "lanes" && region) {
      let best: Lane | null = null;
      for (const l of lanes)
        if (Math.abs(l.x - p.x) < Math.max(12 * p.scale, unitPx * 0.25) && (!best || Math.abs(l.x - p.x) < Math.abs(best.x - p.x)))
          best = l;
      if (best && p.y > region.y0 - 30 * p.scale && p.y < region.y1) dragRef.current = { kind: "lane", id: best.id };
    } else if (stepId === "profiles" && lanes.length) {
      let best: Lane | null = null;
      for (const l of lanes)
        if (!best || Math.abs(l.x - p.x) < Math.abs(best.x - p.x)) best = l;
      if (best) setSelectedLaneId(best.id);
    } else if (stepId === "bands" && region) {
      let hit: number | null = null;
      let hd = Infinity;
      for (const b of bands) {
        const d = Math.hypot((laneX.get(b.laneId) ?? -1e9) - p.x, b.y - p.y);
        if (d < Math.max(14 * p.scale, unitPx * 0.2) && d < hd) {
          hd = d;
          hit = b.id;
        }
      }
      dragRef.current = { kind: "tap", hit, ax: p.x, ay: p.y };
    }
  };

  const onMove = (p: StagePt) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "corner" && photo) {
      setDraftCorners((cs) =>
        cs!.map((c, i) =>
          i === d.i
            ? { x: Math.min(Math.max(p.x, 0), photo.width), y: Math.min(Math.max(p.y, 0), photo.height) }
            : c,
        ),
      );
    } else if (d.kind === "region" && rect) {
      const cl = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
      setDraftRegion({
        x0: cl(Math.min(d.ax, p.x), rect.width),
        y0: cl(Math.min(d.ay, p.y), rect.height),
        x1: cl(Math.max(d.ax, p.x), rect.width),
        y1: cl(Math.max(d.ay, p.y), rect.height),
      });
    } else if (d.kind === "lane" && region) {
      setLanes((ls) =>
        ls.map((l) => (l.id === d.id ? { ...l, x: Math.min(Math.max(p.x, region.x0), region.x1) } : l)),
      );
    }
  };

  const onUp = (p: StagePt) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.kind === "corner") {
      if (draftCorners) setCorners(draftCorners);
      setDraftCorners(null);
    } else if (d.kind === "region") {
      if (draftRegion && draftRegion.x1 - draftRegion.x0 > 40 && draftRegion.y1 - draftRegion.y0 > 40)
        setRegion(draftRegion);
      setDraftRegion(null);
    } else if (d.kind === "tap" && region) {
      if (Math.hypot(p.x - d.ax, p.y - d.ay) > 6 * p.scale) return; // it was a drag, not a click
      if (d.hit !== null) {
        setBands((bs) => bs.filter((b) => b.id !== d.hit));
        return;
      }
      let best: Lane | null = null;
      for (const l of lanes)
        if (Math.abs(l.x - p.x) < unitPx * 0.6 && (!best || Math.abs(l.x - p.x) < Math.abs(best.x - p.x))) best = l;
      if (best && p.y > region.y0 && p.y < region.y1) {
        const target = best;
        const strengths = bands.map((b) => b.strength).sort((a, b) => a - b);
        const typical = strengths.length ? strengths[Math.trunc(strengths.length / 2)] : 0.05;
        setBands((bs) => addBand(bs, target.id, p.y, typical));
      }
    }
  };

  const onContext = (p: StagePt) => {
    if (stepId !== "lanes" || !region) return;
    if (p.x > region.x0 && p.x < region.x1 && p.y > region.y0 && p.y < region.y1)
      setLanes((ls) => addLane(ls, p.x));
  };

  /* ------------------------------ overlays ------------------------------ */

  const overlays = () => {
    if (stepId === "corners" && photo) {
      const cs = draftCorners ?? corners!;
      const r = photo.width * 0.012;
      return (
        <g>
          <polygon
            points={cs.map((c) => `${c.x},${c.y}`).join(" ")}
            fill="none"
            stroke="#fff"
            stroke-width={photo.width * 0.0018}
            stroke-dasharray={`${photo.width * 0.008} ${photo.width * 0.006}`}
          />
          {cs.map((c, i) => (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={r} fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width={r * 0.22} />
              <text
                x={c.x + r * 1.4}
                y={c.y + r * 0.5}
                font-size={r * 1.6}
                fill="#fff"
                stroke="rgba(0,0,0,.55)"
                stroke-width={r * 0.14}
                paint-order="stroke"
                font-weight="bold"
              >
                {i + 1}
              </text>
            </g>
          ))}
        </g>
      );
    }
    if (!rect || !region) return null;
    const reg = stepId === "region" ? (draftRegion ?? region) : region;
    const dim = "rgba(12,18,28,.4)";
    const dimmer = (
      <g>
        <rect x={0} y={0} width={rect.width} height={reg.y0} fill={dim} />
        <rect x={0} y={reg.y1} width={rect.width} height={rect.height - reg.y1} fill={dim} />
        <rect x={0} y={reg.y0} width={reg.x0} height={reg.y1 - reg.y0} fill={dim} />
        <rect x={reg.x1} y={reg.y0} width={rect.width - reg.x1} height={reg.y1 - reg.y0} fill={dim} />
      </g>
    );
    if (stepId === "region") {
      return (
        <g>
          {dimmer}
          <rect
            x={reg.x0}
            y={reg.y0}
            width={reg.x1 - reg.x0}
            height={reg.y1 - reg.y0}
            fill="none"
            stroke="#fff"
            stroke-width={rect.width * 0.0015}
            stroke-dasharray={`${rect.width * 0.007} ${rect.width * 0.005}`}
          />
        </g>
      );
    }
    const showLanes = stepId === "lanes" || stepId === "setup";
    const showBands = stepId === "bands" || stepId === "profiles" || stepId === "calib" || stepId === "results";
    if (!showLanes && !showBands) return null;
    const lw = rect.width * 0.0012;
    const fs = rect.width * 0.011;
    const dotR = Math.max(unitPx * 0.14, rect.width * 0.005);
    const curveElems =
      (stepId === "setup" || showBands) && assignment.laneXs.length > 1
        ? assignment.curves.map((curve, row) => (
            <polyline
              key={row}
              points={assignment.laneXs.map((x, i) => `${x},${curve[i]}`).join(" ")}
              fill="none"
              stroke={PALETTE[row % PALETTE.length]}
              stroke-width={lw * 1.6}
              opacity="0.75"
            />
          ))
        : null;
    return (
      <g>
        {dimmer}
        {slanes.map((l, i) => (
          <g key={l.id}>
            <line
              x1={l.x}
              y1={region.y0}
              x2={l.x}
              y2={region.y1}
              stroke={
                stepId === "profiles" && l.id === (selectedLaneId ?? slanes[0]?.id)
                  ? "rgba(255,255,255,.95)"
                  : showLanes
                    ? "rgba(255,255,255,.55)"
                    : "rgba(255,255,255,.22)"
              }
              stroke-width={stepId === "profiles" && l.id === (selectedLaneId ?? slanes[0]?.id) ? lw * 2.5 : lw}
            />
            {showLanes && (
              <g>
                <circle
                  cx={l.x}
                  cy={region.y0 + fs * 1.1}
                  r={fs * 0.55}
                  fill={l.isStandard ? "#e0b410" : "rgba(255,255,255,.9)"}
                  stroke="#445"
                  stroke-width={lw}
                />
                <text
                  x={l.x}
                  y={region.y0 + fs * 3}
                  font-size={fs}
                  fill="#fff"
                  stroke="rgba(0,0,0,.55)"
                  stroke-width={fs * 0.14}
                  paint-order="stroke"
                  text-anchor="middle"
                >
                  {l.label || String(i + 1)}
                </text>
              </g>
            )}
          </g>
        ))}
        {curveElems}
        {showBands &&
          bands.map((b) => {
            const row = assignment.rowOf.get(b.id) ?? -1;
            return (
              <circle
                key={b.id}
                cx={laneX.get(b.laneId)}
                cy={b.y}
                r={dotR}
                fill={row >= 0 ? PALETTE[row % PALETTE.length] : "#9aa4ae"}
                stroke={b.rescued ? "#111" : "#fff"}
                stroke-width={b.rescued ? dotR * 0.38 : dotR * 0.2}
                stroke-dasharray={b.manual ? `${dotR * 0.6} ${dotR * 0.4}` : undefined}
              />
            );
          })}
      </g>
    );
  };

  /* ---------------------------- side panels ----------------------------- */

  const openFile = async (f: File) => loadPhoto(await decode(f, f.name));

  const panel = () => {
    switch (stepId) {
      case "photo":
        return (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style="display:none"
              onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) openFile(f);
              }}
            />
            <p>
              <button class="primary" onClick={() => fileRef.current!.click()}>
                Choose photo…
              </button>
            </p>
            <p>
              <button
                onClick={async () => {
                  const blob = await (await fetch(samplePhoto)).blob();
                  loadPhoto(await decode(blob, "Gel4B_Aft.jpg"));
                }}
              >
                Load example (Gel 4B)
              </button>
            </p>
            {photo && (
              <p style="color:var(--mut);font-size:12.5px">
                {photo.name} · {photo.width}×{photo.height} · EXIF rotation applied
              </p>
            )}
          </div>
        );
      case "corners":
        return (
          <div>
            <p>
              <button onClick={() => photo && setCorners(defaultCorners(photo.width, photo.height))}>
                Reset corners
              </button>
            </p>
            <h3 style="margin-top:10px">Rectified preview</h3>
            {rectifying && <p style="color:var(--mut)">Rectifying…</p>}
            {rect && <Bitmap rgba={rect.rectified} width={rect.width} height={rect.height} />}
          </div>
        );
      case "region":
        return (
          <div>
            <p>
              <button onClick={() => rect && setRegion({ x0: 0, y0: 0, x1: rect.width, y1: rect.height })}>
                Use full plate
              </button>
            </p>
            {region && (
              <p style="color:var(--mut);font-size:12.5px">
                Region {Math.round(region.x0)},{Math.round(region.y0)} —{" "}
                {Math.round(region.x1)},{Math.round(region.y1)} px
              </p>
            )}
            {detecting && <p style="color:var(--mut)">Detecting…</p>}
          </div>
        );
      case "lanes":
        return (
          <div>
            <p style="display:flex;gap:8px;align-items:center">
              <button onClick={() => region && setRegion({ ...region })}>Re-detect</button>
              {detecting && <span style="color:var(--mut)">Detecting…</span>}
            </p>
            <table>
              <tr>
                <th>#</th>
                <th>Label</th>
                <th>Std?</th>
                <th>Amount</th>
                <th></th>
              </tr>
              {slanes.map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      value={l.label}
                      style="width:56px"
                      onInput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        setLanes((ls) => ls.map((x) => (x.id === l.id ? { ...x, label: v } : x)));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={l.isStandard}
                      onChange={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).checked;
                        setLanes((ls) => ls.map((x) => (x.id === l.id ? { ...x, isStandard: v } : x)));
                      }}
                    />
                  </td>
                  <td>
                    {l.isStandard && (
                      <span style="white-space:nowrap">
                        <input
                          value={l.amount}
                          style="width:44px"
                          onInput={(e) => {
                            const v = (e.currentTarget as HTMLInputElement).value;
                            setLanes((ls) => ls.map((x) => (x.id === l.id ? { ...x, amount: v } : x)));
                          }}
                        />{" "}
                        {unit}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      class="small"
                      title="Remove lane"
                      onClick={() => {
                        const out = removeLane(lanes, bands, l.id);
                        setLanes(out.lanes);
                        setBands(out.bands);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </table>
          </div>
        );
      case "setup":
        return (
          <div>
            <p>
              Unit{" "}
              <input value={unit} style="width:56px" onInput={(e) => setUnit((e.currentTarget as HTMLInputElement).value)} />
            </p>
            <h3 style="margin:10px 0 6px">Compound rows (top first)</h3>
            {assignment.rowCount === 0 && (
              <p style="color:var(--mut);font-size:12.5px">No compound rows yet — mark bands in step 6 first.</p>
            )}
            {Array.from({ length: assignment.rowCount }, (_, i) => (
              <div style="margin:4px 0" key={i}>
                <span class="chip" style={`background:${PALETTE[i % PALETTE.length]};color:#fff`}>
                  &nbsp;
                </span>{" "}
                <input
                  value={compounds[i] ?? ""}
                  onInput={(e) => {
                    const v = (e.currentTarget as HTMLInputElement).value;
                    setCompounds((cs) => cs.map((c, j) => (j === i ? v : c)));
                  }}
                />
              </div>
            ))}
          </div>
        );
      case "bands": {
        const counts = new Map<number, number>();
        let unassigned = 0;
        for (const b of bands) {
          const r = assignment.rowOf.get(b.id) ?? -1;
          if (r < 0) unassigned++;
          else counts.set(r, (counts.get(r) ?? 0) + 1);
        }
        const rescued = bands.filter((b) => b.rescued).length;
        return (
          <div>
            <table>
              <tr>
                <th></th>
                <th>Compound</th>
                <th>Bands</th>
              </tr>
              {Array.from({ length: assignment.rowCount }, (_, i) => (
                <tr key={i}>
                  <td>
                    <span class="chip" style={`background:${PALETTE[i % PALETTE.length]};color:#fff`}>
                      &nbsp;
                    </span>
                  </td>
                  <td>
                    <input
                      value={compounds[i] ?? ""}
                      style="width:110px"
                      onInput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        setCompounds((cs) => cs.map((c, j) => (j === i ? v : c)));
                      }}
                    />
                  </td>
                  <td>{counts.get(i) ?? 0}</td>
                </tr>
              ))}
              {unassigned > 0 && (
                <tr>
                  <td>
                    <span class="chip">&nbsp;</span>
                  </td>
                  <td style="color:var(--mut)">unassigned</td>
                  <td>{unassigned}</td>
                </tr>
              )}
            </table>
            <p style="color:var(--mut);font-size:12.5px;margin-top:10px">
              {rescued > 0 && (
                <span>
                  <span class="chip warn">{rescued} rescued</span> dark-ringed dots were warp-rescued — double-check
                  them.{" "}
                </span>
              )}
              Dashed dots were added by hand. Click a dot to remove it; click on a lane to add a band there.
            </p>
          </div>
        );
      }
      case "profiles": {
        if (!region || !slanes.length)
          return <p style="color:var(--mut)">Mark the region and lanes first (steps 3-4).</p>;
        const laneId = selectedLaneId ?? slanes[0].id;
        const lane = slanes.find((l) => l.id === laneId) ?? slanes[0];
        const lp = profs.get(lane.id);
        const mine = bands.filter((b) => b.laneId === lane.id).sort((a, b) => a.y - b.y);
        return (
          <div>
            <p>
              Lane{" "}
              <select
                value={lane.id}
                onChange={(e) =>
                  setSelectedLaneId(Number((e.currentTarget as HTMLSelectElement).value))
                }
              >
                {slanes.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    {i + 1}
                    {l.label ? ` — ${l.label}` : ""}
                    {l.isStandard ? " (std)" : ""}
                  </option>
                ))}
              </select>{" "}
              <span style="color:var(--mut);font-size:12px">or click a lane on the plate</span>
            </p>
            {lp && (
              <ProfileView
                prof={lp.prof}
                region={region}
                bandsInLane={mine}
                quant={bandQuant}
                onBounds={(bandId, bounds) =>
                  setBands((bs) => bs.map((b) => (b.id === bandId ? { ...b, bounds } : b)))
                }
              />
            )}
            <table style="margin-top:10px">
              <tr>
                <th></th>
                <th>Compound</th>
                <th>Area (OD·px)</th>
                <th></th>
              </tr>
              {mine.map((b) => {
                const q = bandQuant.get(b.id);
                if (!q) return null;
                return (
                  <tr key={b.id}>
                    <td>
                      <span
                        class="chip"
                        style={`background:${q.row >= 0 ? PALETTE[q.row % PALETTE.length] : "#9aa4ae"};color:#fff`}
                      >
                        &nbsp;
                      </span>
                    </td>
                    <td>{q.row >= 0 ? (compounds[q.row] ?? "") : "unassigned"}</td>
                    <td>{q.integ.area.toFixed(2)}</td>
                    <td>{q.saturated && <span class="chip warn">saturated</span>}</td>
                  </tr>
                );
              })}
            </table>
            {mine.some((b) => b.bounds) && (
              <p>
                <button
                  class="small"
                  onClick={() =>
                    setBands((bs) =>
                      bs.map((b) => (b.laneId === lane.id ? { ...b, bounds: undefined } : b)),
                    )
                  }
                >
                  Reset bounds to auto valleys
                </button>
              </p>
            )}
          </div>
        );
      }
      case "calib":
        if (!rowCount)
          return <p style="color:var(--mut)">No compound rows yet — mark bands in step 6 first.</p>;
        return (
          <div>
            {Array.from({ length: rowCount }, (_, i) => {
              const cal = calibrations[i];
              return (
                <div key={i} style="margin-bottom:14px">
                  <div style="font-size:12.5px;margin-bottom:3px">
                    <span class="chip" style={`background:${PALETTE[i % PALETTE.length]};color:#fff`}>
                      &nbsp;
                    </span>{" "}
                    {compounds[i] ?? ""}{" "}
                    {cal && cal.r2 < 0.99 && <span class="chip warn">r² {cal.r2.toFixed(3)}</span>}
                  </div>
                  {cal ? (
                    <CalibView cal={cal} unit={unit} />
                  ) : (
                    <p style="color:var(--mut);font-size:12.5px;margin:0">
                      Needs at least 3 detected standards — tick standard lanes and enter their amounts in
                      step 4.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        );
      case "results":
        return (
          <div>
            <p style="display:flex;gap:8px">
              <button class="primary" disabled={!resultRows.length} onClick={exportCSV}>
                Export CSV
              </button>
              <button disabled={!photo || !region} onClick={saveAnalysis}>
                Save Analysis File
              </button>
            </p>
            <p style="color:var(--mut);font-size:11px;word-break:break-word">{provenance}</p>
            <table>
              <tr>
                <th>Lane</th>
                <th>Compound</th>
                <th>Amount</th>
                <th>QC</th>
              </tr>
              {resultRows.map((r, i) => (
                <tr key={i}>
                  <td style="white-space:nowrap">
                    {r.laneNumber}
                    {r.laneLabel ? ` ${r.laneLabel}` : ""}
                    {r.isStandard ? " ★" : ""}
                  </td>
                  <td>{r.compound}</td>
                  <td style="white-space:nowrap">
                    {r.amountDisplay ? `${r.amountDisplay} ${unit}` : ""}
                  </td>
                  <td>
                    {r.flags.length === 0 && <span class="chip ok">ok</span>}
                    {r.flags.map((f) => (
                      <span key={f} class={`chip ${f === "nd" ? "" : "warn"}`}>
                        {f === "above_top_standard" ? "> top" : f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  /* ------------------------------- layout ------------------------------- */

  const stageImage = stepId === "photo" || stepId === "corners" ? photo : (rect ?? photo);
  const cursor =
    stepId === "region"
      ? "crosshair"
      : stepId === "bands" || stepId === "profiles"
        ? "pointer"
        : stepId === "corners"
          ? "grab"
          : "default";

  return (
    <div class="ws">
      <div class="top">
        <b>bandwarp</b>
        <span style="color:var(--mut)">{photo ? photo.name : "no photo loaded"}</span>
        <span style="flex:1"></span>
        {(rectifying || detecting) && <span class="chip">{rectifying ? "Rectifying…" : "Detecting…"}</span>}
        <input
          ref={analysisFileRef}
          type="file"
          accept=".json,application/json"
          style="display:none"
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            (e.currentTarget as HTMLInputElement).value = "";
            if (f) openAnalysis(f);
          }}
        />
        <button onClick={() => analysisFileRef.current!.click()} title="Open a saved Analysis File">
          Open…
        </button>
        <button disabled={!photo || !region} onClick={saveAnalysis}>
          Save Analysis File
        </button>
        <button class="primary" disabled={!resultRows.length} onClick={exportCSV}>
          Export CSV
        </button>
      </div>
      <nav class="check">
        {STEPS.map((s, i) => (
          <div key={s.id} class={`st ${i === step ? "cur" : ""} ${i < step ? "done" : ""}`} onClick={() => setStep(i)}>
            <span class="tick">{i < step ? "✓" : ""}</span>
            {i + 1}. {s.t}
          </div>
        ))}
      </nav>
      <div class="stage">
        {stageImage ? (
          <Stage
            rgba={stepId === "photo" || stepId === "corners" ? photo!.rgba : (rect?.rectified ?? photo!.rgba)}
            width={stageImage.width}
            height={stageImage.height}
            cursor={cursor}
            onDown={onDown}
            onMove={onMove}
            onUp={onUp}
            onContext={onContext}
          >
            {overlays()}
          </Stage>
        ) : (
          <div class="empty">
            <p>No plate photo yet.</p>
            <button class="primary" onClick={() => setStep(0)}>
              Choose photo…
            </button>
          </div>
        )}
      </div>
      <aside class="side">
        <h3>
          {step + 1}. {STEPS[step].t}
        </h3>
        <p class="hint">{STEPS[step].hint}</p>
        {panel()}
      </aside>
    </div>
  );
}
