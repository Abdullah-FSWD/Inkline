import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { DocumentModel } from "../models/Document.js";
import { AnnotationModel, ANNOTATION_TOOLS } from "../models/Annotation.js";
import { uploadFile, deleteFile, openDownloadStream } from "../lib/gridfs.js";
import { detectFileType } from "../lib/fileType.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB - memoryStorage buffers the whole file in RAM

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.get("/", async (req, res) => {
  const documents = await DocumentModel.find({ ownerId: req.userId }).sort({ updatedAt: -1 });

  res.status(200).json(
    documents.map((document) => ({
      id: document._id.toString(),
      title: document.title,
      sourceType: document.sourceType,
      status: document.status,
      updatedAt: document.updatedAt,
      createdAt: document.createdAt,
    }))
  );
});

documentsRouter.get("/:id", async (req, res) => {
  // an invalid ObjectId string makes Mongoose reject the query rather than just returning
  // no results, so this treats "not a valid id" and "not found" the same way: 404, not 500.
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  res.status(200).json({
    id: document._id.toString(),
    title: document.title,
    sourceType: document.sourceType,
    status: document.status,
    lastReadPage: document.lastReadPage,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
  });
});

documentsRouter.patch("/:id/position", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  const page = req.body?.page;
  if (!Number.isInteger(page) || page < 1) {
    res.status(400).json({ error: "page must be a positive integer." });
    return;
  }

  document.lastReadPage = page;
  // reading position is a lightweight, frequently-updated preference, not meaningful content -
  // bumping updatedAt (and so the library's "recently updated" sort order) on every page turn
  // would be surprising, so skip Mongoose's automatic timestamp update for this one write.
  await document.save({ timestamps: false });

  res.status(204).send();
});

documentsRouter.get("/:id/file", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  if (document.status !== "ready") {
    res.status(409).json({ error: "Document is not ready." });
    return;
  }

  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");

  const downloadStream = openDownloadStream(document.fileId);
  downloadStream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ error: "File not found." });
  });
  downloadStream.pipe(res);
});

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPoints(value: unknown): value is { x: number; y: number }[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((p) => typeof p === "object" && p !== null && isFiniteNumber(p.x) && isFiniteNumber(p.y))
  );
}

// mirrors the client's own StrokeData shape (annotations.ts) - kept intentionally permissive
// beyond type/range checks, since color is free-form (any CSS color the picker offers, not a
// fixed enum) and tool-specific width/opacity conventions belong to the client, not this API.
function validateAnnotationInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Request body is required.";
  const b = body as Record<string, unknown>;

  if (!Number.isInteger(b.pageNumber) || (b.pageNumber as number) < 1) return "pageNumber must be a positive integer.";
  if (typeof b.tool !== "string" || !ANNOTATION_TOOLS.includes(b.tool as (typeof ANNOTATION_TOOLS)[number]))
    return `tool must be one of: ${ANNOTATION_TOOLS.join(", ")}.`;
  if (typeof b.color !== "string" || b.color.length === 0) return "color is required.";
  if (!isFiniteNumber(b.width) || (b.width as number) <= 0) return "width must be a positive number.";
  if (!isFiniteNumber(b.opacity) || (b.opacity as number) < 0 || (b.opacity as number) > 1) return "opacity must be between 0 and 1.";
  if (!isValidPoints(b.points)) return "points must be an array of at least 2 {x, y} numeric coordinates.";

  return null;
}

function toAnnotationResponse(annotation: {
  _id: unknown;
  pageNumber: number;
  tool: string;
  color: string;
  width: number;
  opacity: number;
  points: { x: number; y: number }[];
}) {
  return {
    id: (annotation._id as { toString(): string }).toString(),
    pageNumber: annotation.pageNumber,
    tool: annotation.tool,
    color: annotation.color,
    width: annotation.width,
    opacity: annotation.opacity,
    points: annotation.points.map((p) => ({ x: p.x, y: p.y })),
  };
}

documentsRouter.get("/:id/annotations", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  const annotations = await AnnotationModel.find({ documentId: document._id }).sort({ createdAt: 1 });
  res.status(200).json(annotations.map(toAnnotationResponse));
});

documentsRouter.post("/:id/annotations", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  const validationError = validateAnnotationInput(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const { pageNumber, tool, color, width, opacity, points } = req.body;
  const annotation = await AnnotationModel.create({
    documentId: document._id,
    ownerId: req.userId,
    pageNumber,
    tool,
    color,
    width,
    opacity,
    points,
  });

  res.status(201).json(toAnnotationResponse(annotation));
});

documentsRouter.delete("/:id/annotations/:annotationId", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  // scoping by documentId (not just annotationId + ownerId) also 404s an annotationId that's
  // real but belongs to a different document than the one named in the URL.
  const annotation = await AnnotationModel.findOneAndDelete({
    _id: req.params.annotationId,
    documentId: document._id,
    ownerId: req.userId,
  }).catch(() => null);

  if (!annotation) {
    res.status(404).json({ error: "Annotation not found." });
    return;
  }

  res.status(204).send();
});

documentsRouter.delete("/:id", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  // No Page records exist yet (Stage 6) - once they do, cascade their deletion here too.
  await AnnotationModel.deleteMany({ documentId: document._id });
  await deleteFile(document.fileId);
  await document.deleteOne();

  res.status(204).send();
});

documentsRouter.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "A file is required." });
    return;
  }

  const detectedType = detectFileType(req.file.originalname, req.file.buffer);

  if (detectedType === "html") {
    // HTML-to-PDF conversion is built in Stage 6 (US-1.3/1.4); until then this path is
    // recognized and rejected explicitly rather than lumped in with "unsupported", so the
    // eventual conversion queueing just replaces this branch's body.
    res.status(400).json({ error: "HTML upload support is coming soon. Please upload a PDF for now." });
    return;
  }

  if (detectedType !== "pdf") {
    res.status(400).json({ error: "Unsupported file type. Only PDF files are supported right now." });
    return;
  }

  const ext = path.extname(req.file.originalname);
  const fileId = await uploadFile(req.file.originalname, req.file.mimetype, req.file.buffer);

  const document = await DocumentModel.create({
    ownerId: req.userId,
    title: path.basename(req.file.originalname, ext),
    sourceType: "pdf",
    status: "ready",
    fileId,
    originalFilename: req.file.originalname,
    mimeType: req.file.mimetype,
  });

  res.status(201).json({
    id: document._id.toString(),
    title: document.title,
    sourceType: document.sourceType,
    status: document.status,
    createdAt: document.createdAt,
  });
});
