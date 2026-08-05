import { Router } from "express";
import { z } from "zod";
import Decimal from "decimal.js";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";
import { decryptJson } from "../../lib/crypto.js";
import { providerFactory } from "./providers.js";
import { randomToken } from "../../lib/security.js";

export const billingRouter = Router();

billingRouter.get("/plans", async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceMonthly: "asc" }
  });
  res.json(plans);
});

billingRouter.get("/currencies", async (_req, res) => {
  res.json(await prisma.currency.findMany({ where: { enabled: true }, orderBy: { code: "asc" } }));
});

billingRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [subscription, invoices, payments] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: req.auth!.userId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.invoice.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lineItems: true }
    }),
    prisma.payment.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      take: 25
    })
  ]);
  res.json({ subscription, invoices, payments });
});

billingRouter.post("/checkout", requireAuth, async (req: AuthRequest, res) => {
  const body = z.object({
    planCode: z.string(),
    interval: z.enum(["MONTHLY", "YEARLY"]),
    gatewayCode: z.string(),
    currency: z.string().length(3),
    couponCode: z.string().optional()
  }).parse(req.body);

  const [user, plan, gateway, taxRule] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } }),
    prisma.plan.findUnique({ where: { code: body.planCode } }),
    prisma.paymentGateway.findUnique({ where: { code: body.gatewayCode } }),
    prisma.taxRule.findFirst({ where: { enabled: true } })
  ]);

  if (!plan || !plan.active) return res.status(404).json({ error: "الباقة غير موجودة" });
  if (!gateway?.enabled) return res.status(400).json({ error: "بوابة الدفع غير مفعلة" });

  let subtotal = new Decimal(body.interval === "MONTHLY" ? plan.priceMonthly.toString() : plan.priceYearly.toString());
  let discount = new Decimal(0);
  let coupon = null;

  if (body.couponCode) {
    coupon = await prisma.coupon.findUnique({ where: { code: body.couponCode.toUpperCase() } });
    const now = new Date();
    const valid = coupon?.active
      && (!coupon.startsAt || coupon.startsAt <= now)
      && (!coupon.expiresAt || coupon.expiresAt >= now)
      && (!coupon.maxRedemptions || coupon.redeemedCount < coupon.maxRedemptions);

    if (!valid) return res.status(400).json({ error: "كوبون غير صالح" });

    discount = coupon!.type === "PERCENT"
      ? subtotal.mul(new Decimal(coupon!.value.toString()).div(100))
      : new Decimal(coupon!.value.toString());

    if (discount.gt(subtotal)) discount = subtotal;
  }

  const taxable = subtotal.minus(discount);
  const tax = taxRule ? taxable.mul(new Decimal(taxRule.rate.toString()).div(100)) : new Decimal(0);
  const total = taxable.plus(tax);
  const invoiceNumber = `NX-${new Date().getFullYear()}-${randomToken(4).toUpperCase()}`;

  const invoice = await prisma.invoice.create({
    data: {
      number: invoiceNumber,
      userId: user.id,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      currency: body.currency,
      status: "OPEN",
      lineItems: {
        create: [{
          description: `${plan.nameEn} (${body.interval})`,
          quantity: 1,
          unitPrice: subtotal.toFixed(2),
          total: subtotal.toFixed(2)
        }]
      }
    }
  });

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      invoiceId: invoice.id,
      gatewayCode: gateway.code,
      amount: total.toFixed(2),
      currency: body.currency
    }
  });

  const config = decryptJson<Record<string, any>>(gateway.configCipher) || {};
  const provider = providerFactory(gateway.code, config);
  const origin = process.env.APP_URL || "http://localhost:5173";
  const result = await provider.createCheckout({
    amount: Number(total.toFixed(2)),
    currency: body.currency,
    description: `${plan.nameEn} subscription`,
    successUrl: `${origin}/?payment=success&invoice=${invoice.id}`,
    cancelUrl: `${origin}/?payment=cancel&invoice=${invoice.id}`,
    customerEmail: user.email,
    metadata: { invoiceId: invoice.id, planCode: plan.code, interval: body.interval }
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { externalId: result.externalId, rawResponse: result.raw as any }
  });

  if (coupon) {
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { redeemedCount: { increment: 1 } }
    });
  }

  res.json({ checkoutUrl: result.checkoutUrl, invoiceId: invoice.id, paymentId: payment.id });
});

billingRouter.post("/test/complete", requireAuth, async (req: AuthRequest, res) => {
  const body = z.object({ invoiceId: z.string(), planCode: z.string(), interval: z.enum(["MONTHLY","YEARLY"]) }).parse(req.body);
  const invoice = await prisma.invoice.findFirst({
    where: { id: body.invoiceId, userId: req.auth!.userId },
    include: { payments: true }
  });
  const plan = await prisma.plan.findUnique({ where: { code: body.planCode } });
  if (!invoice || !plan) return res.status(404).json({ error: "الطلب غير موجود" });

  const now = new Date();
  const end = new Date(now);
  if (body.interval === "MONTHLY") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  const subscription = await prisma.subscription.create({
    data: {
      userId: req.auth!.userId,
      planId: plan.id,
      status: "ACTIVE",
      interval: body.interval,
      providerCode: invoice.payments[0]?.gatewayCode,
      currentPeriodStart: now,
      currentPeriodEnd: end
    }
  });

  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: now, subscriptionId: subscription.id } }),
    prisma.payment.updateMany({ where: { invoiceId: invoice.id }, data: { status: "PAID", paidAt: now } }),
    prisma.user.update({ where: { id: req.auth!.userId }, data: { planId: plan.id, usageCount: 0 } })
  ]);

  res.json({ ok: true, subscriptionId: subscription.id });
});

billingRouter.post("/cancel", requireAuth, async (req: AuthRequest, res) => {
  const sub = await prisma.subscription.findFirst({
    where: { userId: req.auth!.userId, status: { in: ["ACTIVE","TRIALING","PAST_DUE"] } },
    orderBy: { createdAt: "desc" }
  });
  if (!sub) return res.status(404).json({ error: "لا يوجد اشتراك فعال" });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: true, canceledAt: new Date() }
  });
  res.json({ ok: true });
});
