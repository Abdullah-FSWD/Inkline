import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnnotationLayer } from "./AnnotationLayer";

function mockContext() {
  return {
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
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
});

describe("AnnotationLayer", () => {
  it("renders a canvas sized to the given page dimensions", () => {
    render(<AnnotationLayer pageNumber={3} width={640} height={480} />);

    const canvas = screen.getByTestId("annotation-layer");
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas).toHaveAttribute("width", "640");
    expect(canvas).toHaveAttribute("height", "480");
    expect(canvas).toHaveAttribute("data-page-number", "3");
  });

  it("draws a line segment on the canvas while dragging", () => {
    const ctx = mockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

    render(<AnnotationLayer pageNumber={1} width={100} height={150} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 10, 10);
    firePointer(canvas, "pointermove", 20, 15);

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(20, 15);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("draws a continuous multi-segment stroke as the pointer keeps moving", () => {
    const ctx = mockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

    render(<AnnotationLayer pageNumber={1} width={100} height={150} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointermove", 10, 10);

    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    // the second segment continues from where the first left off, not from the start again
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 5, 5);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 10, 10);
  });

  it("does not draw on pointer move before a pointer down", () => {
    const ctx = mockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

    render(<AnnotationLayer pageNumber={1} width={100} height={150} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointermove", 20, 15);

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("stops drawing after pointer up, requiring a new pointer down to resume", () => {
    const ctx = mockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

    render(<AnnotationLayer pageNumber={1} width={100} height={150} />);
    const canvas = screen.getByTestId("annotation-layer");

    firePointer(canvas, "pointerdown", 0, 0);
    firePointer(canvas, "pointermove", 5, 5);
    firePointer(canvas, "pointerup", 5, 5);
    firePointer(canvas, "pointermove", 20, 20);

    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});
