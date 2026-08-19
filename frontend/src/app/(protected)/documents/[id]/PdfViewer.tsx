"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDocumentProxy = any;

interface PdfViewerProps {
  fileUrl: string;
  onLoaded?: (numPages: number) => void;
}

export function PdfViewer({ fileUrl, onLoaded }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);

  // Load the PDF document once per fileUrl and cache it - later page changes (US-3.2's
  // next/prev controls) reuse this instance instead of re-fetching the whole file.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPdf(null);
      setCurrentPage(1);
      setNumPages(1);
      setError(null);

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

  // Render whichever page is current whenever the loaded document or the requested page changes.
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

        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvasContext: context, viewport, canvas });
        await renderTask.promise;
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
  }, [pdf, currentPage]);

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

  if (error) {
    return (
      <p role="alert" className="py-16 text-center text-sm text-danger">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {loading && (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Rendering document…
        </div>
      )}
      <canvas ref={canvasRef} className={`rounded-lg shadow-md ${loading ? "hidden" : ""}`} />

      {/* Persistent position indicator: gated on the document having loaded at all, not on
          per-page `loading` - that flag flips true/false on every page turn, and hiding this
          on each turn would make it disappear and reappear constantly instead of staying
          visible "at all times during reading" as required. */}
      {pdf && (
        <div className="flex items-center gap-3" aria-live="polite">
          {numPages > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous page"
                disabled={loading || currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
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
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Page 1 of 1</span>
          )}
        </div>
      )}
    </div>
  );
}
