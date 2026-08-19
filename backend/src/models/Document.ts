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
    fileId: { type: Schema.Types.ObjectId, required: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
  },
  { timestamps: true }
);

export type Document = InferSchemaType<typeof documentSchema>;

export const DocumentModel = model("Document", documentSchema);
