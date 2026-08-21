"use client";

import { useEffect, useRef } from "react";
import type { Point, StrokeData, ToolId } from "./annotations";

interface AnnotationLayerProps {
  pageNumber: number;
  width: number;
  height: number;
  tool: ToolId;
  strokes?: StrokeData[];
  onStrokeComplete?: (stroke: StrokeData) => void;
}

const TOOL_STYLES: Record<ToolId, { color: string; width: number; opacity: number }> = {
  pencil: { color: "#1c1a17", width: 2, opacity: 1 },
  highlighter: { color: "#ffd54a", width: 16, opacity: 0.4 },
};

function setStrokeAppearance(context: CanvasRenderingContext2D, style: { color: string; width: number }) {
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.lineCap = "round";
  context.lineJoin = "round";
}

function tracePath(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
}

// Redraws one already-completed stroke (used for mount-time restore). A semi-transparent
// stroke is first traced onto a full-opacity offscreen buffer and composited onto the real
// canvas in a single drawImage - tracing it directly with globalAlpha applied per-segment
// would let a self-intersecting path (e.g. a looped highlight) stack darker where it crosses
// itself, since each overlapping segment would blend independently. An opaque stroke (pencil)
// has no such risk - opaque-over-opaque looks identical either way - so it skips the buffer.
function drawStroke(context: CanvasRenderingContext2D, stroke: StrokeData, canvasWidth: number, canvasHeight: number) {
  if (stroke.points.length < 2) return;

  if (stroke.opacity >= 1) {
    setStrokeAppearance(context, stroke);
    tracePath(context, stroke.points);
    context.stroke();
    return;
  }

  const buffer = document.createElement("canvas");
  buffer.width = canvasWidth;
  buffer.height = canvasHeight;
  const bufferContext = buffer.getContext("2d");
  if (!bufferContext) return;

  setStrokeAppearance(bufferContext, stroke);
  tracePath(bufferContext, stroke.points);
  bufferContext.stroke();

  context.globalAlpha = stroke.opacity;
  context.drawImage(buffer, 0, 0);
  context.globalAlpha = 1;
}

// Deliberately depends on nothing but page dimensions and a page number - never on whether
// the underlying page came from a native PDF or (eventually, Stage 6) a converted HTML page,
// per US-4.6. A transparent canvas sits exactly over the rendered page canvas (same pixel
// width/height, absolutely positioned within a wrapper the page canvas itself sizes).
export function AnnotationLayer({ pageNumber, width, height, tool, strokes = [], onStrokeComplete }: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  // accumulates every point of the in-progress stroke, so the whole ordered path can be
  // handed off to the parent once the stroke finishes - not just used for live drawing.
  const currentPointsRef = useRef<Point[]>([]);
  // the tool selected when the CURRENT stroke started - if the user somehow switched tools
  // mid-drag, the stroke should stay consistent rather than switching style partway through.
  const activeToolRef = useRef<ToolId>(tool);
  // live-drawing buffers for a semi-transparent stroke in progress: `snapshotRef` is the
  // canvas's pixels as they were right before this stroke started, `bufferRef` accumulates
  // this stroke's own ink at full opacity as the pointer moves. Each move restores the
  // snapshot then composites the buffer on top at the tool's target opacity, in one shot -
  // the same self-overlap fix as `drawStroke`, but applied live rather than after the fact.
  const snapshotRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  // captured once, at mount, deliberately not kept in sync with the `strokes` prop
  // afterwards: a stroke drawn during this mount is already painted live by the pointer
  // handlers below, so redrawing on every prop change would double-paint it. This layer
  // remounts wholesale (`key={currentPage}`) on every page change, which is exactly when a
  // fresh redraw-from-storage is wanted.
  const initialStrokesRef = useRef(strokes);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    // idempotency matters here, not just tidiness: React (in dev, under StrictMode) can and
    // does invoke a mount effect's setup twice in a row. Redrawing a fully-opaque stroke
    // twice looks identical either way, but redrawing a semi-transparent one twice silently
    // stacks its alpha (0.4 twice ≈ 0.64) - a real bug that only shows up for non-opaque
    // tools. Clearing first makes the effect correct regardless of how many times it runs.
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of initialStrokesRef.current) {
      drawStroke(context, stroke, canvas.width, canvas.height);
    }
  }, []);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // the canvas's backing bitmap resolution (width/height attributes) can in principle
    // differ from its displayed CSS size, so map the pointer's CSS-pixel position into the
    // canvas's own coordinate space rather than assuming they're always identical.
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = getPoint(e);
    if (!canvas || !point) return;

    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    activeToolRef.current = tool;
    lastPointRef.current = point;
    currentPointsRef.current = [point];

    if (TOOL_STYLES[tool].opacity < 1) {
      if (!snapshotRef.current) snapshotRef.current = document.createElement("canvas");
      if (!bufferRef.current) bufferRef.current = document.createElement("canvas");
      snapshotRef.current.width = canvas.width;
      snapshotRef.current.height = canvas.height;
      bufferRef.current.width = canvas.width;
      bufferRef.current.height = canvas.height;
      snapshotRef.current.getContext("2d")?.drawImage(canvas, 0, 0);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getPoint(e);
    const last = lastPointRef.current;
    if (!canvas || !context || !point || !last) return;

    const style = TOOL_STYLES[activeToolRef.current];

    if (style.opacity < 1) {
      const buffer = bufferRef.current;
      const snapshot = snapshotRef.current;
      const bufferContext = buffer?.getContext("2d");
      if (!buffer || !snapshot || !bufferContext) return;

      // accumulate this stroke's shape on the buffer at full opacity - overlapping
      // segments within the same stroke just stay opaque, they don't stack.
      setStrokeAppearance(bufferContext, style);
      bufferContext.beginPath();
      bufferContext.moveTo(last.x, last.y);
      bufferContext.lineTo(point.x, point.y);
      bufferContext.stroke();

      // repaint from the pre-stroke snapshot, then composite the whole buffer once at the
      // target opacity - so the visible result is always "one" blend, never several. A plain
      // drawImage of the snapshot is not enough: under the default source-over compositing, a
      // transparent snapshot pixel leaves whatever's already on the canvas untouched, so the
      // previous move's partial composite would never actually get cleared - clearRect first.
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = 1;
      context.drawImage(snapshot, 0, 0);
      context.globalAlpha = style.opacity;
      context.drawImage(buffer, 0, 0);
      context.globalAlpha = 1;
    } else {
      setStrokeAppearance(context, style);
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }

    lastPointRef.current = point;
    currentPointsRef.current.push(point);
  }

  function endStroke() {
    const points = currentPointsRef.current;
    // a plain click with no drag produces a single point - not a stroke worth keeping.
    if (drawingRef.current && points.length > 1) {
      onStrokeComplete?.({ tool: activeToolRef.current, ...TOOL_STYLES[activeToolRef.current], points });
    }

    drawingRef.current = false;
    lastPointRef.current = null;
    currentPointsRef.current = [];
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      data-page-number={pageNumber}
      data-testid="annotation-layer"
      className="absolute inset-0 h-full w-full cursor-crosshair"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerLeave={endStroke}
      onPointerCancel={endStroke}
    />
  );
}
