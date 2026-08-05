import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAdmin, requireAuth, AuthRequest } from "../../middleware/auth.js";
import { encryptJson, decryptJson } from "../../lib/crypto.js";
import { redis } from "../../lib/redis.js";

type SecretConfig = Record<string, unknown>;

export const connectionsRouter = Router();
connectionsRouter.use(requireAuth, requireAdmin);

connectionsRouter.get("/", async (_req, res) => {
  const rows = await prisma.serviceConnection.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }]
  });

  res.json(rows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    enabled: row.enabled,
    mode: row.mode,
    publicSettings: row.publicSettings,
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    hasSecrets: Boolean(row.configCipher)
  })));
});

connectionsRouter.put("/:code", async (req: AuthRequest, res) => {
  const code = String(req.params.code);

  const body = z.object({
    name: z.string().min(2).max(100),
    kind: z.enum(["AI", "PAYMENT", "EMAIL", "STORAGE", "VOICE", "CACHE", "CUSTOM"]),
    enabled: z.boolean(),
    mode: z.enum(["test", "live"]).default("test"),
    config: z.record(z.any()).default({}),
    publicSettings: z.record(z.any()).default({})
  }).parse(req.body);

  const existing = await prisma.serviceConnection.findUnique({ where: { code } });
  const oldSecrets = existing?.configCipher
    ? decryptJson<SecretConfig>(existing.configCipher) || {}
    : {};

  const submittedSecrets = Object.fromEntries(
    Object.entries(body.config).filter(([, value]) =>
      value !== "" && value !== null && value !== undefined
    )
  );

  const mergedSecrets = { ...oldSecrets, ...submittedSecrets };

  const row = await prisma.serviceConnection.upsert({
    where: { code },
    update: {
      name: body.name,
      kind: body.kind,
      enabled: body.enabled,
      mode: body.mode,
      configCipher: Object.keys(mergedSecrets).length
        ? encryptJson(mergedSecrets)
        : existing?.configCipher,
      publicSettings: body.publicSettings,
      status: body.enabled ? "UNKNOWN" : "DISABLED",
      lastError: null
    },
    create: {
      code,
      name: body.name,
      kind: body.kind,
      enabled: body.enabled,
      mode: body.mode,
      configCipher: Object.keys(mergedSecrets).length
        ? encryptJson(mergedSecrets)
        : null,
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
      metadata: {
        code: row.code,
        kind: row.kind,
        mode: row.mode,
        enabled: row.enabled
      }
    }
  });

  res.json({ ok: true, id: row.id });
});

connectionsRouter.post("/:code/test", async (req, res) => {
  const code = String(req.params.code);
  const row = await prisma.serviceConnection.findUnique({ where: { code } });

  if (!row) {
    return res.status(404).json({ error: "الاتصال غير موجود" });
  }

  const config = row.configCipher
    ? decryptJson<Record<string, any>>(row.configCipher) || {}
    : {};
  const publicSettings = (row.publicSettings || {}) as Record<string, any>;
  const started = Date.now();

  try {
    if (row.kind === "AI" && row.code === "gemini") {
      const apiKey = config.apiKey;
      const model = publicSettings.model;

      if (!apiKey) throw new Error("API Key غير موجود");
      if (!model) throw new Error("اسم الموديل غير موجود");

      const baseUrl = String(
        config.baseUrl || "https://generativelanguage.googleapis.com/v1beta"
      ).replace(/\/+$/, "");

      const response = await fetch(
        `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: "Reply with OK only." }]
            }]
          })
        }
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }
    } else if (row.kind === "AI") {
      if (!config.apiKey) throw new Error("API Key غير موجود");
    } else if (row.kind === "EMAIL") {
      if (!config.host || !config.port) throw new Error("بيانات SMTP ناقصة");
    } else if (row.kind === "PAYMENT") {
      if (!config.clientId && !config.apiKey && !config.merchantId) {
        throw new Error("بيانات التاجر ناقصة");
      }
    } else if (row.kind === "STORAGE") {
      if (!config.bucket && !config.basePath) {
        throw new Error("إعدادات التخزين ناقصة");
      }
    } else if (row.kind === "CACHE") {
      if (row.code === "redis" && (!redis || redis.status !== "ready")) {
        throw new Error("Redis غير متصل");
      }
    }

    await prisma.serviceConnection.update({
      where: { id: row.id },
      data: {
        status: "CONNECTED",
        lastTestedAt: new Date(),
        lastError: null
      }
    });

    res.json({ ok: true, latencyMs: Date.now() - started });
  } catch (error: any) {
    await prisma.serviceConnection.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        lastTestedAt: new Date(),
        lastError: error.message
      }
    });

    res.status(400).json({ error: error.message });
  }
});
