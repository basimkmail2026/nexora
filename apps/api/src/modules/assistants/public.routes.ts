import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { sha256, randomToken } from "../../lib/security.js";
import { generateReply } from "../ai/ai.service.js";

export const publicAssistantRouter = Router();

publicAssistantRouter.post("/:assistantId/chat", async (req, res) => {
  const apiKey = String(req.headers["x-nexora-key"] || "");
  if (!apiKey) return res.status(401).json({ error: "API key مطلوب" });

  const key = await prisma.assistantApiKey.findUnique({
    where: { keyHash: sha256(apiKey) },
    include: { assistant: true }
  });
  if (!key || key.revokedAt || key.assistantId !== String(req.params.assistantId)) {
    return res.status(401).json({ error: "API key غير صالح" });
  }

  const body = z.object({
    message: z.string().min(1).max(12000),
    sessionKey: z.string().optional()
  }).parse(req.body);

  const reply = await generateReply([
    { role: "user", content: key.assistant.systemPrompt },
    { role: "user", content: body.message }
  ]);

  await prisma.assistantApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() }
  });

  res.json({ sessionKey: body.sessionKey || randomToken(12), reply });
});

publicAssistantRouter.get("/:assistantId/widget-config", async (req, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.assistantId), status: "PUBLISHED" },
    include: { widget: true }
  });
  if (!assistant?.widget?.enabled) return res.status(404).json({ error: "الودجت غير متاح" });

  res.json({
    assistantId: assistant.id,
    name: assistant.name,
    avatarUrl: assistant.avatarUrl,
    primaryColor: assistant.widget.primaryColor,
    position: assistant.widget.position,
    welcomeMessage: assistant.widget.welcomeMessage
  });
});


publicAssistantRouter.post("/:assistantId/widget-chat", async (req, res) => {
  const body = z.object({
    message: z.string().min(1).max(8000),
    sessionKey: z.string().optional()
  }).parse(req.body);

  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.assistantId), status: "PUBLISHED" },
    include: { widget: true }
  });

  if (!assistant?.widget?.enabled) return res.status(404).json({ error: "الودجت غير متاح" });

  const origin = String(req.headers.origin || req.headers.referer || "");
  const allowed = assistant.widget.allowedDomains || [];
  if (allowed.length > 0 && !allowed.some(domain => origin.includes(domain))) {
    return res.status(403).json({ error: "هذا النطاق غير مسموح" });
  }

  const started = Date.now();
  const sessionKey = body.sessionKey || randomToken(12);

  let conversation = await prisma.assistantConversation.findFirst({
    where: { assistantId: assistant.id, sessionKey }
  });

  if (!conversation) {
    conversation = await prisma.assistantConversation.create({
      data: { assistantId: assistant.id, sessionKey }
    });
  }

  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: "user", content: body.message }
  });

  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 16
  });

  const reply = await generateReply([
    { role: "user", content: assistant.systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content }))
  ]);

  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: "assistant", content: reply }
  });

  await (await import("../analytics/analytics.service.js")).recordAssistantUsage({
    assistantId: assistant.id,
    latencyMs: Date.now() - started,
    fallback: reply.includes(assistant.fallbackMessage)
  });

  res.json({ sessionKey, reply });
});
