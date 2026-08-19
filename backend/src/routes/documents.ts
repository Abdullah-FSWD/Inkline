import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { DocumentModel } from "../models/Document.js";
import { uploadFile, deleteFile } from "../lib/gridfs.js";
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
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
  });
});

documentsRouter.delete("/:id", async (req, res) => {
  const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).catch(() => null);

  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  // No Page/Annotation records exist yet (Stage 3/4/6) - once they do, cascade their
  // deletion here too. For now this cascades to the one other thing a document owns:
  // its file in GridFS.
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
