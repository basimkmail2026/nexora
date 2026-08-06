import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { sha256, randomToken } from "../../lib/security.js";
import { generateReply } from "../ai/ai.service.js";
import { getAssistantContext } from "./context.service.js";
import { recordAssistantUsage } from "../analytics/analytics.service.js";

export const publicAssistantRouter = Router();

function normalizeDomain(value: string) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname
      .toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function requestDomain(req: any) {
  const raw = String(req.headers.origin || req.headers.referer || req.body?.pageUrl || req.query?.pageUrl || "");
  return normalizeDomain(raw);
}

function domainAllowed(domain: string, allowedDomains: string[]) {
  if (!allowedDomains.length) return true;
  if (!domain) return false;
  return allowedDomains.some(item => {
    const allowed = normalizeDomain(item);
    return domain === allowed || domain.endsWith(`.${allowed}`);
  });
}

async function resolveWidget(publicKey: string) {
  return prisma.assistantWidget.findUnique({
    where: { publicKey },
    include: { assistant: true }
  });
}

async function getOrCreateConversation(input: {
  assistantId: string;
  sessionKey: string;
  source: string;
  data?: Record<string, unknown>;
}) {
  const existing = await prisma.assistantConversation.findFirst({
    where: { assistantId: input.assistantId, sessionKey: input.sessionKey }
  });
  if (existing) {
    return prisma.assistantConversation.update({
      where: { id: existing.id },
      data: { source: input.source, lastMessageAt: new Date(), ...(input.data || {}) }
    });
  }
  return prisma.assistantConversation.create({
    data: {
      assistantId: input.assistantId,
      sessionKey: input.sessionKey,
      source: input.source,
      ...(input.data || {})
    } as any
  });
}

async function replyForAssistant(input: {
  assistant: any;
  message: string;
  history: Array<{ role: string; content: string }>;
}) {
  const context = await getAssistantContext(input.assistant.id, input.message);
  const instructions = [
    input.assistant.systemPrompt,
    context ? `قاعدة المعرفة المعتمدة:\n${context}` : "",
    `إذا لم تجد جوابًا مؤكدًا، استخدم هذه الرسالة أو وضّح عدم توفر المعلومة: ${input.assistant.fallbackMessage}`,
    "تحدث بلغة الزائر، ولا تخترع أسعارًا أو معلومات غير موجودة."
  ].filter(Boolean).join("\n\n");

  return generateReply([
    { role: "user", content: instructions },
    ...input.history,
    { role: "user", content: input.message }
  ]);
}

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
    sessionKey: z.string().max(200).optional()
  }).parse(req.body);

  const sessionKey = body.sessionKey || randomToken(18);
  const conversation = await getOrCreateConversation({
    assistantId: key.assistant.id,
    sessionKey,
    source: "api"
  });

  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 14
  });

  const started = Date.now();
  const reply = await replyForAssistant({
    assistant: key.assistant,
    message: body.message,
    history: history.reverse().map(item => ({ role: item.role, content: item.content }))
  });

  await prisma.$transaction([
    prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: "user", content: body.message }
    }),
    prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: "assistant", content: reply }
    }),
    prisma.assistantApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }),
    prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    })
  ]);

  await recordAssistantUsage({
    assistantId: key.assistant.id,
    latencyMs: Date.now() - started,
    fallback: reply.includes(key.assistant.fallbackMessage)
  });

  res.json({ sessionKey, reply });
});

publicAssistantRouter.get("/widget/:publicKey/config", async (req, res) => {
  const widget = await resolveWidget(String(req.params.publicKey));
  if (!widget?.enabled || widget.assistant.status !== "PUBLISHED") {
    return res.status(404).json({ error: "الودجت غير متاح" });
  }

  const domain = requestDomain(req);
  if (!domainAllowed(domain, widget.allowedDomains)) {
    return res.status(403).json({ error: "هذا النطاق غير مسموح" });
  }

  res.json({
    publicKey: widget.publicKey,
    assistantId: widget.assistant.id,
    name: widget.assistant.name,
    description: widget.assistant.description,
    avatarUrl: widget.assistant.avatarUrl,
    language: widget.assistant.language,
    primaryColor: widget.primaryColor,
    position: widget.position,
    theme: widget.theme,
    welcomeMessage: widget.welcomeMessage,
    inputPlaceholder: widget.inputPlaceholder,
    launcherLabel: widget.launcherLabel,
    showBranding: widget.showBranding,
    collectVisitorInfo: widget.collectVisitorInfo,
    privacyUrl: widget.privacyUrl
  });
});

publicAssistantRouter.post("/widget/:publicKey/chat", async (req, res) => {
  const body = z.object({
    message: z.string().min(1).max(8000),
    sessionKey: z.string().max(200).optional(),
    visitorId: z.string().max(200).optional(),
    visitorName: z.string().max(120).optional(),
    visitorEmail: z.string().email().max(200).optional().or(z.literal("")),
    pageUrl: z.string().url().max(2000).optional()
  }).parse(req.body);

  const widget = await resolveWidget(String(req.params.publicKey));
  if (!widget?.enabled || widget.assistant.status !== "PUBLISHED") {
    return res.status(404).json({ error: "الودجت غير متاح" });
  }

  const domain = requestDomain(req);
  if (!domainAllowed(domain, widget.allowedDomains)) {
    return res.status(403).json({ error: "هذا النطاق غير مسموح" });
  }

  const sessionKey = body.sessionKey || randomToken(18);
  const conversation = await getOrCreateConversation({
    assistantId: widget.assistant.id,
    sessionKey,
    source: "widget",
    data: {
      sourceDomain: domain || undefined,
      pageUrl: body.pageUrl,
      visitorId: body.visitorId,
      visitorName: body.visitorName,
      visitorEmail: body.visitorEmail || undefined,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500)
    }
  });

  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 14
  });

  const started = Date.now();
  const reply = await replyForAssistant({
    assistant: widget.assistant,
    message: body.message,
    history: history.reverse().map(item => ({ role: item.role, content: item.content }))
  });

  await prisma.$transaction([
    prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: "user", content: body.message }
    }),
    prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: "assistant", content: reply }
    }),
    prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    })
  ]);

  await recordAssistantUsage({
    assistantId: widget.assistant.id,
    latencyMs: Date.now() - started,
    fallback: reply.includes(widget.assistant.fallbackMessage)
  });

  res.json({ sessionKey, reply });
});

// Backward compatibility for older embed snippets.
publicAssistantRouter.get("/:assistantId/widget-config", async (req, res) => {
  const assistant = await prisma.assistant.findFirst({
    where: { id: String(req.params.assistantId), status: "PUBLISHED" },
    include: { widget: true }
  });
  if (!assistant?.widget?.enabled) return res.status(404).json({ error: "الودجت غير متاح" });
  res.redirect(307, `../widget/${assistant.widget.publicKey}/config`);
});
