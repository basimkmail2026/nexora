import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";
import { generateReply } from "../ai/ai.service.js";

export const chatRouter = Router();


chatRouter.get("/conversations", requireAuth, async (req: AuthRequest, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  });
  res.json(conversations);
});

chatRouter.get("/conversations/:id", requireAuth, async (req: AuthRequest, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.auth!.userId },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!conversation) return res.status(404).json({ error: "المحادثة غير موجودة" });
  res.json(conversation);
});

chatRouter.delete("/conversations/:id", requireAuth, async (req: AuthRequest, res) => {
  await prisma.conversation.deleteMany({
    where: { id: req.params.id, userId: req.auth!.userId }
  });
  res.json({ ok: true });
});


chatRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const body = z.object({
    message: z.string().min(1).max(12000),
    conversationId: z.string().optional()
  }).parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { plan: true }
  });
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

  const limit = user.plan?.messageLimit ?? 50;
  if (user.usageCount >= limit && user.role === "USER") {
    return res.status(402).json({ error: "وصلت إلى حد الخطة الحالية" });
  }

  let conversationId = body.conversationId;
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: body.message.slice(0, 60) }
    });
    conversationId = conversation.id;
  }

  await prisma.message.create({
    data: { conversationId, role: "user", content: body.message }
  });

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 20
  });

  const reply = await generateReply(history.map(m => ({ role: m.role, content: m.content })));

  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, role: "assistant", content: reply } }),
    prisma.user.update({ where: { id: user.id }, data: { usageCount: { increment: 1 } } })
  ]);

  res.json({ conversationId, reply });
});

chatRouter.post("/guest", async (req, res) => {
  const body = z.object({
    guestId: z.string(),
    message: z.string().min(1).max(6000),
    conversationId: z.string().optional()
  }).parse(req.body);

  const guest = await prisma.guest.findUnique({ where: { id: body.guestId } });
  if (!guest || guest.expiresAt < new Date()) return res.status(401).json({ error: "جلسة الضيف منتهية" });

  const limits = await prisma.appSetting.findUnique({ where: { key: "guest_limits" } });
  const max = Number((limits?.value as any)?.messages || 10);
  if (guest.usageCount >= max) return res.status(402).json({ error: "انتهت التجربة المجانية. أنشئ حسابًا للمتابعة." });

  let conversationId = body.conversationId;
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: { guestId: guest.id, title: body.message.slice(0, 60) }
    });
    conversationId = conversation.id;
  }

  await prisma.message.create({ data: { conversationId, role: "user", content: body.message } });
  const history = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 12 });
  const reply = await generateReply(history.map(m => ({ role: m.role, content: m.content })));

  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, role: "assistant", content: reply } }),
    prisma.guest.update({ where: { id: guest.id }, data: { usageCount: { increment: 1 } } })
  ]);

  res.json({ conversationId, reply, remaining: Math.max(0, max - guest.usageCount - 1) });
});
