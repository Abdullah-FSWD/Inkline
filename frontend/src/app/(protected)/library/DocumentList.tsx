"use client";

import { motion } from "framer-motion";
import { FileText, Loader2 } from "lucide-react";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function DocumentList({ documents, loading }: { documents: DocumentSummary[]; loading: boolean }) {
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
          <FileText size={18} className="shrink-0 text-accent" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
            <p className="text-xs text-muted-foreground">Updated {formatDate(doc.updatedAt)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[doc.status] ?? STATUS_CLASS.processing}`}>
            {STATUS_LABEL[doc.status] ?? doc.status}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
