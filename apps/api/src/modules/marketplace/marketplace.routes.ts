import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";

export const marketplaceRouter = Router();

function slugify(value: string) {
  return value.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || crypto.randomUUID();
}

marketplaceRouter.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();

  const items = await prisma.marketplaceItem.findMany({
    where: {
      status: "PUBLISHED",
      ...(category ? { category } : {}),
      ...(q ? {
        OR: [
          { nameAr: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { descriptionAr: { contains: q, mode: "insensitive" } },
          { descriptionEn: { contains: q, mode: "insensitive" } }
        ]
      } : {})
    },
    orderBy: [{ featured: "desc" }, { downloads: "desc" }, { createdAt: "desc" }],
    include: {
      ownerUser: { select: { displayName: true } }
    }
  });

  res.json(items);
});

marketplaceRouter.get("/:slug", async (req, res) => {
  const item = await prisma.marketplaceItem.findUnique({
    where: { slug: String(req.params.slug) },
    include: {
      ownerUser: { select: { displayName: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 25 }
    }
  });
  if (!item || item.status !== "PUBLISHED") return res.status(404).json({ error: "العنصر غير موجود" });
  res.json(item);
});

marketplaceRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const body = z.object({
    type: z.enum(["ASSISTANT_TEMPLATE","PROMPT_PACK","WORKFLOW"]),
    nameAr: z.string().min(2).max(100),
    nameEn: z.string().min(2).max(100),
    descriptionAr: z.string().min(10).max(4000),
    descriptionEn: z.string().min(10).max(4000),
    category: z.string().min(2).max(80),
    tags: z.array(z.string()).max(20).default([]),
    price: z.number().min(0),
    currency: z.string().length(3).default("USD"),
    sourceAssistantId: z.string().optional()
  }).parse(req.body);

  if (body.sourceAssistantId) {
    const owned = await prisma.assistant.findFirst({
      where: { id: body.sourceAssistantId, userId: req.auth!.userId }
    });
    if (!owned) return res.status(403).json({ error: "المساعد غير مملوك لك" });
  }

  let slug = slugify(body.nameEn);
  if (await prisma.marketplaceItem.findUnique({ where: { slug } })) {
    slug += `-${crypto.randomBytes(3).toString("hex")}`;
  }

  const item = await prisma.marketplaceItem.create({
    data: {
      ownerUserId: req.auth!.userId,
      slug,
      ...body
    }
  });

  res.status(201).json(item);
});

marketplaceRouter.post("/:id/publish", requireAuth, async (req: AuthRequest, res) => {
  const item = await prisma.marketplaceItem.findFirst({
    where: { id: String(req.params.id), ownerUserId: req.auth!.userId }
  });
  if (!item) return res.status(404).json({ error: "العنصر غير موجود" });

  res.json(await prisma.marketplaceItem.update({
    where: { id: item.id },
    data: { status: "PUBLISHED" }
  }));
});

marketplaceRouter.post("/:id/install", requireAuth, async (req: AuthRequest, res) => {
  const item = await prisma.marketplaceItem.findUnique({ where: { id: String(req.params.id) } });
  if (!item || item.status !== "PUBLISHED") return res.status(404).json({ error: "العنصر غير موجود" });

  if (Number(item.price) > 0) {
    await prisma.marketplacePurchase.create({
      data: {
        itemId: item.id,
        userId: req.auth!.userId,
        amount: item.price,
        currency: item.currency
      }
    });
  }

  let createdAssistant = null;
  if (item.type === "ASSISTANT_TEMPLATE") {
    const config = item.config as any;
    createdAssistant = await prisma.assistant.create({
      data: {
        userId: req.auth!.userId,
        name: `${item.nameAr} - نسخة`,
        slug: `${item.slug}-${crypto.randomBytes(4).toString("hex")}`,
        description: item.descriptionAr,
        language: config.language || "ar",
        systemPrompt: config.systemPrompt || "أنت مساعد ذكي مفيد."
      }
    });
  }

  await prisma.marketplaceItem.update({
    where: { id: item.id },
    data: { downloads: { increment: 1 } }
  });

  res.json({ installed: true, assistant: createdAssistant });
});

marketplaceRouter.post("/:id/review", requireAuth, async (req: AuthRequest, res) => {
  const body = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional()
  }).parse(req.body);

  const review = await prisma.marketplaceReview.upsert({
    where: { itemId_userId: { itemId: String(req.params.id), userId: req.auth!.userId } },
    update: body,
    create: { itemId: String(req.params.id), userId: req.auth!.userId, ...body }
  });

  const stats = await prisma.marketplaceReview.aggregate({
    where: { itemId: String(req.params.id) },
    _avg: { rating: true },
    _count: { rating: true }
  });

  await prisma.marketplaceItem.update({
    where: { id: String(req.params.id) },
    data: {
      ratingAverage: stats._avg?.rating ?? 0,
      ratingCount: typeof stats._count === "object" ? (stats._count.rating ?? 0) : 0
    }
  });

  res.json(review);
});
