// The plate canvas: blits an RGBA image at full resolution, scales it to the
// column width, and lays an SVG overlay (in image-pixel coordinates) on top.
// Pointer events are translated to image coordinates for the gesture
// handlers; `scale` is image px per CSS px so hit radii can stay
// screen-sized.

import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface StagePt {
  x: number;
  y: number;
  /** Image px per CSS px at the current display size. */
  scale: number;
}

interface Props {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  children?: ComponentChildren;
  cursor?: string;
  onDown?: (p: StagePt, e: PointerEvent) => void;
  onMove?: (p: StagePt, e: PointerEvent) => void;
  onUp?: (p: StagePt, e: PointerEvent) => void;
  onContext?: (p: StagePt, e: MouseEvent) => void;
}

export function Stage({ rgba, width, height, children, cursor, onDown, onMove, onUp, onContext }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = canvasRef.current!;
    cv.width = width;
    cv.height = height;
    cv.getContext("2d")!.putImageData(new ImageData(rgba.slice(), width, height), 0, 0);
  }, [rgba, width, height]);

  const toImg = (e: { clientX: number; clientY: number }): StagePt => {
    const r = canvasRef.current!.getBoundingClientRect();
    const scale = width / r.width;
    return { x: (e.clientX - r.left) * scale, y: (e.clientY - r.top) * scale, scale };
  };

  const handlers: JSX.HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (e) => {
      boxRef.current!.setPointerCapture(e.pointerId);
      onDown?.(toImg(e), e);
    },
    onPointerMove: (e) => onMove?.(toImg(e), e),
    onPointerUp: (e) => onUp?.(toImg(e), e),
    onContextMenu: (e) => {
      e.preventDefault();
      onContext?.(toImg(e), e);
    },
  };

  return (
    <div
      ref={boxRef}
      class="stagebox"
      style={{ cursor: cursor ?? "default", touchAction: "none" }}
      {...handlers}
    >
      <canvas ref={canvasRef} />
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {children}
      </svg>
    </div>
  );
}
