import { prisma } from "../../lib/prisma.js";

export async function buildPlatformContext(locale = "ar") {
  const [plans, knowledge, settings] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { priceMonthly: "asc" } }),
    prisma.platformKnowledge.findMany({ where: { enabled: true }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 30 }),
    prisma.appSetting.findMany({ where: { key: { in: ["company_email", "platform_identity", "support_info"] } } })
  ]);

  const settingMap = Object.fromEntries(settings.map(item => [item.key, item.value]));
  const planText = plans.map(plan =>
    `- ${locale.startsWith("ar") ? plan.nameAr : plan.nameEn}: monthly=${plan.priceMonthly}, yearly=${plan.priceYearly}, messages=${plan.messageLimit}, assistants=${plan.assistantLimit}, voiceMinutes=${plan.voiceMinutes}`
  ).join("\n");

  const knowledgeText = knowledge.map(item => {
    const title = locale.startsWith("ar") ? item.titleAr : (item.titleEn || item.titleAr);
    const content = locale.startsWith("ar") ? item.contentAr : (item.contentEn || item.contentAr);
    return `## ${title}\n${content}`;
  }).join("\n\n");

  return `
You are the official Nexora assistant. Nexora was created and developed in Palestine.
Answer questions about Nexora using ONLY the verified data below. Never invent prices, limits, policies, or features.
If verified data is missing, say that the information is not currently available and offer the support channel.

CURRENT PLANS:
${planText || "No active plans configured."}

PLATFORM KNOWLEDGE:
${knowledgeText || "Nexora is an AI workspace created and developed in Palestine."}

SYSTEM SETTINGS:
${JSON.stringify(settingMap)}
`.trim();
}

export async function buildUserMemoryContext(userId: string) {
  const memories = await prisma.userMemory.findMany({
    where: { userId, active: true },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take: 20
  });

  if (!memories.length) return "";
  return `Known user preferences and context:\n${memories.map(memory => `- ${memory.key}: ${memory.value}`).join("\n")}`;
}
