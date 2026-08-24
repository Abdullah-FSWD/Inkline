import { createRef, StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";

function mockContext() {
  return {
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    globalAlpha: 1,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  };
}
type MockContext = ReturnType<typeof mockContext>;

// A real canvas returns the SAME context object on every getContext() call for that specific
// element. AnnotationLayer relies on this (main canvas, plus its own offscreen buffer/snapshot
// canvases for semi-transparent tools), so the mock has to key by canvas identity rather than
// return one shared object - otherwise the buffer/snapshot/main canvases would be
// indistinguishable in assertions, and the component's own repeated getContext() calls on the
// same element wouldn't see consistent state either.
let contextsByCanvas: WeakMap<HTMLCanvasElement, MockContext>;

function mockCanvasContexts() {
  contextsByCanvas = new WeakMap();
  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
    if (!contextsByCanvas.has(this)) contextsByCanvas.set(this, mockContext());
    return contextsByCanvas.get(this);
  }) as never;
}

function mainContextOf(canvas: HTMLElement) {
  return contextsByCanvas.get(canvas as HTMLCanvasElement)!;
}

function firePointer(canvas: HTMLElement, type: string, x: number, y: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, { clientX: x, clientY: y, pointerId });
  canvas.dispatchEvent(event);
}

beforeEach(() => {
  // jsdom doesn't implement pointer capture at all
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
  mockCanvasContexts();
});

describe("AnnotationLayer", () => {
  it("renders a canvas sized to the given page dimensions", () => {
    render(<AnnotationLayer pageNumber={3} width={640} height={480} tool="pencil" color="#1c1a17" strokeWidth={2} />);

    const canvas = screen.getByTestId("annotation-layer");
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas).toHaveAttribute("width", "640");
    expect(canvas).toHaveAttribute("height", "480");
    expect(canvas).toHaveAttribute("data-page-number", "3");
  });

  it("draws a line segment on the canvas while dragging", () => {
    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} />);
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 10, 10);
    firePointer(canvas, "pointermove", 20, 15);

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(20, 15);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("draws a continuous multi-segment stroke as the pointer keeps moving", () => {
    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} />);
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointermove", 10, 10);

    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    // the second segment continues from where the first left off, not from the start again
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 5, 5);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 10, 10);
  });

  it("does not draw on pointer move before a pointer down", () => {
    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} />);
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointermove", 20, 15);

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("stops drawing after pointer up, requiring a new pointer down to resume", () => {
    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} />);
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);
    firePointer(canvas, "pointermove", 20, 20);

    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("reports the full ordered point list and style on stroke completion", () => {
    const onStrokeComplete = vi.fn();

    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} onStrokeComplete={onStrokeComplete} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointermove", 10, 10);
    firePointer(canvas, "pointerup", 10, 10);

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    expect(onStrokeComplete).toHaveBeenCalledWith({
      tool: "pencil",
      color: expect.any(String),
      width: expect.any(Number),
      opacity: expect.any(Number),
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
      ],
    });
  });

  it("does not report a stroke for a click with no movement", () => {
    const onStrokeComplete = vi.fn();

    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} onStrokeComplete={onStrokeComplete} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("redraws a stored opaque stroke directly on the main canvas", () => {
    const strokes = [
      {
        id: "s1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#111111",
        width: 3,
        opacity: 1,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      },
    ];

    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} strokes={strokes} />);
    const ctx = mainContextOf(screen.getByTestId("annotation-layer"));

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 1);
    expect(ctx.lineTo).toHaveBeenCalledWith(2, 2);
    expect(ctx.lineTo).toHaveBeenCalledWith(3, 3);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    // an opaque stroke is traced directly - it has no self-overlap risk, so no buffer needed
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("redraws a stored semi-transparent stroke via a single composite, at the stored opacity", () => {
    const strokes = [
      {
        id: "s1",
        pageNumber: 1,
        tool: "highlighter" as const,
        color: "#ffd54a",
        width: 16,
        opacity: 0.4,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 10 },
        ],
      },
    ];

    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} strokes={strokes} />);
    const ctx = mainContextOf(screen.getByTestId("annotation-layer"));

    // composited once via drawImage, not traced directly on the main canvas - that's what
    // lets a self-intersecting stored stroke avoid stacking alpha where it crosses itself.
    expect(ctx.beginPath).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("redraws a stored semi-transparent stroke at the same opacity even if the mount effect runs twice", () => {
    // regression guard: React (StrictMode, dev-only) intentionally double-invokes a mount
    // effect's setup. Redrawing an opaque stroke twice is visually identical either way, but
    // redrawing a semi-transparent one twice silently stacked its alpha (0.4 twice -> ~0.64)
    // until the mount effect started clearing the canvas first.
    const strokes = [
      {
        id: "s1",
        pageNumber: 1,
        tool: "highlighter" as const,
        color: "#ffd54a",
        width: 16,
        opacity: 0.4,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 10 },
        ],
      },
    ];

    render(
      <StrictMode>
        <AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} strokes={strokes} />
      </StrictMode>
    );
    const ctx = mainContextOf(screen.getByTestId("annotation-layer"));

    // StrictMode may run the mount effect's setup more than once (dev-only), so the canvas
    // could legitimately get redrawn more than once - what must never happen is a composite
    // landing on top of a PREVIOUS composite without a clear in between, which is what would
    // silently stack the alpha. Reconstruct call order via vitest's invocationCallOrder
    // rather than assuming a fixed number of invocations.
    const calls = [
      ...ctx.clearRect.mock.invocationCallOrder.map((order) => ({ order, type: "clear" as const })),
      ...ctx.drawImage.mock.invocationCallOrder.map((order) => ({ order, type: "draw" as const })),
    ].sort((a, b) => a.order - b.order);

    expect(calls.some((c) => c.type === "draw")).toBe(true);
    let sinceLastDraw = 0;
    for (const call of calls) {
      if (call.type === "clear") sinceLastDraw++;
      else {
        expect(sinceLastDraw).toBeGreaterThan(0);
        sinceLastDraw = 0;
      }
    }
  });

  it("does not redraw a stroke completed live during the current mount a second time", () => {
    // the stroke is already painted incrementally by the pointer handlers as it's drawn;
    // the `strokes` prop passed back down after onStrokeComplete fires must not trigger a
    // second, redundant draw within the same mount.
    const onStrokeComplete = vi.fn();

    const { rerender } = render(
      <AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} strokes={[]} onStrokeComplete={onStrokeComplete} />
    );
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);

    const strokesAfter = onStrokeComplete.mock.calls[0][0];
    const strokeCallsBefore = ctx.stroke.mock.calls.length;

    rerender(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="pencil" color="#1c1a17" strokeWidth={2}
        strokes={[strokesAfter]}
        onStrokeComplete={onStrokeComplete}
      />
    );

    expect(ctx.stroke.mock.calls.length).toBe(strokeCallsBefore);
  });

  it("starts a fresh point list for each new stroke", () => {
    const onStrokeComplete = vi.fn();

    render(<AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} onStrokeComplete={onStrokeComplete} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);

    firePointer(canvas, "pointerdown", 50, 50);
    firePointer(canvas, "pointermove", 60, 60);
    firePointer(canvas, "pointerup", 60, 60);

    expect(onStrokeComplete).toHaveBeenCalledTimes(2);
    expect(onStrokeComplete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        points: [
          { x: 50, y: 50 },
          { x: 60, y: 60 },
        ],
      })
    );
  });

  it("draws with the highlighter's wider, semi-transparent style when that tool is selected", () => {
    const onStrokeComplete = vi.fn();

    render(
      <AnnotationLayer pageNumber={1} width={100} height={150} tool="highlighter" color="#ffd54a" strokeWidth={16} onStrokeComplete={onStrokeComplete} />
    );
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);

    // live highlighter drawing composites onto the main canvas via drawImage at < 1 opacity,
    // rather than tracing the path directly on it at full alpha.
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);

    const reported = onStrokeComplete.mock.calls[0][0];
    expect(reported.tool).toBe("highlighter");
    expect(reported.opacity).toBeLessThan(1);
    expect(reported.width).toBeGreaterThan(2);
  });

  it("does not stack alpha where a single highlighter stroke crosses itself", () => {
    // regression guard for the self-overlap blending bug: without buffering, each segment of
    // a looped/self-intersecting drag would composite at the tool's opacity independently,
    // making the crossing point visibly darker than the rest of the stroke. The buffered
    // implementation composites the whole accumulated shape once per move, so the composite
    // step's opacity should stay pinned at the tool's own opacity throughout the drag,
    // never drifting from repeated blending.
    const onStrokeComplete = vi.fn();

    render(
      <AnnotationLayer pageNumber={1} width={100} height={150} tool="highlighter" color="#ffd54a" strokeWidth={16} onStrokeComplete={onStrokeComplete} />
    );
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    const alphaAtEachComposite: number[] = [];
    ctx.drawImage.mockImplementation(() => alphaAtEachComposite.push(ctx.globalAlpha));

    // a self-crossing loop: right, down, back left through the same x-range, up again
    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 20, 0);
    firePointer(canvas, "pointermove", 20, 20);
    firePointer(canvas, "pointermove", 0, 20);
    firePointer(canvas, "pointermove", 0, 0);
    firePointer(canvas, "pointermove", 20, 0);
    firePointer(canvas, "pointerup", 20, 0);

    // the buffer composite is drawImage'd every move; the SECOND drawImage per move is the
    // one applying the tool's opacity (the first restores the pre-stroke snapshot at alpha 1).
    const compositeAlphas = alphaAtEachComposite.filter((a) => a < 1);
    expect(compositeAlphas.length).toBeGreaterThan(0);
    expect(new Set(compositeAlphas).size).toBe(1);
    expect(compositeAlphas[0]).toBeCloseTo(0.4);
  });

  it("keeps a stroke on the tool it started with, even if the selected tool changes mid-drag", () => {
    const onStrokeComplete = vi.fn();

    const { rerender } = render(
      <AnnotationLayer pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} onStrokeComplete={onStrokeComplete} />
    );
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 0, 0);
    rerender(
      <AnnotationLayer pageNumber={1} width={100} height={150} tool="highlighter" color="#ffd54a" strokeWidth={16} onStrokeComplete={onStrokeComplete} />
    );
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);

    expect(onStrokeComplete).toHaveBeenCalledWith(expect.objectContaining({ tool: "pencil" }));
  });

  it("draws a straight-line preview from the start point to the current point, replacing itself each move", () => {
    const onStrokeComplete = vi.fn();

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="underline" color="#dc2626" strokeWidth={2.5}
        mode="straight"
        onStrokeComplete={onStrokeComplete}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 10, 0);
    firePointer(canvas, "pointermove", 40, 0);
    firePointer(canvas, "pointerup", 40, 0);

    // every move restores the snapshot (erasing the previous preview) before drawing exactly
    // one fresh segment - never accumulating multiple segments like freehand does.
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 0, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 10, 0);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 0, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 40, 0);

    expect(onStrokeComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "underline",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
        ],
      })
    );
  });

  it("draws underline freehand exactly like pencil when mode is freehand", () => {
    const onStrokeComplete = vi.fn();

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="underline" color="#dc2626" strokeWidth={2.5}
        mode="freehand"
        onStrokeComplete={onStrokeComplete}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointermove", 10, 10);
    firePointer(canvas, "pointerup", 10, 10);

    // freehand accumulates every point rather than replacing a single preview segment.
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(onStrokeComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 10, y: 10 },
        ],
      })
    );
  });

  it("does not report a straight-line stroke for a click with no movement", () => {
    const onStrokeComplete = vi.fn();

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="underline" color="#dc2626" strokeWidth={2.5}
        mode="straight"
        onStrokeComplete={onStrokeComplete}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("erases a stroke the eraser crosses and reports its id", () => {
    const onEraseStroke = vi.fn();
    const strokes = [
      {
        id: "stroke-1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
    ];

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="eraser"
        color="#94a3b8"
        strokeWidth={16}
        strokes={strokes}
        onEraseStroke={onEraseStroke}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");

    // drag straight through the stroke's horizontal line at y=50
    firePointer(canvas, "pointerdown", 20, 50);
    firePointer(canvas, "pointermove", 40, 50);

    expect(onEraseStroke).toHaveBeenCalledWith("stroke-1");
  });

  it("does not erase a stroke the eraser never gets near", () => {
    const onEraseStroke = vi.fn();
    const strokes = [
      {
        id: "stroke-1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
    ];

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="eraser"
        color="#94a3b8"
        strokeWidth={16}
        strokes={strokes}
        onEraseStroke={onEraseStroke}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 90, 140);
    firePointer(canvas, "pointermove", 95, 145);

    expect(onEraseStroke).not.toHaveBeenCalled();
  });

  it("does not report the same stroke twice within one continuous eraser drag", () => {
    const onEraseStroke = vi.fn();
    const strokes = [
      {
        id: "stroke-1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
    ];

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="eraser"
        color="#94a3b8"
        strokeWidth={16}
        strokes={strokes}
        onEraseStroke={onEraseStroke}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");

    // cross the same line twice in one drag (down, up, back down again)
    firePointer(canvas, "pointerdown", 10, 50);
    firePointer(canvas, "pointermove", 20, 50);
    firePointer(canvas, "pointermove", 30, 50);
    firePointer(canvas, "pointermove", 40, 50);

    expect(onEraseStroke).toHaveBeenCalledTimes(1);
  });

  it("redraws immediately from the remaining strokes when one is erased", () => {
    const strokes = [
      {
        id: "erase-me",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
      {
        id: "keep-me",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 0, y: 100 },
          { x: 100, y: 100 },
        ],
      },
    ];

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="eraser"
        color="#94a3b8"
        strokeWidth={16}
        strokes={strokes}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");
    const ctx = mainContextOf(canvas);
    ctx.moveTo.mockClear();

    firePointer(canvas, "pointerdown", 20, 50);

    // the immediate redraw traces only the surviving stroke (y=100), not the erased one
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 100);
    expect(ctx.moveTo).not.toHaveBeenCalledWith(0, 50);
  });

  it("does not create a stroke via onStrokeComplete when erasing", () => {
    const onStrokeComplete = vi.fn();
    const strokes = [
      {
        id: "stroke-1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
    ];

    render(
      <AnnotationLayer
        pageNumber={1}
        width={100}
        height={150}
        tool="eraser"
        color="#94a3b8"
        strokeWidth={16}
        strokes={strokes}
        onStrokeComplete={onStrokeComplete}
      />
    );
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 20, 50);
    firePointer(canvas, "pointermove", 40, 50);
    firePointer(canvas, "pointerup", 40, 50);

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("exposes an imperative redraw handle that repaints from a given stroke list (US-4.5 undo)", () => {
    const ref = createRef<AnnotationLayerHandle>();
    const strokes = [
      {
        id: "s1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    ];

    render(<AnnotationLayer ref={ref} pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} />);
    const ctx = mainContextOf(screen.getByTestId("annotation-layer"));
    ctx.moveTo.mockClear();
    ctx.clearRect.mockClear();

    ref.current?.redraw(strokes);

    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 1);
    expect(ctx.lineTo).toHaveBeenCalledWith(2, 2);
  });

  it("redraw handle repaints with fewer strokes when passed a shorter list (undoing an add)", () => {
    const ref = createRef<AnnotationLayerHandle>();
    const strokes = [
      {
        id: "s1",
        pageNumber: 1,
        tool: "pencil" as const,
        color: "#1c1a17",
        width: 2,
        opacity: 1,
        points: [
          { x: 5, y: 5 },
          { x: 6, y: 6 },
        ],
      },
    ];

    render(
      <AnnotationLayer ref={ref} pageNumber={1} width={100} height={150} tool="pencil" color="#1c1a17" strokeWidth={2} strokes={strokes} />
    );
    const ctx = mainContextOf(screen.getByTestId("annotation-layer"));
    ctx.moveTo.mockClear();

    // simulate undoing the add: redraw with the stroke removed
    ref.current?.redraw([]);

    expect(ctx.moveTo).not.toHaveBeenCalled();
  });
});
