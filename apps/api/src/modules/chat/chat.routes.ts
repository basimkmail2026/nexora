import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";
import { generateReply } from "../ai/ai.service.js";
import { buildPlatformContext, buildUserMemoryContext } from "../knowledge/platform-knowledge.service.js";

export const chatRouter = Router();

chatRouter.get("/conversations", requireAuth, async (req: AuthRequest, res) => {
  res.json(await prisma.conversation.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, createdAt: true, updatedAt: true,
      _count: { select: { attachments: true, messages: true } }
    }
  }));
});

chatRouter.get("/conversations/:id", requireAuth, async (req: AuthRequest, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), userId: req.auth!.userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true } }
    }
  });
  if (!conversation) return res.status(404).json({ error: "المحادثة غير موجودة" });
  res.json(conversation);
});

chatRouter.delete("/conversations/:id", requireAuth, async (req: AuthRequest, res) => {
  await prisma.conversation.deleteMany({ where: { id: String(req.params.id), userId: req.auth!.userId } });
  res.json({ ok: true });
});

chatRouter.get("/memory", requireAuth, async (req: AuthRequest, res) => {
  res.json(await prisma.userMemory.findMany({
    where: { userId: req.auth!.userId, active: true },
    orderBy: { updatedAt: "desc" }
  }));
});

chatRouter.delete("/memory/:id", requireAuth, async (req: AuthRequest, res) => {
  await prisma.userMemory.deleteMany({ where: { id: String(req.params.id), userId: req.auth!.userId } });
  res.json({ ok: true });
});

async function rememberExplicitFact(userId: string, message: string) {
  const patterns = [
    { key: "name", category: "profile", regex: /(?:اسمي|أنا اسمي|my name is)\s+([\p{L}][\p{L}\s]{1,50})/iu },
    { key: "company", category: "work", regex: /(?:شركتي|اسم شركتي|my company is)\s+([^\n,.]{2,80})/iu },
    { key: "preferred_language", category: "preference", regex: /(?:احكي معي|رد علي|speak to me)\s+(?:باللغة\s+)?([^\n,.]{2,30})/iu }
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match?.[1]) {
      await prisma.userMemory.upsert({
        where: { userId_key: { userId, key: pattern.key } },
        update: { value: match[1].trim(), category: pattern.category, confidence: 0.95, active: true },
        create: { userId, key: pattern.key, value: match[1].trim(), category: pattern.category, confidence: 0.95 }
      });
    }
  }
}

chatRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const body = z.object({
    message: z.string().min(1).max(12000),
    conversationId: z.string().optional(),
    attachmentIds: z.array(z.string()).max(6).default([]),
    locale: z.string().max(20).default("ar")
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, include: { plan: true, preference: true } });
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  const limit = user.plan?.messageLimit ?? 50;
  if (user.usageCount >= limit && user.role === "USER") return res.status(402).json({ error: "وصلت إلى حد الخطة الحالية" });

  let conversationId = body.conversationId;
  if (!conversationId) {
    conversationId = (await prisma.conversation.create({ data: { userId: user.id, title: body.message.slice(0, 60) } })).id;
  }

  if (body.attachmentIds.length) {
    await prisma.chatAttachment.updateMany({
      where: { id: { in: body.attachmentIds }, userId: user.id, conversationId: null },
      data: { conversationId }
    });
  }

  await prisma.message.create({ data: { conversationId, role: "user", content: body.message } });
  const [history, attachments, platformContext, memoryContext] = await Promise.all([
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 24 }),
    prisma.chatAttachment.findMany({ where: { id: { in: body.attachmentIds }, userId: user.id } }),
    buildPlatformContext(body.locale),
    user.preference?.memoryEnabled === false ? Promise.resolve("") : buildUserMemoryContext(user.id)
  ]);

  const reply = await generateReply(
    history.map(message => ({ role: message.role, content: message.content })),
    { systemContext: [platformContext, memoryContext].filter(Boolean).join("\n\n"), attachments }
  );

  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, role: "assistant", content: reply } }),
    prisma.user.update({ where: { id: user.id }, data: { usageCount: { increment: 1 } } })
  ]);
  if (user.preference?.memoryEnabled !== false) await rememberExplicitFact(user.id, body.message);
  res.json({ conversationId, reply });
});

chatRouter.post("/guest", async (req, res) => {
  const body = z.object({
    guestId: z.string(), message: z.string().min(1).max(6000), conversationId: z.string().optional(), locale: z.string().max(20).default("ar")
  }).parse(req.body);
  const guest = await prisma.guest.findUnique({ where: { id: body.guestId } });
  if (!guest || guest.expiresAt < new Date()) return res.status(401).json({ error: "جلسة الضيف منتهية" });
  const limits = await prisma.appSetting.findUnique({ where: { key: "guest_limits" } });
  const max = Number((limits?.value as any)?.messages || 10);
  if (guest.usageCount >= max) return res.status(402).json({ error: "انتهت التجربة المجانية. أنشئ حسابًا للمتابعة." });

  let conversationId = body.conversationId;
  if (!conversationId) conversationId = (await prisma.conversation.create({ data: { guestId: guest.id, title: body.message.slice(0, 60) } })).id;
  await prisma.message.create({ data: { conversationId, role: "user", content: body.message } });
  const [history, platformContext] = await Promise.all([
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 12 }),
    buildPlatformContext(body.locale)
  ]);
  const reply = await generateReply(history.map(message => ({ role: message.role, content: message.content })), { systemContext: platformContext });
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, role: "assistant", content: reply } }),
    prisma.guest.update({ where: { id: guest.id }, data: { usageCount: { increment: 1 } } })
  ]);
  res.json({ conversationId, reply, remaining: Math.max(0, max - guest.usageCount - 1) });
});
