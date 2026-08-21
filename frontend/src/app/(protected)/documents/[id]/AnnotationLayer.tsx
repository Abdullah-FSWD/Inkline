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

// Per-tool visual style. Highlighter's alpha-blending correctness for overlapping strokes
// (avoiding a single stroke's self-overlap - or two strokes crossing - stacking darker than
// intended) is deliberately not handled yet; this sub-task only wires tool selection through
// to stroke creation. Simple globalAlpha compositing is a fine approximation until then.
const TOOL_STYLES: Record<ToolId, { color: string; width: number; opacity: number }> = {
  pencil: { color: "#1c1a17", width: 2, opacity: 1 },
  highlighter: { color: "#ffd54a", width: 16, opacity: 0.4 },
};

function applyStrokeStyle(context: CanvasRenderingContext2D, style: { color: string; width: number; opacity: number }) {
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.globalAlpha = style.opacity;
  context.lineCap = "round";
  context.lineJoin = "round";
}

function drawStroke(context: CanvasRenderingContext2D, stroke: StrokeData) {
  if (stroke.points.length < 2) return;

  applyStrokeStyle(context, stroke);
  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
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
  // captured once, at mount, deliberately not kept in sync with the `strokes` prop
  // afterwards: a stroke drawn during this mount is already painted live by the pointer
  // handlers below, so redrawing on every prop change would double-paint it. This layer
  // remounts wholesale (`key={currentPage}`) on every page change, which is exactly when a
  // fresh redraw-from-storage is wanted.
  const initialStrokesRef = useRef(strokes);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;

    for (const stroke of initialStrokesRef.current) {
      drawStroke(context, stroke);
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
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getPoint(e);
    const last = lastPointRef.current;
    if (!canvas || !context || !point || !last) return;

    applyStrokeStyle(context, TOOL_STYLES[activeToolRef.current]);
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.globalAlpha = 1;

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
