"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function PdfViewer({ fileUrl }: { fileUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        // the session cookie is httpOnly and this origin differs from the API's, so
        // pdf.js's own request needs the same credentials:"include" treatment as fetch
        // calls elsewhere - without this the backend sees no cookie and 401s.
        const pdf = await pdfjsLib.getDocument({ url: fileUrl, withCredentials: true }).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
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

    render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [fileUrl]);

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
