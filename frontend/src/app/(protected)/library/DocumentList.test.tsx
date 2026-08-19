import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("links a ready document to its reading view", () => {
    render(<DocumentList documents={[doc({ id: "42", status: "ready" })]} loading={false} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/documents/42");
  });

  it("does not make a non-ready document clickable", () => {
    render(<DocumentList documents={[doc({ status: "processing" })]} loading={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("requires a confirm step before calling onDelete", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<DocumentList documents={[doc({ id: "7", title: "Report" })]} loading={false} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete Report" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm delete report/i }));
    expect(onDelete).toHaveBeenCalledWith("7");
  });

  it("cancels the delete confirmation without calling onDelete", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<DocumentList documents={[doc({ id: "7", title: "Report" })]} loading={false} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete Report" }));
    await user.click(screen.getByRole("button", { name: /cancel delete/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete Report" })).toBeInTheDocument();
  });
});
