import { prisma } from "../../lib/prisma.js";

function dayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function recordAssistantUsage(input: {
  assistantId: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  fallback?: boolean;
  estimatedCost?: number;
}) {
  const date = dayStart();
  const current = await prisma.assistantAnalyticsDaily.findUnique({
    where: { assistantId_date: { assistantId: input.assistantId, date } }
  });

  const oldMessages = current?.messages || 0;
  const newMessages = oldMessages + 1;
  const avgLatencyMs = Math.round(
    (((current?.avgLatencyMs || 0) * oldMessages) + input.latencyMs) / newMessages
  );

  await prisma.assistantAnalyticsDaily.upsert({
    where: { assistantId_date: { assistantId: input.assistantId, date } },
    update: {
      messages: { increment: 1 },
      conversations: { increment: 1 },
      inputTokens: { increment: input.inputTokens || 0 },
      outputTokens: { increment: input.outputTokens || 0 },
      avgLatencyMs,
      successfulAnswers: { increment: input.fallback ? 0 : 1 },
      fallbackAnswers: { increment: input.fallback ? 1 : 0 },
      estimatedCost: { increment: input.estimatedCost || 0 }
    },
    create: {
      assistantId: input.assistantId,
      date,
      messages: 1,
      conversations: 1,
      inputTokens: input.inputTokens || 0,
      outputTokens: input.outputTokens || 0,
      avgLatencyMs: input.latencyMs,
      successfulAnswers: input.fallback ? 0 : 1,
      fallbackAnswers: input.fallback ? 1 : 0,
      estimatedCost: input.estimatedCost || 0
    }
  });
}
