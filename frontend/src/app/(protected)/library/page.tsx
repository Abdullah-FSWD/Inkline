"use client";

import { UploadPanel } from "./UploadPanel";

export default function LibraryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Your library</h1>
      <p className="mb-6 text-sm text-muted-foreground">Upload a PDF to start reading and annotating.</p>
      <UploadPanel />
    </main>
  );
}
