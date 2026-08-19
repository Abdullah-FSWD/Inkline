"use client";

import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";

export function ExpiredNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("expired") !== "1") return null;

  return (
    <p className="mb-4 flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
      <Info size={14} className="shrink-0" />
      Your session has expired. Please log in again.
    </p>
  );
}
