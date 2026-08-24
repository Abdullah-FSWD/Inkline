import { Schema, model, type InferSchemaType } from "mongoose";

export const DOCUMENT_SOURCE_TYPES = ["html", "pdf"] as const;
export const DOCUMENT_STATUSES = ["processing", "ready", "failed"] as const;

const documentSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    sourceType: { type: String, enum: DOCUMENT_SOURCE_TYPES, required: true },
    status: { type: String, enum: DOCUMENT_STATUSES, default: "processing" },
    pageCount: { type: Number, default: 0 },
    // last page the owner had open (US-5.1) - reopening the document resumes here instead of
    // always starting at page 1. Not scoped per-user since a Document already belongs to
    // exactly one user; no separate reading-position resource needed for that reason.
    lastReadPage: { type: Number, default: 1, min: 1 },
    fileId: { type: Schema.Types.ObjectId, required: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
  },
  { timestamps: true }
);

export type Document = InferSchemaType<typeof documentSchema>;

export const DocumentModel = model("Document", documentSchema);
