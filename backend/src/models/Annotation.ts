import { Schema, model, type InferSchemaType } from "mongoose";

export const ANNOTATION_TOOLS = ["pencil", "highlighter", "underline", "eraser"] as const;

const pointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

const annotationSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pageNumber: { type: Number, required: true, min: 1 },
    tool: { type: String, enum: ANNOTATION_TOOLS, required: true },
    color: { type: String, required: true },
    width: { type: Number, required: true, min: 0 },
    opacity: { type: Number, required: true, min: 0, max: 1 },
    // a stroke with fewer than 2 points has no line to draw - mirrors the same "no-drag click
    // isn't a stroke" rule already enforced client-side in AnnotationLayer.
    points: {
      type: [pointSchema],
      required: true,
      validate: { validator: (points: unknown[]) => points.length >= 2, message: "A stroke needs at least 2 points." },
    },
  },
  { timestamps: true }
);

annotationSchema.index({ documentId: 1, pageNumber: 1 });

export type Annotation = InferSchemaType<typeof annotationSchema>;

export const AnnotationModel = model("Annotation", annotationSchema);
