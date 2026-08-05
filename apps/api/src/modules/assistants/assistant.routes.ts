import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";
import { randomToken, sha256 } from "../../lib/security.js";
import { generateReply } from "../ai/ai.service.js";
import { chunkText, extractText } from "./document.service.js";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

const uploadDir = path.resolve(process.cwd(), "uploads");
await fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "text/markdown"
    ];
    cb(null, allowed.includes(file.mimetype) || /\.(pdf|docx|txt|csv|md)$/i.test(file.originalname));
  }
});

function slugify(value: string) {
  return value.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || `assistant-${Date.now()}`;
}

assistantRouter.get("/", async (req: AuthRequest, res) => {
  const items = await prisma.assistant.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { knowledgeBases: true, faqItems: true, apiKeys: true } },
      widget: true
    }
  });
  res.json(items);
});

assistantRouter.post("/", async (req: AuthRequest, res) => {
  const body = z.object({
    name: z.string().min(2).max(80),
    description: z.string().max(500).optional(),
    language: z.string().default("ar"),
    systemPrompt: z.string().min(10).max(20000).optional()
  }).parse(req.body);

  const plan = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { plan: true }
  });
  const count = await prisma.assistant.count({ where: { userId: req.auth!.userId } });
  const limit = plan?.plan?.assistantLimit ?? 1;
  if (count >= limit && plan?.role === "USER") {
    return res.status(402).json({ error: "وصلت إلى الحد الأقصى للمساعدين في باقتك" });
  }

  let slug = slugify(body.name);
  if (await prisma.assistant.findUnique({ where: { slug } })) {
    slug += `-${crypto.randomBytes(3).toString("hex")}`;
  }

  const assistant = await prisma.assistant.create({
    data: {
      userId: req.auth!.userId,
      name: body.name,
      slug,
      description: body.description,
      language: body.language,
      systemPrompt: body.systemPrompt || "أنت مساعد ذكي مفيد. اعتمد على قاعدة المعرفة المتاحة ولا تخترع معلومات."
    }
  });

  await prisma.knowledgeBase.create({
    data: { assistantId: assistant.id, name: "قاعدة المعرفة الرئيسية" }
  });

  await prisma.assistantWidget.create({
    data: { assistantId: assistant.id }
  });

  res.status(201).json(assistant);
});

assistantRouter.get("/:id", async (req: AuthRequest, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId },
    include: {
      knowledgeBases: { include: { documents: true, webSources: true } },
      faqItems: { orderBy: { sortOrder: "asc" } },
      widget: true,
      apiKeys: { select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } }
    }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });
  res.json(assistant);
});

assistantRouter.put("/:id", async (req: AuthRequest, res) => {
  const existing = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  if (!existing) return res.status(404).json({ error: "المساعد غير موجود" });

  const body = z.object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    language: z.string().optional(),
    providerId: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    systemPrompt: z.string().min(10).max(20000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(128).max(16000).optional(),
    fallbackMessage: z.string().max(1000).optional()
  }).parse(req.body);

  res.json(await prisma.assistant.update({ where: { id: existing.id }, data: body }));
});

assistantRouter.post("/:id/publish", async (req: AuthRequest, res) => {
  const existing = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  if (!existing) return res.status(404).json({ error: "المساعد غير موجود" });

  const assistant = await prisma.assistant.update({
    where: { id: existing.id },
    data: { status: "PUBLISHED", publishedAt: new Date() }
  });
  res.json(assistant);
});

assistantRouter.delete("/:id", async (req: AuthRequest, res) => {
  await prisma.assistant.deleteMany({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  res.json({ ok: true });
});

assistantRouter.post("/:id/documents", upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "الملف مطلوب" });

  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId },
    include: { knowledgeBases: true }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });

  const kb = assistant.knowledgeBases[0] || await prisma.knowledgeBase.create({
    data: { assistantId: assistant.id, name: "قاعدة المعرفة الرئيسية" }
  });

  const document = await prisma.document.create({
    data: {
      knowledgeBaseId: kb.id,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: req.file.path,
      status: "PROCESSING"
    }
  });

  try {
    const text = await extractText(req.file.path, req.file.mimetype, req.file.originalname);
    const chunks = chunkText(text);
    await prisma.$transaction([
      prisma.document.update({
        where: { id: document.id },
        data: { extractedText: text, status: "READY" }
      }),
      ...chunks.map((content, index) => prisma.documentChunk.create({
        data: { documentId: document.id, chunkIndex: index, content }
      }))
    ]);
    res.status(201).json({ id: document.id, chunks: chunks.length, status: "READY" });
  } catch (error: any) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "FAILED", errorMessage: error.message }
    });
    res.status(500).json({ error: "فشل تحليل الملف" });
  }
});

assistantRouter.delete("/:assistantId/documents/:documentId", async (req: AuthRequest, res) => {
  const doc = await prisma.document.findFirst({
    where: {
      id: String(req.params.documentId),
      knowledgeBase: { assistant: { id: String(req.params.assistantId), userId: req.auth!.userId } }
    }
  });
  if (!doc) return res.status(404).json({ error: "الملف غير موجود" });
  await prisma.document.delete({ where: { id: doc.id } });
  if (doc.storagePath) await fs.unlink(doc.storagePath).catch(() => {});
  res.json({ ok: true });
});

assistantRouter.post("/:id/faqs", async (req: AuthRequest, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });

  const body = z.object({
    question: z.string().min(2).max(1000),
    answer: z.string().min(2).max(10000)
  }).parse(req.body);

  res.status(201).json(await prisma.faqItem.create({
    data: { assistantId: assistant.id, question: body.question, answer: body.answer }
  }));
});

assistantRouter.delete("/:assistantId/faqs/:faqId", async (req: AuthRequest, res) => {
  await prisma.faqItem.deleteMany({
    where: {
      id: String(req.params.faqId),
      assistant: { id: String(req.params.assistantId), userId: req.auth!.userId }
    }
  });
  res.json({ ok: true });
});

assistantRouter.post("/:id/api-keys", async (req: AuthRequest, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });

  const name = z.string().min(2).max(80).parse(req.body?.name);
  const raw = `nx_${randomToken(24)}`;
  const item = await prisma.assistantApiKey.create({
    data: {
      assistantId: assistant.id,
      name,
      keyPrefix: raw.slice(0, 10),
      keyHash: sha256(raw)
    }
  });

  res.status(201).json({ id: item.id, apiKey: raw, warning: "انسخ المفتاح الآن؛ لن يظهر مرة ثانية." });
});

assistantRouter.delete("/:assistantId/api-keys/:keyId", async (req: AuthRequest, res) => {
  await prisma.assistantApiKey.updateMany({
    where: {
      id: String(req.params.keyId),
      assistant: { id: String(req.params.assistantId), userId: req.auth!.userId }
    },
    data: { revokedAt: new Date() }
  });
  res.json({ ok: true });
});

assistantRouter.put("/:id/widget", async (req: AuthRequest, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });

  const body = z.object({
    enabled: z.boolean().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    position: z.enum(["bottom-right", "bottom-left"]).optional(),
    welcomeMessage: z.string().max(500).optional(),
    allowedDomains: z.array(z.string()).optional()
  }).parse(req.body);

  res.json(await prisma.assistantWidget.upsert({
    where: { assistantId: assistant.id },
    update: body,
    create: { assistantId: assistant.id, ...body }
  }));
});

async function getContext(assistantId: string, question: string) {
  const words = question.toLowerCase().split(/\s+/).filter(x => x.length > 2).slice(0, 12);
  const chunks = await prisma.documentChunk.findMany({
    where: { document: { knowledgeBase: { assistantId } } },
    take: 120
  });

  const scored = chunks.map(c => ({
    content: c.content,
    score: words.reduce((sum, word) => sum + (c.content.toLowerCase().includes(word) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score).slice(0, 6).filter(x => x.score > 0);

  const faqs = await prisma.faqItem.findMany({
    where: { assistantId, enabled: true },
    take: 100
  });

  const faqMatches = faqs.map(f => ({
    content: `سؤال: ${f.question}\nجواب: ${f.answer}`,
    score: words.reduce((sum, word) => sum + ((f.question + " " + f.answer).toLowerCase().includes(word) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score).slice(0, 4).filter(x => x.score > 0);

  return [...faqMatches, ...scored].map(x => x.content).join("\n\n---\n\n");
}

assistantRouter.post("/:id/test-chat", async (req: AuthRequest, res) => {
  const body = z.object({
    message: z.string().min(1).max(12000),
    sessionKey: z.string().optional()
  }).parse(req.body);

  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });

  const sessionKey = body.sessionKey || randomToken(12);
  let conversation = await prisma.assistantConversation.findFirst({
    where: { assistantId: assistant.id, sessionKey }
  });
  if (!conversation) {
    conversation = await prisma.assistantConversation.create({
      data: { assistantId: assistant.id, sessionKey }
    });
  }

  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: "user", content: body.message }
  });

  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 16
  });

  const context = await getContext(assistant.id, body.message);
  const prompt = [
    assistant.systemPrompt,
    context ? `قاعدة المعرفة:\n${context}` : "",
    `إذا لم تجد الإجابة في قاعدة المعرفة، قل: ${assistant.fallbackMessage}`
  ].filter(Boolean).join("\n\n");

  const reply = await generateReply([
    { role: "user", content: prompt },
    ...history.map(m => ({ role: m.role, content: m.content }))
  ]);

  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: "assistant", content: reply }
  });

  res.json({ sessionKey, reply });
});
