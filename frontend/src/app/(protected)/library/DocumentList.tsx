"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Loader2, Trash2, Check, X, CircleCheck, TriangleAlert } from "lucide-react";
import type { DocumentSummary } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  processing: "Processing…",
  failed: "Failed",
};

const STATUS_CLASS: Record<string, string> = {
  ready: "bg-accent/10 text-accent",
  processing: "bg-input-border text-muted-foreground",
  failed: "bg-danger-bg text-danger",
};

const STATUS_ICON: Record<string, typeof CircleCheck> = {
  ready: CircleCheck,
  processing: Loader2,
  failed: TriangleAlert,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICON[status] ?? Loader2;
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status] ?? STATUS_CLASS.processing}`}>
      <Icon size={12} className={status === "processing" ? "animate-spin" : undefined} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function DocumentInfo({ doc }: { doc: DocumentSummary }) {
  return (
    <>
      <FileText size={18} className="shrink-0 text-accent" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
        <p className="text-xs text-muted-foreground">Updated {formatDate(doc.updatedAt)}</p>
      </div>
    </>
  );
}

interface DocumentListProps {
  documents: DocumentSummary[];
  loading: boolean;
  onDelete?: (id: string) => void;
}

export function DocumentList({ documents, loading, onDelete }: DocumentListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Loading your library…
      </div>
    );
  }

  if (documents.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No documents yet. Upload one to get started.</p>;
  }

  return (
    <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl border border-surface-border bg-surface">
      {documents.map((doc, index) => (
        <motion.li
          key={doc.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: index * 0.03 }}
          className="flex items-center gap-3 px-4 py-3"
        >
          {doc.status === "ready" ? (
            <Link href={`/documents/${doc.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <DocumentInfo doc={doc} />
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <DocumentInfo doc={doc} />
            </div>
          )}

          <StatusBadge status={doc.status} />

          <AnimatePresence initial={false}>
            {confirmingId === doc.id ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex shrink-0 items-center gap-1.5"
              >
                <span className="text-xs text-muted-foreground">Delete?</span>
                <button
                  type="button"
                  aria-label={`Confirm delete ${doc.title}`}
                  onClick={() => {
                    setConfirmingId(null);
                    onDelete?.(doc.id);
                  }}
                  className="rounded-full p-1 text-danger hover:bg-danger-bg"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel delete"
                  onClick={() => setConfirmingId(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-input-border"
                >
                  <X size={14} />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="trigger"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                type="button"
                aria-label={`Delete ${doc.title}`}
                onClick={() => setConfirmingId(doc.id)}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <Trash2 size={15} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.li>
      ))}
    </ul>
  );
}
