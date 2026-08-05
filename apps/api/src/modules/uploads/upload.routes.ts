import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import os from "os";
import crypto from "crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";

const uploadDir = path.join(os.tmpdir(), "nexora-uploads");
await fs.mkdir(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/ogg",
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).slice(0, 12);
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: 6,
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error(`نوع الملف غير مدعوم: ${file.mimetype}`));
    }
    callback(null, true);
  }
});

async function extractText(file: Express.Multer.File): Promise<string | null> {
  try {
    if (
      file.mimetype === "text/plain" ||
      file.mimetype === "text/markdown" ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/json"
    ) {
      return (await fs.readFile(file.path, "utf8")).slice(0, 120_000);
    }

    if (file.mimetype === "application/pdf") {
      const parsed = await pdfParse(await fs.readFile(file.path));
      return parsed.text?.slice(0, 120_000) || null;
    }

    if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const parsed = await mammoth.extractRawText({ path: file.path });
      return parsed.value?.slice(0, 120_000) || null;
    }

    return null;
  } catch (error) {
    console.error("Attachment text extraction failed", error);
    return null;
  }
}

export const uploadRouter = Router();

uploadRouter.post(
  "/",
  requireAuth,
  upload.array("files", 6),
  async (req: AuthRequest, res) => {
    const files = (req.files || []) as Express.Multer.File[];

    if (!files.length) {
      return res.status(400).json({ error: "لم يتم اختيار أي ملف" });
    }

    const rows = [];

    for (const file of files) {
      const extractedText = await extractText(file);

      const row = await prisma.chatAttachment.create({
        data: {
          userId: req.auth!.userId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: file.path,
          extractedText,
          status: "READY"
        }
      });

      rows.push({
        id: row.id,
        name: row.originalName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        status: row.status
      });
    }

    res.status(201).json(rows);
  }
);
