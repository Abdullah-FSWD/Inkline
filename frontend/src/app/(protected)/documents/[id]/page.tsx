"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, FileText, ArrowLeft, TriangleAlert } from "lucide-react";
import { getDocument, ApiError, type DocumentSummary } from "@/lib/api";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDocument] = useState<DocumentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const doc = await getDocument(id);
        if (cancelled) return;
        setDocument(doc);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError && err.status === 404 ? "Document not found." : "Couldn't load this document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Loading…
      </main>
    );
  }

  if (error || !doc) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <Link href="/library" className="flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover">
          <ArrowLeft size={14} />
          Back to library
        </Link>
      </main>
    );
  }

  const backLink = (
    <Link href="/library" className="mb-6 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft size={14} />
      Back to library
    </Link>
  );

  if (doc.status !== "ready") {
    const isFailed = doc.status === "failed";
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-surface-border bg-surface px-6 py-16 text-center">
          {isFailed ? (
            <TriangleAlert size={32} className="text-danger" strokeWidth={1.75} />
          ) : (
            <Loader2 size={32} className="animate-spin text-muted-foreground" strokeWidth={1.75} />
          )}
          <h1 className="text-lg font-semibold text-foreground">{doc.title}</h1>
          <p role="status" className="text-sm text-muted-foreground">
            {isFailed
              ? "This document failed to process and can't be opened."
              : "This document is still processing. Check back in a moment."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      {backLink}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-surface-border bg-surface px-6 py-16 text-center">
        <FileText size={32} className="text-accent" strokeWidth={1.75} />
        <h1 className="text-lg font-semibold text-foreground">{doc.title}</h1>
        <p className="text-sm text-muted-foreground">The reading view is coming soon.</p>
      </div>
    </main>
  );
}
