import { Router } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import crypto from "crypto";
import fs from "fs/promises";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { sendMail } from "../../lib/mailer.js";
import { AuthRequest, requireAdmin, requireAuth } from "../../middleware/auth.js";

const uploadDir = path.join(os.tmpdir(), "nexora-onboarding");
await fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).slice(0, 12)}`)
  }),
  limits: { files: 8, fileSize: 25 * 1024 * 1024 }
});

const publicRequestSchema = z.object({
  fullName: z.string().min(2).max(120),
  companyName: z.string().min(2).max(160),
  email: z.string().email(),
  phone: z.string().max(50).optional().or(z.literal("")),
  websiteUrl: z.string().url(),
  assistantName: z.string().min(2).max(120),
  businessDescription: z.string().min(20).max(6000),
  language: z.string().min(2).max(30).default("ar"),
  channelPreference: z.enum(["SITE", "EMAIL", "BOTH"]).default("BOTH")
});

function publicView(row: any) {
  return {
    id: row.id,
    fullName: row.fullName,
    companyName: row.companyName,
    email: row.email,
    websiteUrl: row.websiteUrl,
    assistantName: row.assistantName,
    status: row.status,
    assistantPublicKey: row.assistantPublicKey,
    embedCode: row.embedCode,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    messages: row.messages,
    files: row.files?.map((file: any) => ({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes })) || []
  };
}

async function loadPublicRequest(id: string, token: string) {
  return prisma.onboardingRequest.findFirst({
    where: { id, publicToken: token },
    include: { messages: { orderBy: { createdAt: "asc" } }, files: { orderBy: { createdAt: "asc" } } }
  });
}

export const onboardingRouter = Router();

onboardingRouter.post("/requests", upload.array("files", 8), async (req, res) => {
  const body = publicRequestSchema.parse(req.body);
  const files = (req.files || []) as Express.Multer.File[];
  const row = await prisma.onboardingRequest.create({
    data: {
      fullName: body.fullName,
      companyName: body.companyName,
      email: body.email,
      phone: body.phone || null,
      websiteUrl: body.websiteUrl,
      assistantName: body.assistantName,
      businessDescription: body.businessDescription,
      language: body.language,
      channelPreference: body.channelPreference,
      messages: {
        create: {
          sender: "SYSTEM",
          content: "تم استلام طلب إعداد المساعد. سيقوم موظف الدعم بمراجعة البيانات والتواصل معك هنا أو عبر البريد الإلكتروني."
        }
      },
      files: {
        create: files.map(file => ({
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: file.path
        }))
      }
    },
    include: { messages: { orderBy: { createdAt: "asc" } }, files: true }
  });

  await sendMail({
    to: row.email,
    subject: `تم استلام طلب المساعد ${row.assistantName}`,
    html: `<div dir="rtl"><h2>مرحبًا ${row.fullName}</h2><p>تم استلام طلب إعداد المساعد الخاص بشركة <b>${row.companyName}</b>.</p><p>رقم الطلب: <b>${row.id}</b></p><p>يمكنك متابعة الطلب والرد على موظف الدعم من صفحة الطلب في نكسورا.</p></div>`
  }).catch(error => console.error("Onboarding confirmation mail failed", error));

  res.status(201).json({ request: publicView(row), token: row.publicToken });
});

onboardingRouter.get("/requests/:id", async (req, res) => {
  const token = String(req.query.token || req.headers["x-onboarding-token"] || "");
  const row = await loadPublicRequest(String(req.params.id), token);
  if (!row) return res.status(404).json({ error: "الطلب غير موجود أو رابط المتابعة غير صالح" });
  res.setHeader("Cache-Control", "no-store");
  res.json(publicView(row));
});

onboardingRouter.post("/requests/:id/messages", async (req, res) => {
  const token = String(req.body?.token || req.headers["x-onboarding-token"] || "");
  const content = z.string().min(1).max(5000).parse(req.body?.content);
  const row = await loadPublicRequest(String(req.params.id), token);
  if (!row) return res.status(404).json({ error: "الطلب غير موجود أو رابط المتابعة غير صالح" });
  await prisma.$transaction([
    prisma.onboardingMessage.create({ data: { requestId: row.id, sender: "CUSTOMER", content } }),
    prisma.onboardingRequest.update({ where: { id: row.id }, data: { lastMessageAt: new Date(), status: row.status === "NEEDS_INFO" ? "IN_PROGRESS" : row.status } })
  ]);
  res.status(201).json({ ok: true });
});

onboardingRouter.get("/admin/requests", requireAuth, requireAdmin, async (_req, res) => {
  const rows = await prisma.onboardingRequest.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: { _count: { select: { messages: true, files: true } } }
  });
  res.json(rows);
});

onboardingRouter.get("/admin/requests/:id", requireAuth, requireAdmin, async (req, res) => {
  const row = await prisma.onboardingRequest.findUnique({
    where: { id: String(req.params.id) },
    include: { messages: { orderBy: { createdAt: "asc" } }, files: { orderBy: { createdAt: "asc" } } }
  });
  if (!row) return res.status(404).json({ error: "الطلب غير موجود" });
  res.json(row);
});

onboardingRouter.post("/admin/requests/:id/messages", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const content = z.string().min(1).max(5000).parse(req.body?.content);
  const row = await prisma.onboardingRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!row) return res.status(404).json({ error: "الطلب غير موجود" });
  await prisma.$transaction([
    prisma.onboardingMessage.create({ data: { requestId: row.id, sender: "SUPPORT", content } }),
    prisma.onboardingRequest.update({ where: { id: row.id }, data: { lastMessageAt: new Date(), assignedToId: req.auth!.userId } })
  ]);
  if (["EMAIL", "BOTH"].includes(row.channelPreference)) {
    await sendMail({
      to: row.email,
      subject: `رد جديد على طلب المساعد ${row.assistantName}`,
      html: `<div dir="rtl"><h3>لديك رد جديد من فريق نكسورا</h3><p>${content.replace(/\n/g, "<br>")}</p><p>رقم الطلب: <b>${row.id}</b></p></div>`
    }).catch(error => console.error("Onboarding reply mail failed", error));
  }
  res.status(201).json({ ok: true });
});

onboardingRouter.patch("/admin/requests/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const body = z.object({
    status: z.enum(["PENDING_REVIEW", "NEEDS_INFO", "IN_PROGRESS", "READY_FOR_TEST", "ACTIVE", "REJECTED", "CLOSED"]).optional(),
    assistantPublicKey: z.string().max(200).nullable().optional(),
    embedCode: z.string().max(4000).nullable().optional(),
    notes: z.string().max(10000).nullable().optional()
  }).parse(req.body);
  const row = await prisma.onboardingRequest.update({
    where: { id: String(req.params.id) },
    data: { ...body, assignedToId: req.auth!.userId }
  });
  if (body.status || body.embedCode) {
    await sendMail({
      to: row.email,
      subject: `تحديث حالة طلب المساعد: ${row.assistantName}`,
      html: `<div dir="rtl"><p>تم تحديث حالة طلبك إلى: <b>${row.status}</b></p>${row.embedCode ? `<p>كود التثبيت جاهز داخل صفحة الطلب.</p>` : ""}</div>`
    }).catch(error => console.error("Onboarding status mail failed", error));
  }
  res.json(row);
});

onboardingRouter.get("/admin/files/:id", requireAuth, requireAdmin, async (req, res) => {
  const file = await prisma.onboardingFile.findUnique({ where: { id: String(req.params.id) } });
  if (!file) return res.status(404).json({ error: "الملف غير موجود" });
  try { await fs.access(file.storagePath); } catch { return res.status(410).json({ error: "الملف غير متوفر على التخزين" }); }
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.sendFile(file.storagePath);
});
