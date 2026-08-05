import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get("/assistants/:assistantId", async (req: AuthRequest, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.assistantId), userId: req.auth!.userId }
  });
  if (!assistant) return res.status(404).json({ error: "المساعد غير موجود" });

  const days = Math.min(365, Math.max(7, Number(req.query.days || 30)));
  const from = new Date(Date.now() - days * 86400000);

  const rows = await prisma.assistantAnalyticsDaily.findMany({
    where: { assistantId: assistant.id, date: { gte: from } },
    orderBy: { date: "asc" }
  });

  const totals = rows.reduce((acc, row) => {
    acc.messages += row.messages;
    acc.conversations += row.conversations;
    acc.inputTokens += row.inputTokens;
    acc.outputTokens += row.outputTokens;
    acc.successfulAnswers += row.successfulAnswers;
    acc.fallbackAnswers += row.fallbackAnswers;
    acc.estimatedCost += Number(row.estimatedCost);
    return acc;
  }, {
    messages: 0, conversations: 0, inputTokens: 0, outputTokens: 0,
    successfulAnswers: 0, fallbackAnswers: 0, estimatedCost: 0
  });

  res.json({ rows, totals });
});
