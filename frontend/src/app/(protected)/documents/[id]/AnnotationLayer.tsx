"use client";

import { useRef } from "react";
import type { Point, StrokeData } from "./annotations";

interface AnnotationLayerProps {
  pageNumber: number;
  width: number;
  height: number;
  onStrokeComplete?: (stroke: StrokeData) => void;
}

// Pencil is the only annotation tool that exists yet (highlighter/underline come in
// US-4.2/4.3), so drawing is always-on for now - a tool switcher becomes necessary once a
// second tool exists to conflict with, not before.
const PENCIL_COLOR = "#1c1a17";
const PENCIL_WIDTH = 2;

// Deliberately depends on nothing but page dimensions and a page number - never on whether
// the underlying page came from a native PDF or (eventually, Stage 6) a converted HTML page,
// per US-4.6. A transparent canvas sits exactly over the rendered page canvas (same pixel
// width/height, absolutely positioned within a wrapper the page canvas itself sizes).
export function AnnotationLayer({ pageNumber, width, height, onStrokeComplete }: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  // accumulates every point of the in-progress stroke, so the whole ordered path can be
  // handed off to the parent once the stroke finishes - not just used for live drawing.
  const currentPointsRef = useRef<Point[]>([]);

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

    context.strokeStyle = PENCIL_COLOR;
    context.lineWidth = PENCIL_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();

    lastPointRef.current = point;
    currentPointsRef.current.push(point);
  }

  function endStroke() {
    const points = currentPointsRef.current;
    // a plain click with no drag produces a single point - not a stroke worth keeping.
    if (drawingRef.current && points.length > 1) {
      onStrokeComplete?.({ tool: "pencil", color: PENCIL_COLOR, width: PENCIL_WIDTH, points });
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
