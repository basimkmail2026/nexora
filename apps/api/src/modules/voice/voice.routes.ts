import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAdmin, requireAuth } from "../../middleware/auth.js";
import { z } from "zod";

export const voiceRouter = Router();

voiceRouter.get("/profiles", async (_req, res) => {
  res.json(await prisma.voiceProfile.findMany({
    where: { enabled: true },
    orderBy: [{ language: "asc" }, { nameEn: "asc" }]
  }));
});

voiceRouter.post("/profiles", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  const body = z.object({
    code: z.string().min(2).max(80),
    nameAr: z.string().min(2).max(80),
    nameEn: z.string().min(2).max(80),
    provider: z.string().min(2).max(80),
    voiceId: z.string().min(1).max(200),
    gender: z.string().optional(),
    ageGroup: z.string().optional(),
    language: z.string().min(2).max(20),
    enabled: z.boolean().default(true),
    config: z.record(z.any()).default({})
  }).parse(_req.body);

  res.status(201).json(await prisma.voiceProfile.create({ data: body }));
});
