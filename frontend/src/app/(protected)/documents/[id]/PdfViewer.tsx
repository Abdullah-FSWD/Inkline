"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the PDF document once per fileUrl and cache it - later page changes (US-3.2's
  // next/prev controls) reuse this instance instead of re-fetching the whole file.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPdf(null);
      setCurrentPage(1);
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
    </div>
  );
}
