import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { decryptJson } from "../../lib/crypto.js";
import { providerFactory } from "./providers.js";

export const webhookRouter = Router();

webhookRouter.post("/:gatewayCode", async (req, res) => {
  const gateway = await prisma.paymentGateway.findUnique({ where: { code: String(req.params.gatewayCode) } });
  if (!gateway) return res.status(404).json({ error: "بوابة غير معروفة" });

  const rawBody = JSON.stringify(req.body || {});
  const config = decryptJson<Record<string, any>>(gateway.configCipher) || {};
  const provider = providerFactory(gateway.code, config);
  const signatureOk = provider.verifyWebhook(req.headers as any, rawBody);

  const event = await prisma.webhookEvent.create({
    data: {
      gatewayCode: gateway.code,
      externalId: String(req.body?.id || req.body?.event_id || ""),
      eventType: String(req.body?.type || "unknown"),
      signatureOk,
      payload: req.body || {}
    }
  });

  if (!signatureOk) {
    return res.status(401).json({ error: "توقيع غير صالح" });
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() }
  });

  res.json({ received: true });
});
