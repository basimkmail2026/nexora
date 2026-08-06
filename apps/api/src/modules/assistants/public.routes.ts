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


async function validateWidgetRequest(req: any, publicKey: string) {
  const widget = await resolveWidget(publicKey);
  if (!widget) return { error: { status: 404, message: "مفتاح الودجت غير صالح" } } as const;
  if (!widget.enabled) return { error: { status: 403, message: "الودجت متوقف من لوحة التحكم" } } as const;
  if (widget.assistant.status === "ARCHIVED") return { error: { status: 403, message: "المساعد مؤرشف" } } as const;
  const domain = requestDomain(req);
  if (!domainAllowed(domain, widget.allowedDomains)) {
    return { error: { status: 403, message: "هذا النطاق غير مسموح" } } as const;
  }
  return { widget, domain } as const;
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
  if (!widget) {
    console.warn("Nexora widget config: public key not found", { publicKey: String(req.params.publicKey) });
    return res.status(404).json({ error: "مفتاح الودجت غير صالح" });
  }
  if (!widget.enabled) {
    console.warn("Nexora widget config: widget disabled", { assistantId: widget.assistantId });
    return res.status(403).json({ error: "الودجت متوقف من لوحة التحكم" });
  }
  if (widget.assistant.status === "ARCHIVED") {
    console.warn("Nexora widget config: assistant archived", { assistantId: widget.assistantId });
    return res.status(403).json({ error: "المساعد مؤرشف" });
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

  const validated = await validateWidgetRequest(req, String(req.params.publicKey));
  if ("error" in validated) return res.status(validated.error.status).json({ error: validated.error.message });
  const { widget, domain } = validated;

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

  if (conversation.handoffStatus === "WAITING" || conversation.handoffStatus === "AGENT") {
    const saved = await prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: "user", content: body.message }
    });
    await prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: "OPEN" }
    });
    return res.json({
      sessionKey,
      mode: conversation.handoffStatus,
      messageId: saved.id,
      reply: conversation.handoffStatus === "WAITING"
        ? "تم إرسال رسالتك. أنت الآن بانتظار أحد الموظفين."
        : null
    });
  }

  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 14
  });

  const started = Date.now();

  try {
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

    return res.json({ sessionKey, mode: "AI", reply });
  } catch (error: any) {
    const message = String(error?.message || error || "");
    const quotaExceeded = /quota|rate.?limit|resource_exhausted|429|free_tier_requests/i.test(message);

    console.error("Nexora widget AI reply failed", {
      assistantId: widget.assistant.id,
      conversationId: conversation.id,
      quotaExceeded,
      error: message
    });

    if (quotaExceeded) {
      const systemMessage = "المساعد الذكي مشغول حاليًا بسبب حد الاستخدام. تم تحويل المحادثة تلقائيًا إلى فريق الدعم، وسيتمكن الموظف من رؤية رسائلك السابقة والرد عليك من نفس المحادثة.";

      await prisma.$transaction([
        prisma.assistantMessage.create({
          data: { conversationId: conversation.id, role: "user", content: body.message }
        }),
        prisma.assistantMessage.create({
          data: { conversationId: conversation.id, role: "system", content: systemMessage }
        }),
        prisma.assistantConversation.update({
          where: { id: conversation.id },
          data: {
            handoffStatus: "WAITING",
            handoffRequestedAt: conversation.handoffRequestedAt || new Date(),
            status: "OPEN",
            lastMessageAt: new Date()
          }
        })
      ]);

      return res.status(202).json({
        sessionKey,
        mode: "WAITING",
        aiUnavailable: true,
        reply: systemMessage
      });
    }

    await prisma.$transaction([
      prisma.assistantMessage.create({
        data: { conversationId: conversation.id, role: "user", content: body.message }
      }),
      prisma.assistantConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), status: "OPEN" }
      })
    ]);

    return res.status(502).json({
      error: "تعذر الحصول على رد من المساعد الآن. يمكنك طلب موظف من الزر الموجود أعلى المحادثة.",
      code: "AI_PROVIDER_ERROR",
      canHandoff: true,
      sessionKey
    });
  }
});


publicAssistantRouter.post("/widget/:publicKey/handoff", async (req, res) => {
  const body = z.object({
    sessionKey: z.string().max(200).optional(),
    visitorId: z.string().max(200).optional(),
    visitorName: z.string().max(120).optional(),
    visitorEmail: z.string().email().max(200).optional().or(z.literal("")),
    pageUrl: z.string().url().max(2000).optional(),
    reason: z.string().max(1000).optional()
  }).parse(req.body || {});

  const validated = await validateWidgetRequest(req, String(req.params.publicKey));
  if ("error" in validated) return res.status(validated.error.status).json({ error: validated.error.message });
  const { widget, domain } = validated;
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

  const firstRequest = conversation.handoffStatus === "AI";
  const updated = await prisma.assistantConversation.update({
    where: { id: conversation.id },
    data: {
      handoffStatus: "WAITING",
      handoffRequestedAt: conversation.handoffRequestedAt || new Date(),
      status: "OPEN",
      lastMessageAt: new Date()
    }
  });
  if (firstRequest) {
    await prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: "system",
        content: body.reason ? `طلب الزائر التواصل مع موظف: ${body.reason}` : "طلب الزائر التواصل مع موظف."
      }
    });
  }
  res.json({ sessionKey, handoffStatus: updated.handoffStatus, message: "تم تحويل المحادثة إلى فريق الدعم." });
});

publicAssistantRouter.get("/widget/:publicKey/session/:sessionKey", async (req, res) => {
  const validated = await validateWidgetRequest(req, String(req.params.publicKey));
  if ("error" in validated) return res.status(validated.error.status).json({ error: validated.error.message });
  const { widget } = validated;
  const conversation = await prisma.assistantConversation.findFirst({
    where: { assistantId: widget.assistant.id, sessionKey: String(req.params.sessionKey) },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } }
  });
  if (!conversation) return res.status(404).json({ error: "جلسة المحادثة غير موجودة" });
  res.json({
    id: conversation.id,
    status: conversation.status,
    handoffStatus: conversation.handoffStatus,
    agentDisplayName: conversation.agentDisplayName,
    messages: conversation.messages
  });
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
