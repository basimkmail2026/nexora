import { env } from "../../config/env.js";
import { decryptJson } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";

type ChatMessage = { role: string; content: string };

type GeminiSecretConfig = {
  apiKey?: string;
  baseUrl?: string;
};

type GeminiPublicSettings = {
  model?: string;
  systemInstruction?: string;
};

function normalizeGeminiContents(messages: ChatMessage[]) {
  const normalized = messages
    .filter(message => message.content?.trim())
    .map(message => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content.trim() }]
    }));

  const merged: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];

  for (const message of normalized) {
    const last = merged[merged.length - 1];

    if (last?.role === message.role) {
      last.parts[0].text += `\n${message.parts[0].text}`;
    } else {
      merged.push(message);
    }
  }

  while (merged.length && merged[merged.length - 1].role === "model") {
    merged.pop();
  }

  if (!merged.length || merged[merged.length - 1].role !== "user") {
    throw new Error("يجب أن تنتهي المحادثة برسالة من المستخدم");
  }

  return merged;
}

export async function generateReply(messages: ChatMessage[]) {
  const connection = await prisma.serviceConnection.findUnique({
    where: { code: "gemini" }
  });

  const secrets = connection?.configCipher
    ? decryptJson<GeminiSecretConfig>(connection.configCipher) || {}
    : {};

  const settings = (connection?.publicSettings || {}) as GeminiPublicSettings;

  const apiKey = secrets.apiKey || env.GEMINI_API_KEY;
  const model = settings.model || env.GEMINI_MODEL;
  const baseUrl = (
    secrets.baseUrl || "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/+$/, "");

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
        contents: normalizeGeminiContents(messages)
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
