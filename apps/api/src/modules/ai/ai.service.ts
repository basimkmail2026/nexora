import { env } from "../../config/env.js";
import { decryptJson } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";

type GeminiSecretConfig = {
  apiKey?: string;
  baseUrl?: string;
};

type GeminiPublicSettings = {
  model?: string;
  systemInstruction?: string;
};

export async function generateReply(messages: Array<{ role: string; content: string }>) {
  const connection = await prisma.serviceConnection.findUnique({
    where: { code: "gemini" }
  });

  const secrets = connection?.configCipher
    ? decryptJson<GeminiSecretConfig>(connection.configCipher) || {}
    : {};

  const settings = (connection?.publicSettings || {}) as GeminiPublicSettings;

  const apiKey = secrets.apiKey || env.GEMINI_API_KEY;
  const model = settings.model || env.GEMINI_MODEL;
  const baseUrl =
    secrets.baseUrl?.replace(/\/+$/, "") ||
    "https://generativelanguage.googleapis.com/v1beta";

  if (connection && !connection.enabled) {
    throw new Error("مزود Gemini غير مفعّل من لوحة التحكم");
  }

  if (!apiKey) {
    throw new Error("مفتاح Gemini غير مضبوط من لوحة التحكم أو Render");
  }

  if (!model) {
    throw new Error("موديل Gemini غير مضبوط");
  }

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              settings.systemInstruction ||
              "أنت مساعد نكسورا. أجب بلغة المستخدم بوضوح ودقة."
          }]
        },
        contents: messages.map(message => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        }))
      })
    }
  );

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `فشل Gemini: HTTP ${response.status}`);
  }

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text || "")
      .join("")
      .trim() || "لم أتمكن من تجهيز الرد."
  );
}
