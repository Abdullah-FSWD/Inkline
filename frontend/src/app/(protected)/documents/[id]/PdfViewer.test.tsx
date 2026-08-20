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
    getViewport: vi.fn(() => ({ width: 100, height: 150 })),
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

  it("shows a plain 'Page 1 of 1' indicator (no interactive controls) for a single-page document", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
  });

  it("keeps the page indicator and nav controls visible (not hidden) while a page turn is rendering", async () => {
    // regression guard: the indicator used to be gated on `!loading`, which flips true/false
    // on every page turn - meaning it would vanish and reappear on each navigation instead of
    // staying visible "at all times during reading" per the acceptance criteria.
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    const pageRender = deferred<unknown>();
    getPage.mockReturnValue({
      getViewport: () => ({ width: 100, height: 150 }),
      render: vi.fn().mockReturnValue({ promise: pageRender.promise, cancel: vi.fn() }),
    });

    await user.click(screen.getByRole("button", { name: /next page/i }));

    // the render() promise for page 2 hasn't resolved yet - still mid-transition
    expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/page number/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();

    pageRender.resolve(undefined);
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled());
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

  it("jumps to a typed page number on Enter", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 5 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    const input = screen.getByLabelText(/page number/i);
    await user.clear(input);
    await user.type(input, "4{Enter}");

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(4));
  });

  it("clamps a page number typed above the last page", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    const input = screen.getByLabelText(/page number/i);
    await user.clear(input);
    await user.type(input, "999{Enter}");

    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(3));
  });

  it("reverts to the current page on invalid input instead of navigating", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    getPage.mockClear();

    const input = screen.getByLabelText(/page number/i);
    await user.clear(input);
    await user.type(input, "abc{Enter}");

    expect(getPage).not.toHaveBeenCalled();
    expect(input).toHaveValue("1");
  });

  it("visually resets an out-of-range value even when the clamp target is the page already showing", async () => {
    // regression test: React bails out on setCurrentPage(3) if currentPage is already 3, so
    // a fix relying only on the key-based remount (tied to currentPage actually changing)
    // would leave "999" visible in the input despite nothing being out of range anymore.
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    await user.clear(screen.getByLabelText(/page number/i));
    await user.type(screen.getByLabelText(/page number/i), "3{Enter}");
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(3));

    // the input remounts (key={currentPage}) once the page actually changes, so re-query it
    await user.clear(screen.getByLabelText(/page number/i));
    await user.type(screen.getByLabelText(/page number/i), "999{Enter}");

    expect(screen.getByLabelText(/page number/i)).toHaveValue("3");
  });

  it("zooms in and out, re-rendering the page at the new scale", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    expect(screen.getByText("100%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.6 }));
    expect(screen.getByText("114%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /zoom out/i }));
    await user.click(screen.getByRole("button", { name: /zoom out/i }));
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.2 }));
    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("disables zoom out at the minimum scale and zoom in at the maximum", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    for (let i = 0; i < 10; i++) {
      await user.click(screen.getByRole("button", { name: /zoom out/i }));
    }
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /zoom out/i })).toBeDisabled());

    for (let i = 0; i < 15; i++) {
      await user.click(screen.getByRole("button", { name: /zoom in/i }));
    }
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /zoom in/i })).toBeDisabled());
  });

  it("resets zoom to the default when switching to a different document", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    const { rerender } = render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));
    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    await vi.waitFor(() => expect(screen.getByText("114%")).toBeInTheDocument());

    page.getViewport.mockClear();
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    rerender(<PdfViewer fileUrl="http://localhost:4000/documents/2/file" />);

    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("toggles fit-width on and off", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    const fitWidthButton = screen.getByRole("button", { name: /fit width/i });
    expect(fitWidthButton).toHaveAttribute("aria-pressed", "false");

    await user.click(fitWidthButton);
    await vi.waitFor(() => expect(fitWidthButton).toHaveAttribute("aria-pressed", "true"));

    await user.click(fitWidthButton);
    expect(fitWidthButton).toHaveAttribute("aria-pressed", "false");
  });

  it("switches from fit-height to fit-width without both being active", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    await user.click(screen.getByRole("button", { name: /fit height/i }));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /fit height/i })).toHaveAttribute("aria-pressed", "true"));

    await user.click(screen.getByRole("button", { name: /fit width/i }));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /fit width/i })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /fit height/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the active fit mode when manually zooming", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    await user.click(screen.getByRole("button", { name: /fit width/i }));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /fit width/i })).toHaveAttribute("aria-pressed", "true"));

    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getByRole("button", { name: /fit width/i })).toHaveAttribute("aria-pressed", "false");
  });
});
