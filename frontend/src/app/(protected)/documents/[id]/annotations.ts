export interface Point {
  x: number;
  y: number;
}

// What AnnotationLayer itself knows about a stroke it just finished drawing - everything
// about *how* it was drawn. The parent (PdfViewer) is the one that knows *where* (which page),
// so it tags on pageNumber/id when promoting this into a stored Stroke.
export interface StrokeData {
  tool: "pencil";
  color: string;
  width: number;
  points: Point[];
}

export interface Stroke extends StrokeData {
  id: string;
  pageNumber: number;
}
