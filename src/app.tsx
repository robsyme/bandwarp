// The Workspace shell (ticket 014): plate canvas center-stage, step
// checklist left, context panel right — variant B of the workflow mock,
// wired to the real pipeline, detection, and warp modules for steps 1-6.
// Steps 7-9 stay stubs until the quantification build (ticket 015).

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Rect, RegionDetection } from "./analysis/detectRegion";
import type { Pt } from "./analysis/geometry";
import type { PipelineResult } from "./analysis/pipeline";
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
}

const STEPS = [
  { id: "photo", t: "Photo", hint: "Load the plate photo. EXIF rotation is applied automatically." },
  { id: "corners", t: "Corners", hint: "Drag the four numbered handles onto the plate corners so the image can be rectified — lanes become vertical, rows comparable." },
  { id: "region", t: "Region", hint: "Drag a box around the developed region to analyse (a photo can hold two). Detection reruns whenever the region changes." },
  { id: "lanes", t: "Lanes", hint: "Auto-detected lanes: drag a line to fix its position, right-click the plate to add one. Type each lane's label; tick the standards and enter their dilution amounts." },
  { id: "setup", t: "Compounds", hint: "Name the compound rows (top row first) and set the amount unit. The coloured curves show the fitted warp per row." },
  { id: "bands", t: "Bands", hint: "Auto-detected bands grouped into compound rows by the warp fit. Click a dot to remove it; click on a lane to add one. Dark-ringed dots were warp-rescued — double-check them." },
  { id: "profiles", t: "Profiles", hint: "Per-lane profile with integration bounds and the valley-to-valley baseline." },
  { id: "calib", t: "Calibration", hint: "Per-compound calibration curve from the on-plate standards." },
  { id: "results", t: "Results", hint: "Calibrated table with QC flags; CSV export and the Analysis File." },
] as const;

type StepId = (typeof STEPS)[number]["id"];

async function decode(blob: Blob, name: string): Promise<Photo> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const g = cv.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height);
  return { rgba: data.data, width: bmp.width, height: bmp.height, name };
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
  const dragRef = useRef<Drag | null>(null);
  const jobsRef = useRef({ rect: 0, det: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

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
        setRegion({ x0: 0, y0: 0, x1: r.width, y1: r.height });
      })
      .finally(() => {
        if (job === jobsRef.current.rect) setRectifying(false);
      });
  }, [photo, corners]);

  // re-detect whenever the rectified image or the analysis region changes
  useEffect(() => {
    if (!rect || !region) return;
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
              stroke={showLanes ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)"}
              stroke-width={lw}
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
      default:
        return (
          <p style="color:var(--mut)">
            This step arrives with the quantification build. Everything set up in steps 1–6 feeds it directly.
          </p>
        );
    }
  };

  /* ------------------------------- layout ------------------------------- */

  const stageImage = stepId === "photo" || stepId === "corners" ? photo : (rect ?? photo);
  const cursor =
    stepId === "region" ? "crosshair" : stepId === "bands" ? "pointer" : stepId === "corners" ? "grab" : "default";

  return (
    <div class="ws">
      <div class="top">
        <b>bandwarp</b>
        <span style="color:var(--mut)">{photo ? photo.name : "no photo loaded"}</span>
        <span style="flex:1"></span>
        {(rectifying || detecting) && <span class="chip">{rectifying ? "Rectifying…" : "Detecting…"}</span>}
        <button disabled title="Arrives with the quantification build">
          Open…
        </button>
        <button disabled title="Arrives with the quantification build">
          Save Analysis File
        </button>
        <button class="primary" disabled title="Arrives with the quantification build">
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
