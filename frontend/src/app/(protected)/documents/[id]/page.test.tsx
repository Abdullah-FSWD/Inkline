import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DocumentPage from "./page";
import { getDocument, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getDocument: vi.fn() };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
}));

// PdfViewer's own rendering (pdf.js, canvas) is covered by its own test file with
// pdfjs-dist mocked; here we only need to confirm the page hands it the right file URL.
vi.mock("./PdfViewer", () => ({
  PdfViewer: ({ fileUrl }: { fileUrl: string }) => <div data-testid="pdf-viewer">{fileUrl}</div>,
}));

const mockedGetDocument = vi.mocked(getDocument);

beforeEach(() => {
  mockedGetDocument.mockReset();
});

describe("DocumentPage", () => {
  it("fetches the document by id from the route params and shows the reading view for a ready document", async () => {
    mockedGetDocument.mockResolvedValueOnce({
      id: "42",
      title: "My Report",
      sourceType: "pdf",
      status: "ready",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    render(<DocumentPage />);

    expect(await screen.findByText("My Report")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveTextContent("/documents/42/file");
    expect(mockedGetDocument).toHaveBeenCalledWith("42");
  });

  it("guards against opening a still-processing document, showing status instead of the reader", async () => {
    mockedGetDocument.mockResolvedValueOnce({
      id: "42",
      title: "My Report",
      sourceType: "html",
      status: "processing",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    render(<DocumentPage />);

    expect(await screen.findByRole("status")).toHaveTextContent(/still processing/i);
    expect(screen.queryByTestId("pdf-viewer")).not.toBeInTheDocument();
  });

  it("guards against opening a failed document, showing status instead of the reader", async () => {
    mockedGetDocument.mockResolvedValueOnce({
      id: "42",
      title: "My Report",
      sourceType: "html",
      status: "failed",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    render(<DocumentPage />);

    expect(await screen.findByRole("status")).toHaveTextContent(/failed to process/i);
    expect(screen.queryByTestId("pdf-viewer")).not.toBeInTheDocument();
  });

  it("shows a not-found message for a 404", async () => {
    mockedGetDocument.mockRejectedValueOnce(new ApiError("Document not found.", 404));

    render(<DocumentPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/document not found/i);
    expect(screen.getByRole("link", { name: /back to library/i })).toBeInTheDocument();
  });
});
