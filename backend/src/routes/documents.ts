import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { DocumentModel } from "../models/Document.js";
import { uploadFile } from "../lib/gridfs.js";

const upload = multer({ storage: multer.memoryStorage() });

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "A file is required." });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== ".pdf") {
    res.status(400).json({ error: "Only PDF files are supported right now." });
    return;
  }

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
