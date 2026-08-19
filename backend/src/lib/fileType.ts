import path from "node:path";

export type DetectedFileType = "pdf" | "html" | null;

const PDF_MAGIC = Buffer.from("%PDF-");
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

// Extension and declared MIME type are both client-supplied and trivially spoofable
// (renaming a .exe to report.pdf, or setting an arbitrary Content-Type), so PDF
// acceptance also requires the file's actual magic bytes to match. HTML has no
// reliable magic number to sniff, so extension is the practical signal there.
export function detectFileType(originalFilename: string, buffer: Buffer): DetectedFileType {
  const ext = path.extname(originalFilename).toLowerCase();

  if (ext === ".pdf") {
    const looksLikePdf = buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
    return looksLikePdf ? "pdf" : null;
  }

  if (HTML_EXTENSIONS.has(ext)) {
    return "html";
  }

  return null;
}
