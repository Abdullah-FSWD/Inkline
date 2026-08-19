import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentList } from "./DocumentList";
import type { DocumentSummary } from "@/lib/api";

function doc(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "1",
    title: "Report",
    sourceType: "pdf",
    status: "ready",
    updatedAt: "2026-01-15T00:00:00.000Z",
    createdAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("DocumentList", () => {
  it("shows a loading state", () => {
    render(<DocumentList documents={[]} loading={true} />);
    expect(screen.getByText(/loading your library/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no documents", () => {
    render(<DocumentList documents={[]} loading={false} />);
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
  });

  it("renders each document's title and status", () => {
    render(
      <DocumentList
        documents={[doc({ id: "1", title: "Ready Doc", status: "ready" }), doc({ id: "2", title: "Failed Doc", status: "failed" })]}
        loading={false}
      />
    );

    expect(screen.getByText("Ready Doc")).toBeInTheDocument();
    expect(screen.getByText("Failed Doc")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
