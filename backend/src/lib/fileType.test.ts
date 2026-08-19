import { describe, expect, it } from "vitest";
import { detectFileType } from "./fileType.js";

describe("detectFileType", () => {
  it("detects a real PDF (.pdf extension + %PDF- magic bytes)", () => {
    const buffer = Buffer.from("%PDF-1.4\n...");
    expect(detectFileType("report.pdf", buffer)).toBe("pdf");
  });

  it("rejects a .pdf-named file whose content isn't actually a PDF (spoofed extension)", () => {
    const buffer = Buffer.from("MZ this is actually an executable");
    expect(detectFileType("report.pdf", buffer)).toBeNull();
  });

  it("detects .html by extension", () => {
    expect(detectFileType("article.html", Buffer.from("<!DOCTYPE html><html></html>"))).toBe("html");
  });

  it("detects .htm by extension", () => {
    expect(detectFileType("article.htm", Buffer.from("<html></html>"))).toBe("html");
  });

  it("returns null for an unsupported extension", () => {
    expect(detectFileType("notes.docx", Buffer.from("anything"))).toBeNull();
  });

  it("returns null for a file with no extension", () => {
    expect(detectFileType("README", Buffer.from("%PDF-1.4"))).toBeNull();
  });

  it("is case-insensitive on the extension", () => {
    expect(detectFileType("REPORT.PDF", Buffer.from("%PDF-1.4"))).toBe("pdf");
  });
});
