export interface Point {
  x: number;
  y: number;
}

export const TOOLS = ["pencil", "highlighter", "underline"] as const;
export type ToolId = (typeof TOOLS)[number];

export const DRAW_MODES = ["straight", "freehand"] as const;
export type DrawMode = (typeof DRAW_MODES)[number];

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
