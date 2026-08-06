import { prisma } from "../../lib/prisma.js";

function normalizeWords(question: string) {
  return Array.from(new Set(
    question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2)
  )).slice(0, 16);
}

export async function getAssistantContext(assistantId: string, question: string) {
  const words = normalizeWords(question);

  const [chunks, faqs] = await Promise.all([
    prisma.documentChunk.findMany({
      where: {
        document: {
          status: "READY",
          knowledgeBase: { assistantId }
        }
      },
      select: { content: true },
      take: 160
    }),
    prisma.faqItem.findMany({
      where: { assistantId, enabled: true },
      select: { question: true, answer: true },
      take: 120
    })
  ]);

  const score = (text: string) => words.reduce(
    (total, word) => total + (text.toLowerCase().includes(word) ? 1 : 0),
    0
  );

  const matches = [
    ...faqs.map(item => ({
      content: `سؤال: ${item.question}\nجواب: ${item.answer}`,
      score: score(`${item.question} ${item.answer}`) + 1
    })),
    ...chunks.map(item => ({ content: item.content, score: score(item.content) }))
  ]
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return matches.map(item => item.content).join("\n\n---\n\n");
}
