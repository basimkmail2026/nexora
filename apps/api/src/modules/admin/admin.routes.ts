import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAdmin, requireAuth } from "../../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);


adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, displayName: true, role: true, status: true,
      usageCount: true, twoFactorEnabled: true, createdAt: true,
      plan: { select: { code: true, nameAr: true, nameEn: true } }
    }
  });
  res.json(users);
});

adminRouter.put("/users/:id/status", async (req: AuthRequest, res) => {
  const status = z.enum(["ACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]).parse(req.body?.status);
  const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: { status } });
  await prisma.auditLog.create({
    data: { actorId: req.auth!.userId, action: "USER_STATUS_UPDATE", entityType: "User", entityId: user.id, metadata: { status } }
  });
  res.json({ ok: true });
});

adminRouter.get("/plans", async (_req, res) => {
  res.json(await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } }));
});

adminRouter.put("/plans/:id", async (req: AuthRequest, res) => {
  const body = z.object({
    nameAr: z.string().optional(),
    nameEn: z.string().optional(),
    messageLimit: z.number().int().min(0).optional(),
    voiceMinutes: z.number().int().min(0).optional(),
    assistantLimit: z.number().int().min(0).optional(),
    active: z.boolean().optional()
  }).parse(req.body);
  const plan = await prisma.plan.update({ where: { id: String(req.params.id) }, data: body });
  res.json(plan);
});


adminRouter.get("/stats", async (_req, res) => {
  const [users, guests, conversations, messages] = await Promise.all([
    prisma.user.count(), prisma.guest.count(), prisma.conversation.count(), prisma.message.count()
  ]);
  res.json({ users, guests, conversations, messages });
});

adminRouter.get("/settings", async (_req, res) => {
  const rows = await prisma.appSetting.findMany();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

adminRouter.put("/settings/:key", async (req: AuthRequest, res) => {
  const key = z.string().min(2).max(80).parse(String(req.params.key));
  const value = req.body?.value;
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  await prisma.auditLog.create({
    data: { actorId: req.auth!.userId, action: "SETTING_UPDATE", entityType: "AppSetting", entityId: key }
  });
  res.json({ ok: true });
});

adminRouter.get("/providers", async (_req, res) => {
  res.json(await prisma.aiProvider.findMany({
    select: { id: true, name: true, type: true, enabled: true, baseUrl: true, defaultModel: true, settings: true }
  }));
});

adminRouter.put("/providers/:id", async (req: AuthRequest, res) => {
  const body = z.object({
    enabled: z.boolean().optional(),
    defaultModel: z.string().optional(),
    baseUrl: z.string().url().optional().or(z.literal("")),
    settings: z.any().optional()
  }).parse(req.body);

  const provider = await prisma.aiProvider.update({ where: { id: String(req.params.id) }, data: body });
  await prisma.auditLog.create({
    data: { actorId: req.auth!.userId, action: "AI_PROVIDER_UPDATE", entityType: "AiProvider", entityId: provider.id }
  });
  res.json(provider);
});

adminRouter.get("/gateways", async (_req, res) => {
  res.json(await prisma.paymentGateway.findMany({
    select: { id: true, code: true, name: true, enabled: true, settings: true }
  }));
});

adminRouter.put("/gateways/:id", async (req: AuthRequest, res) => {
  const body = z.object({ enabled: z.boolean().optional(), settings: z.any().optional() }).parse(req.body);
  const gateway = await prisma.paymentGateway.update({ where: { id: String(req.params.id) }, data: body });
  await prisma.auditLog.create({
    data: { actorId: req.auth!.userId, action: "PAYMENT_GATEWAY_UPDATE", entityType: "PaymentGateway", entityId: gateway.id }
  });
  res.json(gateway);
});

adminRouter.get("/platform-knowledge", async (_req, res) => {
  res.json(await prisma.platformKnowledge.findMany({ orderBy: [{ priority: "desc" }, { updatedAt: "desc" }] }));
});

adminRouter.post("/platform-knowledge", async (req: AuthRequest, res) => {
  const body = z.object({
    key: z.string().min(2).max(80),
    titleAr: z.string().min(2),
    titleEn: z.string().optional(),
    contentAr: z.string().min(2),
    contentEn: z.string().optional(),
    category: z.string().default("general"),
    enabled: z.boolean().default(true),
    priority: z.number().int().default(0)
  }).parse(req.body);
  const data = {
    key: body.key,
    titleAr: body.titleAr,
    titleEn: body.titleEn,
    contentAr: body.contentAr,
    contentEn: body.contentEn,
    category: body.category,
    enabled: body.enabled,
    priority: body.priority
  };

  const row = await prisma.platformKnowledge.upsert({
    where: { key: body.key },
    update: data,
    create: data
  });
  await prisma.auditLog.create({
    data: { actorId: req.auth!.userId, action: "PLATFORM_KNOWLEDGE_UPSERT", entityType: "PlatformKnowledge", entityId: row.id }
  });
  res.status(201).json(row);
});

adminRouter.delete("/platform-knowledge/:id", async (req: AuthRequest, res) => {
  await prisma.platformKnowledge.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});
