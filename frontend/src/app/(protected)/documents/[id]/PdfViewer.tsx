"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Pencil,
  Highlighter,
  Underline,
  Eraser,
  Slash,
  Spline,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";
import { listAnnotations, createAnnotation, deleteAnnotation } from "@/lib/api";
import {
  COLOR_PALETTE,
  DEFAULT_TOOL_STYLE,
  DRAW_MODES,
  TOOLS,
  WIDTH_RANGE,
  type DrawMode,
  type Stroke,
  type StrokeData,
  type ToolId,
} from "./annotations";

// network calls that fail transiently (a dropped connection, a momentary server hiccup)
// shouldn't cost the user their annotation - retry a few times with backoff before giving up
// and surfacing it as a real failure.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastError;
}

// what one undo step reverts - either the most recent stroke added (undo removes it) or the
// most recent erase (undo restores it, at the index it originally occupied so overlapping
// strokes go back to their original stacking order).
type UndoAction =
  | { type: "add"; pageNumber: number; stroke: Stroke }
  | { type: "erase"; pageNumber: number; stroke: Stroke; index: number };

function applyUndo(pageStrokes: Stroke[], action: UndoAction): Stroke[] {
  if (action.type === "add") return pageStrokes.filter((s) => s.id !== action.stroke.id);
  const restored = [...pageStrokes];
  restored.splice(Math.min(action.index, restored.length), 0, action.stroke);
  return restored;
}

const TOOL_ICONS: Record<ToolId, typeof Pencil> = { pencil: Pencil, highlighter: Highlighter, underline: Underline, eraser: Eraser };
const TOOL_LABELS: Record<ToolId, string> = { pencil: "Pencil", highlighter: "Highlighter", underline: "Underline", eraser: "Eraser" };
const MODE_ICONS: Record<DrawMode, typeof Slash> = { straight: Slash, freehand: Spline };
const MODE_LABELS: Record<DrawMode, string> = { straight: "Straight line", freehand: "Freehand" };
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
  documentId: string;
  onLoaded?: (numPages: number) => void;
  showToolbar?: boolean;
}

export function PdfViewer({ fileUrl, documentId, onLoaded, showToolbar = true }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<AnnotationLayerHandle>(null);
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
  // one global undo stack, not scoped per page (US-4.5) - matches how undo works in most
  // drawing apps: it reverts whatever you did most recently, regardless of which page you're
  // currently viewing. Undoing an action on a page you're not looking at updates its stored
  // strokes silently; you'd only see it if you navigated there.
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  // the selected tool applies across the whole document, not per page - unlike strokes, it
  // isn't reset on page navigation or document switch.
  const [tool, setTool] = useState<ToolId>("pencil");
  // only meaningful for the underline tool (US-4.3) - pencil/highlighter always draw
  // freehand. Defaults to straight since underlining text is the more common case.
  const [drawMode, setDrawMode] = useState<DrawMode>("straight");
  // each tool remembers its own color/width (US-4.4), not one shared setting - switching
  // tools recalls that tool's own last-picked style rather than resetting or bleeding into
  // another tool's choice. Persists across page navigation and document switches, like `tool`.
  const [toolStyles, setToolStyles] = useState(DEFAULT_TOOL_STYLE);
  // strokes are created with a temporary client-side id immediately (so undo/erase can
  // reference them right away, before any network round trip). Once created, that id lives
  // on IN PLACE - `reconcileClientId` overwrites it with the real server id everywhere it
  // appears (strokesByPage, undoStack) rather than keeping a separate id-to-id mapping, so
  // whatever id a stroke currently carries is always the right one to act on. This set is
  // only for telling the two cases apart: is an id still a client-side placeholder (tracked
  // here) or already the real server id (not tracked here, safe to delete with directly)?
  const pendingClientIdsRef = useRef<Set<string>>(new Set());
  // a clientId lands here if the user erases (or undoes) a stroke before its create request
  // has resolved - there's no server id to delete yet, so the delete is deferred until the
  // create resolves and reconciliation supplies one. If the create ultimately fails instead,
  // this stays queued forever, which is correct: no server record ever existed to delete.
  const pendingDeleteClientIdsRef = useRef<Set<string>>(new Set());
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSyncError(message: string) {
    setSyncError(message);
    if (syncErrorTimeoutRef.current) clearTimeout(syncErrorTimeoutRef.current);
    syncErrorTimeoutRef.current = setTimeout(() => setSyncError(null), 8000);
  }

  function reconcileClientId(clientId: string, serverId: string) {
    pendingClientIdsRef.current.delete(clientId);

    setStrokesByPage((prev) => {
      const next: Record<number, Stroke[]> = {};
      for (const [page, strokes] of Object.entries(prev)) {
        next[Number(page)] = strokes.map((s) => (s.id === clientId ? { ...s, id: serverId } : s));
      }
      return next;
    });

    setUndoStack((stack) =>
      stack.map((action) => (action.stroke.id === clientId ? { ...action, stroke: { ...action.stroke, id: serverId } } : action))
    );

    if (pendingDeleteClientIdsRef.current.has(clientId)) {
      pendingDeleteClientIdsRef.current.delete(clientId);
      void syncDelete(serverId);
    }
  }

  async function syncCreate(clientId: string, stroke: StrokeData & { pageNumber: number }) {
    pendingClientIdsRef.current.add(clientId);
    try {
      const saved = await withRetry(() => createAnnotation(documentId, stroke));
      reconcileClientId(clientId, saved.id);
    } catch (err) {
      console.error("Failed to save annotation", err);
      showSyncError("Couldn't save your last annotation. It's kept locally but may be lost on reload.");
    }
  }

  async function syncDelete(serverId: string) {
    try {
      await withRetry(() => deleteAnnotation(documentId, serverId));
    } catch (err) {
      console.error("Failed to delete annotation", err);
      showSyncError("Couldn't delete an annotation on the server. It may reappear after reloading.");
    }
  }

  // deletes a stroke's server record now, or - if it's still mid-create (still just a client
  // id, no server record exists yet) - queues the delete for once reconciliation happens.
  function resolveOrQueueDelete(id: string) {
    if (pendingClientIdsRef.current.has(id)) {
      pendingDeleteClientIdsRef.current.add(id);
    } else {
      void syncDelete(id);
    }
  }

  function setToolColor(color: string) {
    setToolStyles((prev) => ({ ...prev, [tool]: { ...prev[tool], color } }));
  }

  function setToolWidth(width: number) {
    setToolStyles((prev) => ({ ...prev, [tool]: { ...prev[tool], width } }));
  }

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
      setUndoStack([]);
      setRenderedPage(0);
      pendingClientIdsRef.current = new Set();
      pendingDeleteClientIdsRef.current = new Set();

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

  // Loads previously-saved annotations once per document (US-4.7) and buckets them by page,
  // same shape as strokes drawn locally. Runs independently of the PDF-loading effect above -
  // annotations are plain small JSON, no reason to block them on pdf.js parsing the file, or
  // vice versa.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const records = await listAnnotations(documentId);
        if (cancelled) return;

        const bucketed: Record<number, Stroke[]> = {};
        for (const record of records) {
          (bucketed[record.pageNumber] ??= []).push(record as Stroke);
        }
        setStrokesByPage(bucketed);

        // the current page's AnnotationLayer may already have mounted (and captured its
        // now-stale, empty initial strokes) before this fetch resolved - force a redraw.
        // A freshly-opened document always starts on page 1, so that's what to redraw with;
        // `currentPage` itself isn't a safe read here since this effect intentionally doesn't
        // re-run on page navigation.
        annotationLayerRef.current?.redraw(bucketed[1] ?? []);
      } catch (err) {
        console.error("Failed to load annotations", err);
        showSyncError("Couldn't load saved annotations for this document.");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

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
    const clientId = crypto.randomUUID();
    const withId: Stroke = { ...stroke, id: clientId, pageNumber: currentPage };
    setStrokesByPage((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] ?? []), withId],
    }));
    setUndoStack((stack) => [...stack, { type: "add", pageNumber: currentPage, stroke: withId }]);

    void syncCreate(clientId, { ...stroke, pageNumber: currentPage });
  }

  function handleEraseStroke(id: string) {
    const pageStrokes = strokesByPage[currentPage] ?? [];
    const index = pageStrokes.findIndex((stroke) => stroke.id === id);
    if (index === -1) return;
    const stroke = pageStrokes[index];

    setStrokesByPage((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] ?? []).filter((s) => s.id !== id),
    }));
    setUndoStack((stack) => [...stack, { type: "erase", pageNumber: currentPage, stroke, index }]);

    resolveOrQueueDelete(id);
  }

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));

    if (action.type === "add") {
      const updated = applyUndo(strokesByPage[action.pageNumber] ?? [], action);
      setStrokesByPage((prev) => ({ ...prev, [action.pageNumber]: updated }));
      // strokesByPage alone won't repaint the page currently on screen - AnnotationLayer only
      // redraws from its `strokes` prop once, at mount, to avoid double-painting a stroke
      // that's already been drawn live. Undo needs that redraw to happen right now instead.
      if (action.pageNumber === currentPage) annotationLayerRef.current?.redraw(updated);
      resolveOrQueueDelete(action.stroke.id);
      return;
    }

    // undoing an erase: the server record was already deleted when the erase happened, so
    // restoring it needs a fresh create - re-using the old (now-deleted) id would just 404 the
    // next time this stroke is erased or undone again.
    const clientId = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarding the old (now-deleted) server id
    const { id: _oldId, ...strokeData } = action.stroke;
    const restored: Stroke = { ...strokeData, id: clientId, pageNumber: action.pageNumber };
    const pageStrokes = [...(strokesByPage[action.pageNumber] ?? [])];
    pageStrokes.splice(Math.min(action.index, pageStrokes.length), 0, restored);
    setStrokesByPage((prev) => ({ ...prev, [action.pageNumber]: pageStrokes }));
    if (action.pageNumber === currentPage) annotationLayerRef.current?.redraw(pageStrokes);
    void syncCreate(clientId, { ...strokeData, pageNumber: action.pageNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documentId is stable per mount; syncCreate/resolveOrQueueDelete close over live refs/state, not memoized
  }, [undoStack, strokesByPage, currentPage]);

  // Ctrl/Cmd+Z undoes the last annotation action, unless the user is typing somewhere (the
  // page-number jump input) - a global shortcut shouldn't swallow keystrokes meant for a field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isUndoShortcut = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndoShortcut) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      e.preventDefault();
      handleUndo();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo]);

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
      {/* Shown regardless of `showToolbar` - a failed save/delete is a data-integrity notice,
          not chrome the reader chose to hide. Auto-clears after a few seconds. */}
      {syncError && (
        <div
          role="alert"
          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-danger-bg px-4 py-2 text-xs font-medium text-danger shadow-sm"
        >
          {syncError}
        </div>
      )}
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
              ref={annotationLayerRef}
              key={currentPage}
              pageNumber={currentPage}
              width={pageSize.width}
              height={pageSize.height}
              tool={tool}
              mode={drawMode}
              color={toolStyles[tool].color}
              strokeWidth={toolStyles[tool].width}
              strokes={strokesByPage[currentPage]}
              onStrokeComplete={handleStrokeComplete}
              onEraseStroke={handleEraseStroke}
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
          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <Undo2 size={18} />
          </button>

          <div className="mx-1 hidden h-4 w-px bg-surface-border sm:block" />

          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Annotation tool">
            {TOOLS.map((id) => {
              const Icon = TOOL_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={tool === id}
                  aria-label={TOOL_LABELS[id]}
                  onClick={() => setTool(id)}
                  className={`rounded-full p-2 transition-colors ${
                    tool === id ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-input hover:text-foreground"
                  }`}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>

          {tool === "underline" && (
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Underline mode">
              {DRAW_MODES.map((id) => {
                const Icon = MODE_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={drawMode === id}
                    aria-label={MODE_LABELS[id]}
                    onClick={() => setDrawMode(id)}
                    className={`rounded-full p-2 transition-colors ${
                      drawMode === id ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-input hover:text-foreground"
                    }`}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          )}

          {tool !== "eraser" && (
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Annotation color">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={toolStyles[tool].color === color}
                  aria-label={color}
                  onClick={() => setToolColor(color)}
                  style={{ backgroundColor: color }}
                  className={`h-5 w-5 rounded-full border-2 transition-transform ${
                    toolStyles[tool].color === color ? "scale-110 border-accent" : "border-transparent hover:scale-105"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={tool === "eraser" ? "Decrease eraser size" : "Decrease width"}
              disabled={toolStyles[tool].width <= WIDTH_RANGE[tool].min}
              onClick={() => setToolWidth(Math.max(WIDTH_RANGE[tool].min, toolStyles[tool].width - WIDTH_RANGE[tool].step))}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-xs text-muted-foreground">{toolStyles[tool].width}</span>
            <button
              type="button"
              aria-label={tool === "eraser" ? "Increase eraser size" : "Increase width"}
              disabled={toolStyles[tool].width >= WIDTH_RANGE[tool].max}
              onClick={() => setToolWidth(Math.min(WIDTH_RANGE[tool].max, toolStyles[tool].width + WIDTH_RANGE[tool].step))}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-input hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="mx-1 hidden h-4 w-px bg-surface-border sm:block" />

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
