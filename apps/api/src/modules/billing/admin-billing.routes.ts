import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAdmin, requireAuth } from "../../middleware/auth.js";
import { encryptJson } from "../../lib/crypto.js";

export const adminBillingRouter = Router();
adminBillingRouter.use(requireAuth, requireAdmin);

adminBillingRouter.get("/overview", async (_req, res) => {
  const [revenue, pending, activeSubs, refunds] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "PENDING" }, _sum: { amount: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.payment.aggregate({ where: { status: "REFUNDED" }, _sum: { amount: true } })
  ]);
  res.json({
    revenue: revenue._sum.amount || 0,
    pending: pending._sum.amount || 0,
    activeSubscriptions: activeSubs,
    refunded: refunds._sum.amount || 0
  });
});

adminBillingRouter.get("/invoices", async (_req, res) => {
  res.json(await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } }, payments: true, lineItems: true }
  }));
});

adminBillingRouter.get("/payments", async (_req, res) => {
  res.json(await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } }, invoice: true }
  }));
});

adminBillingRouter.get("/subscriptions", async (_req, res) => {
  res.json(await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } }, plan: true }
  }));
});

adminBillingRouter.get("/coupons", async (_req, res) => {
  res.json(await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }));
});

adminBillingRouter.post("/coupons", async (req: AuthRequest, res) => {
  const body = z.object({
    code: z.string().min(3).max(40),
    type: z.enum(["PERCENT","FIXED"]),
    value: z.number().positive(),
    currency: z.string().length(3).optional(),
    maxRedemptions: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional()
  }).parse(req.body);

  const coupon = await prisma.coupon.create({
    data: {
      code: body.code.toUpperCase(),
      type: body.type,
      value: body.value,
      currency: body.currency,
      maxRedemptions: body.maxRedemptions,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
    }
  });
  res.status(201).json(coupon);
});

adminBillingRouter.put("/gateways/:id/config", async (req: AuthRequest, res) => {
  const body = z.object({
    enabled: z.boolean(),
    config: z.record(z.any()),
    settings: z.record(z.any()).optional()
  }).parse(req.body);

  const gateway = await prisma.paymentGateway.update({
    where: { id: req.params.id },
    data: {
      enabled: body.enabled,
      configCipher: encryptJson(body.config),
      settings: body.settings || {}
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: req.auth!.userId,
      action: "PAYMENT_GATEWAY_CONFIG_UPDATE",
      entityType: "PaymentGateway",
      entityId: gateway.id
    }
  });

  res.json({ id: gateway.id, code: gateway.code, name: gateway.name, enabled: gateway.enabled, settings: gateway.settings });
});

adminBillingRouter.get("/currencies", async (_req, res) => {
  res.json(await prisma.currency.findMany({ orderBy: { code: "asc" } }));
});

adminBillingRouter.put("/currencies/:code", async (req, res) => {
  const body = z.object({
    name: z.string(),
    symbol: z.string(),
    enabled: z.boolean(),
    decimals: z.number().int().min(0).max(4)
  }).parse(req.body);

  res.json(await prisma.currency.upsert({
    where: { code: req.params.code.toUpperCase() },
    update: body,
    create: { code: req.params.code.toUpperCase(), ...body }
  }));
});

adminBillingRouter.get("/tax-rules", async (_req, res) => {
  res.json(await prisma.taxRule.findMany({ orderBy: { createdAt: "desc" } }));
});

adminBillingRouter.post("/tax-rules", async (req, res) => {
  const body = z.object({
    name: z.string(),
    country: z.string().optional(),
    rate: z.number().min(0).max(100),
    enabled: z.boolean().default(false),
    inclusive: z.boolean().default(false)
  }).parse(req.body);
  res.status(201).json(await prisma.taxRule.create({ data: body }));
});
