"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TOOL_OPACITY, type DrawMode, type Point, type Stroke, type StrokeData, type ToolId } from "./annotations";

export interface AnnotationLayerHandle {
  // an imperative escape hatch for the one case ordinary props can't cover: undo (US-4.5)
  // affecting the page currently on screen. The mount effect only ever redraws once, on
  // purpose (see initialStrokesRef below) - reacting to every `strokes` prop change would
  // double-paint a stroke that's already been painted live. Undo needs the opposite: a
  // deliberate, parent-triggered redraw from a specific stroke list, decoupled from the
  // normal prop flow so it can't be confused with a live draw or an eraser's own strokes prop.
  redraw: (strokes: Stroke[]) => void;
}

interface AnnotationLayerProps {
  pageNumber: number;
  width: number;
  height: number;
  tool: ToolId;
  // the CURRENT tool's user-chosen color/width (US-4.4) - opacity is intrinsic to the tool
  // itself (TOOL_OPACITY) and isn't user-configurable, so it isn't passed as a prop. For the
  // eraser, width doubles as its hit-test radius (US-4.5) - it has no color, it paints nothing.
  color: string;
  strokeWidth: number;
  // only meaningful for tools that support more than one drawing mode (currently just
  // underline); ignored by tools that only ever draw freehand.
  mode?: DrawMode;
  strokes?: Stroke[];
  onStrokeComplete?: (stroke: StrokeData) => void;
  // fired once per stroke the eraser touches during a drag (ids, since the parent owns the
  // authoritative strokesByPage list keyed by id - this layer only asks it to remove one).
  onEraseStroke?: (id: string) => void;
}

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

function redrawAll(context: CanvasRenderingContext2D, strokes: StrokeData[], canvasWidth: number, canvasHeight: number) {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  for (const stroke of strokes) {
    drawStroke(context, stroke, canvasWidth, canvasHeight);
  }
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function distanceToStroke(point: Point, stroke: Stroke): number {
  if (stroke.points.length === 1) return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y);

  let min = Infinity;
  for (let i = 0; i < stroke.points.length - 1; i++) {
    min = Math.min(min, distanceToSegment(point, stroke.points[i], stroke.points[i + 1]));
  }
  return min;
}

// Deliberately depends on nothing but page dimensions and a page number - never on whether
// the underlying page came from a native PDF or (eventually, Stage 6) a converted HTML page,
// per US-4.6. A transparent canvas sits exactly over the rendered page canvas (same pixel
// width/height, absolutely positioned within a wrapper the page canvas itself sizes).
export const AnnotationLayer = forwardRef<AnnotationLayerHandle, AnnotationLayerProps>(function AnnotationLayer(
  { pageNumber, width, height, tool, color, strokeWidth, mode = "freehand", strokes = [], onStrokeComplete, onEraseStroke },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  // where the CURRENT stroke started - only used by straight-line mode, which always draws a
  // single segment from here to wherever the pointer currently is, replacing the previous
  // preview rather than accumulating segments like freehand drawing does.
  const firstPointRef = useRef<Point | null>(null);
  // accumulates every point of the in-progress stroke, so the whole ordered path can be
  // handed off to the parent once the stroke finishes - not just used for live drawing.
  const currentPointsRef = useRef<Point[]>([]);
  // the tool/mode/style selected when the CURRENT stroke started - if the user somehow
  // changes any of these mid-drag (switches tools, or tweaks the color/width picker), the
  // stroke should stay consistent rather than changing partway through.
  const activeToolRef = useRef<ToolId>(tool);
  const activeModeRef = useRef<DrawMode>(mode);
  const activeStyleRef = useRef({ color, width: strokeWidth, opacity: TOOL_OPACITY[tool] });
  // live-drawing buffers for a stroke in progress. `snapshotRef` holds the canvas's pixels as
  // they were right before this stroke started; used to erase and redraw a straight-line
  // preview on every move, and (together with `bufferRef`, which accumulates this stroke's
  // own ink at full opacity) to composite a semi-transparent freehand stroke once per move
  // rather than blending each segment independently - the same self-overlap fix `drawStroke`
  // applies after the fact, applied live here instead.
  const snapshotRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  // unlike `initialStrokesRef` below, this DOES stay in sync with the `strokes` prop - the
  // eraser needs to hit-test against whatever is currently stored, including strokes it just
  // erased moments ago earlier in the same drag.
  const liveStrokesRef = useRef(strokes);
  useEffect(() => {
    liveStrokesRef.current = strokes;
  }, [strokes]);
  // ids already erased during the CURRENT drag - `strokes` only reflects a removal after the
  // parent's state update round-trips back down as a new prop, which doesn't happen
  // synchronously between pointermove events, so without this the same stroke could be
  // reported as erased multiple times before the prop catches up.
  const erasedThisDragRef = useRef<Set<string>>(new Set());
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
    redrawAll(context, initialStrokesRef.current, canvas.width, canvas.height);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      redraw(newStrokes: Stroke[]) {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        liveStrokesRef.current = newStrokes;
        redrawAll(context, newStrokes, canvas.width, canvas.height);
      },
    }),
    []
  );

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

  function eraseAt(point: Point) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const radius = activeStyleRef.current.width;
    const hit = liveStrokesRef.current.find(
      (stroke) => !erasedThisDragRef.current.has(stroke.id) && distanceToStroke(point, stroke) <= radius / 2 + stroke.width / 2
    );
    if (!hit) return;

    erasedThisDragRef.current.add(hit.id);
    // redraw immediately from what's left, rather than waiting for the parent's state update
    // to round-trip back down as a new `strokes` prop - instant visual feedback while erasing.
    liveStrokesRef.current = liveStrokesRef.current.filter((s) => s.id !== hit.id);
    redrawAll(context, liveStrokesRef.current, canvas.width, canvas.height);
    onEraseStroke?.(hit.id);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = getPoint(e);
    if (!canvas || !point) return;

    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    activeToolRef.current = tool;
    activeModeRef.current = mode;
    activeStyleRef.current = { color, width: strokeWidth, opacity: TOOL_OPACITY[tool] };
    lastPointRef.current = point;
    firstPointRef.current = point;
    currentPointsRef.current = [point];

    if (tool === "eraser") {
      erasedThisDragRef.current = new Set();
      eraseAt(point);
      return;
    }

    const opacity = TOOL_OPACITY[tool];
    const needsSnapshot = mode === "straight" || opacity < 1;
    if (needsSnapshot) {
      if (!snapshotRef.current) snapshotRef.current = document.createElement("canvas");
      snapshotRef.current.width = canvas.width;
      snapshotRef.current.height = canvas.height;
      snapshotRef.current.getContext("2d")?.drawImage(canvas, 0, 0);
    }
    if (mode !== "straight" && opacity < 1) {
      if (!bufferRef.current) bufferRef.current = document.createElement("canvas");
      bufferRef.current.width = canvas.width;
      bufferRef.current.height = canvas.height;
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    const point = getPoint(e);
    if (!point) return;

    if (activeToolRef.current === "eraser") {
      eraseAt(point);
      lastPointRef.current = point;
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const last = lastPointRef.current;
    if (!canvas || !context || !last) return;

    const style = activeStyleRef.current;

    if (activeModeRef.current === "straight") {
      const snapshot = snapshotRef.current;
      const first = firstPointRef.current;
      if (!snapshot || !first) return;

      // erase the previous preview by restoring the pre-stroke snapshot, then draw a single
      // fresh segment from the start point to wherever the pointer is now - a straight-line
      // preview replaces itself each move rather than accumulating like freehand does.
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = 1;
      context.drawImage(snapshot, 0, 0);
      setStrokeAppearance(context, style);
      context.globalAlpha = style.opacity;
      context.beginPath();
      context.moveTo(first.x, first.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.globalAlpha = 1;

      lastPointRef.current = point;
      currentPointsRef.current = [first, point];
      return;
    }

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
    // the eraser never creates a stroke of its own - it only removes others, already
    // reported one-by-one via onEraseStroke as they were touched.
    // a plain click with no drag produces a single point - not a stroke worth keeping.
    if (drawingRef.current && activeToolRef.current !== "eraser" && points.length > 1) {
      onStrokeComplete?.({ tool: activeToolRef.current, ...activeStyleRef.current, points });
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
});
