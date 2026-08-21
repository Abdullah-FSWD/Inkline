import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnnotationLayer } from "./AnnotationLayer";

describe("AnnotationLayer", () => {
  it("renders a canvas sized to the given page dimensions", () => {
    render(<AnnotationLayer pageNumber={3} width={640} height={480} />);

    const canvas = screen.getByTestId("annotation-layer");
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas).toHaveAttribute("width", "640");
    expect(canvas).toHaveAttribute("height", "480");
    expect(canvas).toHaveAttribute("data-page-number", "3");
  });
});
