import type { Types } from "mongoose";
import { DocumentModel } from "../models/Document.js";
import { uploadFile, deleteFile } from "./gridfs.js";
import { convertHtmlToPdf } from "./htmlToPdf.js";

// Runs after the upload response has already been sent (US-1.3's "async job") - converts the
// HTML document that was stored as-is at upload time into a PDF, then swaps the Document's
// file/mimeType/status over to it. On failure the original HTML file is left in place and
// status becomes "failed"; the reader never serves anything for a non-"ready" document
// regardless, so there's no need to touch fileId in that case (and doing so would require
// making it nullable in the schema).
export async function convertAndStoreHtml(documentId: Types.ObjectId, htmlBuffer: Buffer): Promise<void> {
  try {
    const pdfBuffer = await convertHtmlToPdf(htmlBuffer);
    const newFileId = await uploadFile(`${documentId.toString()}.pdf`, "application/pdf", pdfBuffer);

    const document = await DocumentModel.findById(documentId);
    if (!document) {
      // deleted (or its owner's account was) while conversion was still running - nothing
      // left to update, just clean up the file this job itself created.
      await deleteFile(newFileId);
      return;
    }

    const oldFileId = document.fileId;
    document.fileId = newFileId;
    document.mimeType = "application/pdf";
    document.status = "ready";
    await document.save();

    await deleteFile(oldFileId);
  } catch (err) {
    console.error("HTML to PDF conversion failed", err);
    await DocumentModel.updateOne({ _id: documentId }, { $set: { status: "failed" } }).catch(() => {});
  }
}
