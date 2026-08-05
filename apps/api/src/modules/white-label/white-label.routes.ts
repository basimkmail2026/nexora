import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";

export const whiteLabelRouter = Router();
whiteLabelRouter.use(requireAuth);

whiteLabelRouter.get("/", async (req: AuthRequest, res) => {
  const profile = await prisma.whiteLabelProfile.findUnique({
    where: { userId: req.auth!.userId }
  });
  res.json(profile);
});

whiteLabelRouter.put("/", async (req: AuthRequest, res) => {
  const body = z.object({
    brandName: z.string().min(2).max(100),
    logoUrl: z.string().url().nullable().optional(),
    faviconUrl: z.string().url().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    customDomain: z.string().nullable().optional(),
    emailFromName: z.string().nullable().optional(),
    emailFromAddress: z.string().email().nullable().optional(),
    hideNexoraBrand: z.boolean().default(false),
    customCss: z.string().max(20000).nullable().optional()
  }).parse(req.body);

  res.json(await prisma.whiteLabelProfile.upsert({
    where: { userId: req.auth!.userId },
    update: body,
    create: { userId: req.auth!.userId, brandName: body.brandName, logoUrl: body.logoUrl, faviconUrl: body.faviconUrl, primaryColor: body.primaryColor, secondaryColor: body.secondaryColor, customDomain: body.customDomain, emailFromName: body.emailFromName, emailFromAddress: body.emailFromAddress, hideNexoraBrand: body.hideNexoraBrand, customCss: body.customCss }
  }));
});
