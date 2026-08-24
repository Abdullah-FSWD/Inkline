import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
// pdfjs-dist mocked; here we only need to confirm the page hands it the right file URL
// and toolbar-visibility prop.
vi.mock("./PdfViewer", () => ({
  PdfViewer: ({ fileUrl, documentId, showToolbar }: { fileUrl: string; documentId: string; showToolbar: boolean }) => (
    <div data-testid="pdf-viewer" data-document-id={documentId} data-show-toolbar={String(showToolbar)}>
      {fileUrl}
    </div>
  ),
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
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute("data-document-id", "42");
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

  it("toggles the top bar and PdfViewer's toolbar together, without unmounting PdfViewer", async () => {
    mockedGetDocument.mockResolvedValueOnce({
      id: "42",
      title: "My Report",
      sourceType: "pdf",
      status: "ready",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const user = userEvent.setup();

    render(<DocumentPage />);
    await screen.findByText("My Report");
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute("data-show-toolbar", "true");

    await user.click(screen.getByRole("button", { name: /hide toolbars/i }));

    // the top bar (title) is gone, but PdfViewer itself is still mounted (same element,
    // just told to hide its own toolbar) - reading position lives inside it and is untouched
    expect(screen.queryByText("My Report")).not.toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute("data-show-toolbar", "false");

    await user.click(screen.getByRole("button", { name: /show toolbars/i }));
    expect(screen.getByText("My Report")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute("data-show-toolbar", "true");
  });
});
