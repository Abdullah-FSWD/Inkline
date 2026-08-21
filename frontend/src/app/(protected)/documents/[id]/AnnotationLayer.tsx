"use client";

import { useRef } from "react";

interface AnnotationLayerProps {
  pageNumber: number;
  width: number;
  height: number;
}

// Deliberately depends on nothing but page dimensions and a page number - never on whether
// the underlying page came from a native PDF or (eventually, Stage 6) a converted HTML page,
// per US-4.6. A transparent canvas sits exactly over the rendered page canvas (same pixel
// width/height, absolutely positioned within a wrapper the page canvas itself sizes), ready
// for stroke capture to draw onto in the next sub-task.
export function AnnotationLayer({ pageNumber, width, height }: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      data-page-number={pageNumber}
      data-testid="annotation-layer"
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none" }}
    />
  );
}
