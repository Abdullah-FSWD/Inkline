import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PdfViewer } from "./PdfViewer";

const getPage = vi.fn();
const getDocument = vi.fn();

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

beforeEach(() => {
  getPage.mockReset();
  getDocument.mockReset();
  // jsdom's canvas has no real 2D rendering context by default
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({}) as never;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mockPage() {
  return {
    getViewport: () => ({ width: 100, height: 150 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
}

describe("PdfViewer", () => {
  it("shows a loading state while pdf.js is fetching the document, then renders it", async () => {
    const documentLoad = deferred<{ getPage: typeof getPage; numPages: number }>();
    getDocument.mockReturnValue({ promise: documentLoad.promise });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);

    expect(screen.getByText(/rendering document/i)).toBeInTheDocument();

    getPage.mockResolvedValue(mockPage());
    documentLoad.resolve({ getPage, numPages: 1 });

    await vi.waitFor(() => expect(screen.queryByText(/rendering document/i)).not.toBeInTheDocument());
  });

  it("shows an error message if pdf.js fails to load the document", async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("network error")) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load this pdf/i);
  });

  it("passes withCredentials so the httpOnly session cookie is sent cross-origin", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);

    await vi.waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://localhost:4000/documents/1/file", withCredentials: true })
    );
  });

  it("renders page 1 by default and reports the total page count for a multi-page document", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 5 }) });
    const onLoaded = vi.fn();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" onLoaded={onLoaded} />);

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(onLoaded).toHaveBeenCalledWith(5);
  });

  it("re-fetches the document only when fileUrl changes, not on every render", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 2 }) });

    const { rerender } = render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));

    rerender(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    expect(getDocument).toHaveBeenCalledTimes(1);

    rerender(<PdfViewer fileUrl="http://localhost:4000/documents/2/file" />);
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));
  });

  it("does not show navigation controls for a single-page document", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
  });

  it("navigates forward and back through a multi-page document", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(2));

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(3));
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /previous page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(2));
  });

  it("resets to page 1 when switching to a different document", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });
    const user = userEvent.setup();

    const { rerender } = render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(2));

    getPage.mockClear();
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 4 }) });
    rerender(<PdfViewer fileUrl="http://localhost:4000/documents/2/file" />);

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(getPage).not.toHaveBeenCalledWith(2);
  });
});
