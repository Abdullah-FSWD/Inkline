"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadCloud, FileText, CircleCheck, TriangleAlert, X } from "lucide-react";
import { uploadDocument, ApiError, type UploadedDocument } from "@/lib/api";

type Status = "idle" | "uploading" | "success" | "error";

export function UploadPanel({ onUploaded }: { onUploaded?: (doc: UploadedDocument) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedDocument | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
    setUploaded(null);
  }

  function selectFile(candidate: File) {
    const name = candidate.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".html") && !name.endsWith(".htm")) {
      setError("Only PDF and HTML files are supported.");
      setStatus("error");
      return;
    }
    setFile(candidate);
    setError(null);
    setStatus("idle");
  }

  async function startUpload() {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);
    setError(null);

    try {
      const doc = await uploadDocument(file, setProgress);
      setUploaded(doc);
      setStatus("success");
      onUploaded?.(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6">
      {status === "success" && uploaded ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          role="status"
          className="flex flex-col items-center gap-2 py-6 text-center"
        >
          <CircleCheck size={32} className="text-accent" strokeWidth={1.75} />
          <p className="text-sm text-foreground">
            <span className="font-medium">{uploaded.title}</span> uploaded and ready.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 text-sm font-medium text-accent hover:text-accent-hover"
          >
            Upload another
          </button>
        </motion.div>
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) selectFile(dropped);
            }}
            onClick={file ? undefined : () => inputRef.current?.click()}
            role={file ? undefined : "button"}
            tabIndex={file ? undefined : 0}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              file ? "" : "cursor-pointer"
            } ${dragActive ? "border-accent bg-accent/5" : "border-input-border"}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf,.html,.htm,text/html"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) selectFile(selected);
              }}
            />
            {file ? (
              <>
                <FileText size={28} className="text-accent" strokeWidth={1.75} />
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                  Remove
                </button>
              </>
            ) : (
              <>
                <UploadCloud size={28} className="text-muted-foreground" strokeWidth={1.75} />
                <p className="text-sm text-foreground">
                  <span className="font-medium text-accent">Choose a PDF or HTML file</span> or drag it here
                </p>
              </>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                className="mt-3 flex items-center gap-1.5 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
              >
                <TriangleAlert size={14} className="shrink-0" />
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {status === "uploading" && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-input-border">
                <motion.div
                  className="h-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut" }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}

          {file && status !== "uploading" && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={startUpload}
              className="mt-4 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
            >
              Upload
            </motion.button>
          )}
        </>
      )}
    </div>
  );
}
