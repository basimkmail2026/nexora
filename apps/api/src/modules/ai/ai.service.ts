import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

export async function generateReply(messages: Array<{ role: string; content: string }>) {
  const provider = await prisma.aiProvider.findFirst({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  if (!provider) throw new Error("لا يوجد مزود ذكاء اصطناعي مفعّل");

  if (provider.type === "GEMINI") {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("مفتاح Gemini غير مضبوط");
    const model = env.GEMINI_MODEL;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "أنت مساعد نكسورا. أجب بلغة المستخدم بوضوح." }] },
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        })
      }
    );

    const data: any = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "فشل Gemini");
    return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("").trim()
      || "ما قدرت أجهز الرد.";
  }

  throw new Error("هذا المزود لسه بحاجة إلى موصل");
}
