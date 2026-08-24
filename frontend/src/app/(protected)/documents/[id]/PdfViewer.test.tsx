import { act, render, screen } from "@testing-library/react";
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
  // jsdom's canvas has no real 2D rendering context by default. AnnotationLayer's mount
  // effect unconditionally calls clearRect (even with zero stored strokes), so it must exist.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ clearRect: vi.fn() }) as never;
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

  it("keeps a drawn stroke and redraws it after navigating away from and back to its page", async () => {
    // AnnotationLayer's own tests cover point-capture and mount-time redrawing in isolation;
    // this confirms PdfViewer's state-lifting wiring (strokesByPage, handleStrokeComplete)
    // actually carries a stroke across the layer's key-based remount on a real page turn.
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 2 }) });
    const user = userEvent.setup();

    const ctx = {
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 100,
      height: 150,
      right: 100,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => {},
    }));
    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    function drag() {
      const canvas = screen.getByTestId("annotation-layer");
      act(() => {
        const down = new Event("pointerdown", { bubbles: true }) as PointerEvent;
        Object.assign(down, { clientX: 0, clientY: 0, pointerId: 1 });
        canvas.dispatchEvent(down);
        const move = new Event("pointermove", { bubbles: true }) as PointerEvent;
        Object.assign(move, { clientX: 10, clientY: 10, pointerId: 1 });
        canvas.dispatchEvent(move);
        const up = new Event("pointerup", { bubbles: true }) as PointerEvent;
        Object.assign(up, { clientX: 10, clientY: 10, pointerId: 1 });
        canvas.dispatchEvent(up);
      });
    }

    drag();
    const strokeCallsAfterDrawing = ctx.stroke.mock.calls.length;
    expect(strokeCallsAfterDrawing).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(2));

    await user.click(screen.getByRole("button", { name: /previous page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    // the page-1 stroke drawn above should reappear on the freshly-remounted overlay,
    // without needing to be drawn again by the user.
    await vi.waitFor(() => expect(ctx.stroke.mock.calls.length).toBeGreaterThan(strokeCallsAfterDrawing));
  });

  it("draws with pencil by default and switches to highlighter when that tool is selected", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    expect(screen.getByRole("radio", { name: /pencil/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /highlighter/i })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("radio", { name: /highlighter/i }));

    expect(screen.getByRole("radio", { name: /highlighter/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /pencil/i })).toHaveAttribute("aria-checked", "false");
  });

  it("only shows the straight/freehand mode toggle when the underline tool is selected", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    expect(screen.queryByRole("radio", { name: /straight line/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /freehand/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /underline/i }));

    expect(screen.getByRole("radio", { name: /straight line/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /freehand/i })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("radio", { name: /freehand/i }));

    expect(screen.getByRole("radio", { name: /freehand/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /straight line/i })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("radio", { name: /^pencil/i }));

    expect(screen.queryByRole("radio", { name: /straight line/i })).not.toBeInTheDocument();
  });

  it("remembers each tool's own color/width choice independently, rather than sharing one setting", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    // pencil's own default color/width
    expect(screen.getByRole("radio", { name: "#1c1a17" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("2")).toBeInTheDocument();

    // pick a different color and widen pencil's stroke
    await user.click(screen.getByRole("radio", { name: "#2563eb" }));
    await user.click(screen.getByRole("button", { name: /increase width/i }));

    expect(screen.getByRole("radio", { name: "#2563eb" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("3")).toBeInTheDocument();

    // switching to highlighter shows ITS OWN default, unaffected by pencil's customization
    await user.click(screen.getByRole("radio", { name: /^highlighter/i }));
    expect(screen.getByRole("radio", { name: "#ffd54a" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("16")).toBeInTheDocument();

    // switching back to pencil recalls pencil's own customized choice, not highlighter's
    await user.click(screen.getByRole("radio", { name: /^pencil/i }));
    expect(screen.getByRole("radio", { name: "#2563eb" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("clamps the width stepper to the current tool's min/max range", async () => {
    getPage.mockResolvedValue(mockPage());
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));

    // pencil starts at width 2, min is 1 - one decrease should reach the floor and disable
    await user.click(screen.getByRole("button", { name: /decrease width/i }));
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decrease width/i })).toBeDisabled();
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

  it("hides its own toolbar when showToolbar is false, without affecting rendering", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 3 }) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" showToolbar={false} />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /zoom in/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/page number/i)).not.toBeInTheDocument();
  });

  it("defaults to showing the toolbar when showToolbar is not passed", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
  });

  it("overlays an annotation layer matching the rendered page's exact pixel dimensions", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 1 }) });

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.4 }));

    const overlay = await screen.findByTestId("annotation-layer");
    expect(overlay).toHaveAttribute("width", "100");
    expect(overlay).toHaveAttribute("height", "150");
    expect(overlay).toHaveAttribute("data-page-number", "1");
  });

  it("remounts the annotation layer (fresh, empty canvas) when the page changes", async () => {
    const page = mockPage();
    getPage.mockResolvedValue(page);
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage, numPages: 2 }) });
    const user = userEvent.setup();

    render(<PdfViewer fileUrl="http://localhost:4000/documents/1/file" />);
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    const firstOverlay = await screen.findByTestId("annotation-layer");
    expect(firstOverlay).toHaveAttribute("data-page-number", "1");

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledWith(2));

    const secondOverlay = await screen.findByTestId("annotation-layer");
    expect(secondOverlay).toHaveAttribute("data-page-number", "2");
    expect(secondOverlay).not.toBe(firstOverlay);
  });
});
