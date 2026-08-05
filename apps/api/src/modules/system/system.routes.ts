import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { redis } from "../../lib/redis.js";
import { env } from "../../config/env.js";

export const systemRouter = Router();
systemRouter.use(requireAuth, requireAdmin);

systemRouter.get("/health", async (_req, res) => {
  const checks: any[] = [];

  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ component: "database", status: "ok", latencyMs: Date.now() - dbStart });
  } catch (e: any) {
    checks.push({ component: "database", status: "failed", message: e.message });
  }

  const redisStart = Date.now();
  if (redis && redis.status === "ready") {
    try {
      await redis.ping();
      checks.push({ component: "redis", status: "ok", latencyMs: Date.now() - redisStart });
    } catch (e: any) {
      checks.push({ component: "redis", status: "failed", message: e.message });
    }
  } else {
    checks.push({ component: "redis", status: "disabled" });
  }

  checks.push({
    component: "storage",
    status: env.OBJECT_STORAGE_PROVIDER === "local" ? "local" : "configured"
  });

  for (const check of checks) {
    await prisma.systemHealthCheck.create({
      data: {
        component: check.component,
        status: check.status,
        latencyMs: check.latencyMs,
        message: check.message
      }
    }).catch(() => {});
  }

  res.json({ checks, generatedAt: new Date().toISOString() });
});

systemRouter.post("/backup", async (_req, res) => {
  const job = await prisma.backupJob.create({
    data: { type: "manual", status: "queued", metadata: { note: "Database backup requires provider credentials at deployment." } }
  });
  res.status(202).json(job);
});

systemRouter.get("/backups", async (_req, res) => {
  res.json(await prisma.backupJob.findMany({ orderBy: { startedAt: "desc" }, take: 50 }));
});
