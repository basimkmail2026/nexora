import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAdmin, requireAuth, AuthRequest } from "../../middleware/auth.js";
import { encryptJson, decryptJson } from "../../lib/crypto.js";
import { redis } from "../../lib/redis.js";

export const connectionsRouter = Router();
connectionsRouter.use(requireAuth, requireAdmin);

connectionsRouter.get("/", async (_req, res) => {
  const rows = await prisma.serviceConnection.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
  res.json(rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    enabled: r.enabled,
    mode: r.mode,
    publicSettings: r.publicSettings,
    status: r.status,
    lastTestedAt: r.lastTestedAt,
    lastError: r.lastError,
    hasSecrets: Boolean(r.configCipher)
  })));
});

connectionsRouter.put("/:code", async (req: AuthRequest, res) => {
  const body = z.object({
    name: z.string().min(2).max(100),
    kind: z.enum(["AI","PAYMENT","EMAIL","STORAGE","VOICE","CACHE","CUSTOM"]),
    enabled: z.boolean(),
    mode: z.enum(["test","live"]).default("test"),
    config: z.record(z.any()).default({}),
    publicSettings: z.record(z.any()).default({})
  }).parse(req.body);

  const row = await prisma.serviceConnection.upsert({
    where: { code: req.params.code },
    update: {
      name: body.name,
      kind: body.kind,
      enabled: body.enabled,
      mode: body.mode,
      configCipher: encryptJson(body.config),
      publicSettings: body.publicSettings,
      status: body.enabled ? "UNKNOWN" : "DISABLED",
      lastError: null
    },
    create: {
      code: req.params.code,
      name: body.name,
      kind: body.kind,
      enabled: body.enabled,
      mode: body.mode,
      configCipher: encryptJson(body.config),
      publicSettings: body.publicSettings,
      status: body.enabled ? "UNKNOWN" : "DISABLED"
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: req.auth!.userId,
      action: "SERVICE_CONNECTION_UPDATE",
      entityType: "ServiceConnection",
      entityId: row.id,
      metadata: { code: row.code, kind: row.kind, mode: row.mode }
    }
  });

  res.json({ ok: true, id: row.id });
});

connectionsRouter.post("/:code/test", async (req, res) => {
  const row = await prisma.serviceConnection.findUnique({ where: { code: req.params.code } });
  if (!row) return res.status(404).json({ error: "الاتصال غير موجود" });

  const config = decryptJson<Record<string, any>>(row.configCipher) || {};
  const started = Date.now();

  try {
    if (row.kind === "AI") {
      if (!config.apiKey) throw new Error("API Key غير موجود");
      const endpoint = config.testUrl || config.baseUrl;
      if (endpoint) {
        const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${config.apiKey}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
    } else if (row.kind === "EMAIL") {
      if (!config.host || !config.port) throw new Error("بيانات SMTP ناقصة");
    } else if (row.kind === "PAYMENT") {
      if (!config.clientId && !config.apiKey && !config.merchantId) throw new Error("بيانات التاجر ناقصة");
    } else if (row.kind === "STORAGE") {
      if (!config.bucket && !config.basePath) throw new Error("إعدادات التخزين ناقصة");
    } else if (row.kind === "CACHE") {
      if (row.code === "redis" && (!redis || redis.status !== "ready")) throw new Error("Redis غير متصل");
    }

    await prisma.serviceConnection.update({
      where: { id: row.id },
      data: { status: "CONNECTED", lastTestedAt: new Date(), lastError: null }
    });
    res.json({ ok: true, latencyMs: Date.now() - started });
  } catch (error: any) {
    await prisma.serviceConnection.update({
      where: { id: row.id },
      data: { status: "FAILED", lastTestedAt: new Date(), lastError: error.message }
    });
    res.status(400).json({ error: error.message });
  }
});
