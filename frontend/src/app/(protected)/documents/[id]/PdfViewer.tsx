"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { AnnotationLayer } from "./AnnotationLayer";
import type { Stroke, StrokeData } from "./annotations";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDocumentProxy = any;

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;
const DEFAULT_SCALE = 1.4;
const CONTAINER_PADDING_PX = 32; // p-4 on both sides of the scrollable viewport
type FitMode = "width" | "height" | null;

interface PdfViewerProps {
  fileUrl: string;
  onLoaded?: (numPages: number) => void;
  showToolbar?: boolean;
}

export function PdfViewer({ fileUrl, onLoaded, showToolbar = true }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [fitMode, setFitMode] = useState<FitMode>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  // which page `pageSize` (and the canvas contents) actually belong to - distinct from
  // `currentPage` because `currentPage` updates synchronously on click, while the render
  // effect (and therefore pageSize) only catches up after an await. Gating AnnotationLayer on
  // this instead of `!loading` avoids a real bug: without it, there's a brief render where
  // currentPage already points at the new page but pageSize/loading are still the old page's,
  // during which AnnotationLayer would mount with stale dimensions and immediately unmount
  // again once `loading` catches up - a visible flash of the wrong content.
  const [renderedPage, setRenderedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  // strokes for the whole document, keyed by page number - lives here (not inside
  // AnnotationLayer) because AnnotationLayer remounts on every page change (see the
  // `key={currentPage}` below), which would otherwise wipe out a page's strokes the moment
  // you navigated away from it.
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});

  // Load the PDF document once per fileUrl and cache it - later page changes (US-3.2's
  // next/prev controls) reuse this instance instead of re-fetching the whole file.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPdf(null);
      setCurrentPage(1);
      setNumPages(1);
      setScale(DEFAULT_SCALE);
      setFitMode(null);
      setError(null);
      setStrokesByPage({});
      setRenderedPage(0);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        // the session cookie is httpOnly and this origin differs from the API's, so
        // pdf.js's own request needs the same credentials:"include" treatment as fetch
        // calls elsewhere - without this the backend sees no cookie and 401s.
        const loaded = await pdfjsLib.getDocument({ url: fileUrl, withCredentials: true }).promise;
        if (cancelled) return;

        setPdf(loaded);
        setNumPages(loaded.numPages);
        onLoaded?.(loaded.numPages);
      } catch (err) {
        if (!cancelled) setError("Couldn't load this PDF.");
        console.error(err);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLoaded is a callback, not reactive state
  }, [fileUrl]);

  // Render whichever page is current whenever the loaded document, requested page, scale, or
  // fit mode changes. When a fit mode is active, the target scale is derived from the page's
  // native size vs. the available container space rather than from the `scale` state directly.
  useEffect(() => {
    if (!pdf) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any;

    async function renderPage() {
      setLoading(true);

      try {
        const page = await pdf.getPage(currentPage);
        if (cancelled) return;

        let effectiveScale = scale;

        if (fitMode && containerRef.current) {
          const native = page.getViewport({ scale: 1 });
          // the viewport is now a real bounded, internally-scrolling container (the
          // distraction-free reading shell from US-3.4), not part of the normally-flowing
          // page - so both dimensions are a plain, reliable measurement, unlike the
          // fixed-allowance approximation fit-height needed before this shell existed.
          if (fitMode === "width") {
            effectiveScale = (containerRef.current.clientWidth - CONTAINER_PADDING_PX) / native.width;
          } else {
            effectiveScale = (containerRef.current.clientHeight - CONTAINER_PADDING_PX) / native.height;
          }
          effectiveScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, effectiveScale));
        }

        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvasContext: context, viewport, canvas });
        await renderTask.promise;

        if (!cancelled) setPageSize({ width: viewport.width, height: viewport.height });
        if (!cancelled) setRenderedPage(currentPage);
        if (!cancelled && fitMode) setScale(effectiveScale);
      } catch (err) {
        if (!cancelled) setError("Couldn't render this PDF.");
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, currentPage, scale, fitMode]);

  function handleStrokeComplete(stroke: StrokeData) {
    const withId: Stroke = { ...stroke, id: crypto.randomUUID(), pageNumber: currentPage };
    setStrokesByPage((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] ?? []), withId],
    }));
  }

  function commitPageInput() {
    const raw = pageInputRef.current?.value ?? "";
    const parsed = Number.parseInt(raw, 10);
    // if the clamped/reverted target equals the page already showing, React bails out on
    // the identical setState and the input's key-based remount never fires - so the typed,
    // out-of-range text would otherwise stay visible even though nothing navigated. Setting
    // the DOM value directly here covers that case regardless of whether state changes.
    const target = Number.isInteger(parsed) ? Math.min(numPages, Math.max(1, parsed)) : currentPage;

    setCurrentPage(target);
    if (pageInputRef.current) pageInputRef.current.value = String(target);
  }

  function zoomBy(direction: 1 | -1) {
    setFitMode(null);
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((s + direction * SCALE_STEP) * 100) / 100)));
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={containerRef} className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
        {loading && (
          <div className="flex items-center gap-2 self-start text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Rendering document…
          </div>
        )}
        <div className={`relative h-fit ${loading ? "hidden" : ""}`}>
          <canvas ref={canvasRef} className="rounded-lg shadow-md" />
          {renderedPage === currentPage && (
            <AnnotationLayer
              key={currentPage}
              pageNumber={currentPage}
              width={pageSize.width}
              height={pageSize.height}
              strokes={strokesByPage[currentPage]}
              onStrokeComplete={handleStrokeComplete}
            />
          )}
        </div>
      </div>

      {/* Persistent position indicator: gated on the document having loaded at all, not on
          per-page `loading` - that flag flips true/false on every page turn, and hiding this
          on each turn would make it disappear and reappear constantly instead of staying
          visible "at all times during reading" as required (while the toolbar is shown at
          all - `showToolbar` is the reader's own explicit choice to hide all chrome). */}
      {pdf && showToolbar && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-surface-border bg-surface px-4 py-2">
          <div className="flex items-center gap-3" aria-live="polite">
            {numPages > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={loading || currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitPageInput();
                    pageInputRef.current?.blur();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    key={currentPage}
                    ref={pageInputRef}
                    type="text"
                    inputMode="numeric"
                    defaultValue={currentPage}
                    disabled={loading}
                    aria-label="Page number"
                    onBlur={commitPageInput}
                    className="w-10 rounded-md border border-input-border bg-input px-1.5 py-1 text-center text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                  <span className="text-sm text-muted-foreground">/ {numPages}</span>
                </form>

                <button
                  type="button"
                  aria-label="Next page"
                  disabled={loading || currentPage >= numPages}
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Page 1 of 1</span>
            )}
          </div>

          <div className="mx-1 hidden h-4 w-px bg-surface-border sm:block" />

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={loading || scale <= MIN_SCALE}
              onClick={() => zoomBy(-1)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-12 text-center text-sm text-muted-foreground">{Math.round((scale / DEFAULT_SCALE) * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={loading || scale >= MAX_SCALE}
              onClick={() => zoomBy(1)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ZoomIn size={16} />
            </button>

            <div className="mx-1 h-4 w-px bg-surface-border" />

            <button
              type="button"
              aria-pressed={fitMode === "width"}
              disabled={loading}
              onClick={() => setFitMode((m) => (m === "width" ? null : "width"))}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                fitMode === "width" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-input hover:text-foreground"
              }`}
            >
              Fit width
            </button>
            <button
              type="button"
              aria-pressed={fitMode === "height"}
              disabled={loading}
              onClick={() => setFitMode((m) => (m === "height" ? null : "height"))}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                fitMode === "height" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-input hover:text-foreground"
              }`}
            >
              Fit height
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
