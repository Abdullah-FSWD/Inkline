"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadPanel } from "./UploadPanel";
import { DocumentList } from "./DocumentList";
import { listDocuments, deleteDocument, ApiError, type DocumentSummary } from "@/lib/api";

export default function LibraryPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your library. Please try again.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const docs = await listDocuments();
        if (cancelled) return;
        setDocuments(docs);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Couldn't load your library. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // HTML uploads convert in the background (US-1.3) and can sit at "processing" for a couple
  // of seconds - poll while any document is still processing so the library reflects it
  // finishing without the reader having to manually reload. PDFs are always "ready"
  // immediately, so this loop is a no-op for a library with none in flight.
  useEffect(() => {
    if (!documents.some((doc) => doc.status === "processing")) return;

    const interval = setInterval(() => {
      refresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [documents, refresh]);

  async function handleDelete(id: string) {
    const previous = documents;
    setDocuments((docs) => docs.filter((d) => d.id !== id));
    try {
      await deleteDocument(id);
    } catch (err) {
      setDocuments(previous);
      setError(err instanceof ApiError ? err.message : "Couldn't delete this document. Please try again.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Your library</h1>
      <p className="mb-6 text-sm text-muted-foreground">Upload a PDF or HTML document to start reading and annotating.</p>
      <UploadPanel onUploaded={refresh} />
      {error && (
        <p role="alert" className="mt-8 text-center text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-8">
        <DocumentList documents={documents} loading={loading} onDelete={handleDelete} />
      </div>
    </main>
  );
}
