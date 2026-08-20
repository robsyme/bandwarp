// DEV HARNESS for ticket 012 — proves the pixel pipeline in the browser.
// The real Workspace shell (ticket 014) replaces this. The sample photo is
// bundled only so the harness works from a double-click.

import { useEffect, useRef, useState } from "preact/hooks";
import type { Pt } from "./analysis/geometry";
import type { PipelineResult } from "./analysis/pipeline";
import { processPlate } from "./worker/client";
import samplePhoto from "../examples/Gel4B_Aft.jpg";

interface Photo {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

const DEFAULT_INSET = 0.03;

function defaultCorners(w: number, h: number): Pt[] {
  const dx = w * DEFAULT_INSET;
  const dy = h * DEFAULT_INSET;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

async function decode(url: string): Promise<Photo> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const g = cv.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height);
  return { rgba: data.data, width: bmp.width, height: bmp.height };
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

export function App() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [nextCorner, setNextCorner] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const origRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    decode(samplePhoto).then((p) => {
      setPhoto(p);
      setCorners(defaultCorners(p.width, p.height));
    });
  }, []);

  useEffect(() => {
    if (!photo || !corners) return;
    setBusy(true);
    processPlate(photo.rgba.slice(), photo.width, photo.height, corners)
      .then(setResult)
      .finally(() => setBusy(false));
  }, [photo, corners]);

  useEffect(() => {
    if (!photo || !corners) return;
    const cv = origRef.current!;
    cv.width = photo.width;
    cv.height = photo.height;
    const g = cv.getContext("2d")!;
    g.putImageData(new ImageData(photo.rgba.slice(), photo.width, photo.height), 0, 0);
    corners.forEach((c, i) => {
      g.strokeStyle = "#fff";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c.x, c.y, 28, 0, 7);
      g.stroke();
      g.fillStyle = "#fff";
      g.font = "bold 48px sans-serif";
      g.fillText(String(i + 1), c.x + 34, c.y + 16);
    });
  }, [photo, corners]);

  const placeCorner = (e: MouseEvent) => {
    if (!photo) return;
    const cv = origRef.current!;
    const r = cv.getBoundingClientRect();
    const pt = {
      x: (e.clientX - r.left) * (photo.width / r.width),
      y: (e.clientY - r.top) * (photo.height / r.height),
    };
    const next = corners!.map((c, i) => (i === nextCorner ? pt : c));
    setCorners(next);
    setNextCorner((nextCorner + 1) % 4);
  };

  return (
    <main style="max-width:1100px;margin:0 auto;padding:18px;font-family:sans-serif">
      <h1 style="font-size:18px">Pixel pipeline harness (ticket 012)</h1>
      <p style="color:#667">
        Click the original to place corner {nextCorner + 1} of 4. Rectified plate and OD map
        recompute in the worker on every change. {busy ? "Processing…" : ""}
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <h3 style="font-size:13px">Original (EXIF-upright) + corners</h3>
          <canvas ref={origRef} onClick={placeCorner} style="width:100%;cursor:crosshair;border-radius:6px" />
        </div>
        <div>
          <h3 style="font-size:13px">Rectified plate</h3>
          {result && <Bitmap rgba={result.rectified} width={result.width} height={result.height} />}
          <h3 style="font-size:13px">OD map (dark = band)</h3>
          {result && <Bitmap rgba={result.odPreview} width={result.width} height={result.height} />}
        </div>
      </div>
    </main>
  );
}
