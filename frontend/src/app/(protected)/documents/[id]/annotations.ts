export interface Point {
  x: number;
  y: number;
}

export const TOOLS = ["pencil", "highlighter", "underline"] as const;
export type ToolId = (typeof TOOLS)[number];

export const DRAW_MODES = ["straight", "freehand"] as const;
export type DrawMode = (typeof DRAW_MODES)[number];

// Opacity is intrinsic to a tool's identity (a highlighter that isn't semi-transparent isn't
// a highlighter) and isn't user-configurable, unlike color/width.
export const TOOL_OPACITY: Record<ToolId, number> = {
  pencil: 1,
  highlighter: 0.4,
  underline: 1,
};

export const DEFAULT_TOOL_STYLE: Record<ToolId, { color: string; width: number }> = {
  pencil: { color: "#1c1a17", width: 2 },
  highlighter: { color: "#ffd54a", width: 16 },
  underline: { color: "#dc2626", width: 2.5 },
};

// a shared palette rather than per-tool palettes - simpler to reason about and to build a UI
// for, and there's no requirement that any tool be restricted to a subset of colors.
export const COLOR_PALETTE = ["#1c1a17", "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#ffd54a"] as const;

export const WIDTH_RANGE: Record<ToolId, { min: number; max: number; step: number }> = {
  pencil: { min: 1, max: 8, step: 1 },
  highlighter: { min: 8, max: 32, step: 2 },
  underline: { min: 1, max: 8, step: 1 },
};

// What AnnotationLayer itself knows about a stroke it just finished drawing - everything
// about *how* it was drawn. The parent (PdfViewer) is the one that knows *where* (which page),
// so it tags on pageNumber/id when promoting this into a stored Stroke.
export interface StrokeData {
  tool: ToolId;
  color: string;
  width: number;
  opacity: number;
  points: Point[];
}

export interface Stroke extends StrokeData {
  id: string;
  pageNumber: number;
}
