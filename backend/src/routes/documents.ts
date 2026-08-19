import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";

const upload = multer({ storage: multer.memoryStorage() });

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "A file is required." });
    return;
  }

  res.status(201).json({
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});
