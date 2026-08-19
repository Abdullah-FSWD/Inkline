import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { DocumentModel } from "../models/Document.js";
import { uploadFile } from "../lib/gridfs.js";
import { detectFileType } from "../lib/fileType.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB - memoryStorage buffers the whole file in RAM

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

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
