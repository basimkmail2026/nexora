import fs from "fs/promises";
import { env } from "../../config/env.js";
import { decryptJson } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";

export type ChatMessage = { role: string; content: string };
export type AiAttachment = {
  originalName: string;
  mimeType: string;
  storagePath: string;
  extractedText?: string | null;
};

type GeminiSecretConfig = { apiKey?: string; baseUrl?: string };
type GeminiPublicSettings = { model?: string; systemInstruction?: string };

function normalizeGeminiContents(messages: ChatMessage[]) {
  const normalized = messages
    .filter(message => message.content?.trim())
    .map(message => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content.trim() }]
    }));

  const merged: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const message of normalized) {
    const last = merged[merged.length - 1];
    if (last?.role === message.role) last.parts[0].text += `\n${message.parts[0].text}`;
    else merged.push(message);
  }
  while (merged.length && merged[merged.length - 1].role === "model") merged.pop();
  if (!merged.length || merged[merged.length - 1].role !== "user") {
    throw new Error("يجب أن تنتهي المحادثة برسالة من المستخدم");
  }
  return merged;
}

async function attachmentParts(attachments: AiAttachment[]) {
  const parts: any[] = [];
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/") && attachment.mimeType !== "image/svg+xml") {
      const data = await fs.readFile(attachment.storagePath);
      if (data.length <= 12 * 1024 * 1024) {
        parts.push({ inlineData: { mimeType: attachment.mimeType, data: data.toString("base64") } });
        parts.push({ text: `Image filename: ${attachment.originalName}` });
      }
    } else if (attachment.extractedText) {
      parts.push({ text: `\n--- FILE: ${attachment.originalName} ---\n${attachment.extractedText.slice(0, 80_000)}\n--- END FILE ---` });
    } else if (attachment.mimeType.startsWith("video/") || attachment.mimeType.startsWith("audio/")) {
      parts.push({ text: `The user attached ${attachment.originalName} (${attachment.mimeType}). The media is stored, but direct transcription is not enabled yet. Explain this honestly and ask what analysis they need.` });
    }
  }
  return parts;
}

export async function generateReply(
  messages: ChatMessage[],
  options: { systemContext?: string; attachments?: AiAttachment[] } = {}
) {
  const connection = await prisma.serviceConnection.findUnique({ where: { code: "gemini" } });
  const secrets = connection?.configCipher ? decryptJson<GeminiSecretConfig>(connection.configCipher) || {} : {};
  const settings = (connection?.publicSettings || {}) as GeminiPublicSettings;
  const apiKey = secrets.apiKey || env.GEMINI_API_KEY;
  const model = settings.model || env.GEMINI_MODEL;
  const baseUrl = (secrets.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");

  if (connection && !connection.enabled) throw new Error("مزود Gemini غير مفعّل من لوحة التحكم");
  if (!apiKey) throw new Error("مفتاح Gemini غير مضبوط من لوحة التحكم أو Render");
  if (!model) throw new Error("موديل Gemini غير مضبوط");

  const contents = normalizeGeminiContents(messages);
  const extraParts = await attachmentParts(options.attachments || []);
  if (extraParts.length) contents[contents.length - 1].parts.push(...extraParts);

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              settings.systemInstruction || "You are Nexora, a helpful multilingual AI assistant.",
              "Reply in the user's language unless they request another language.",
              "When giving copy-ready text, code, an email, a prompt, or a template, place it in a fenced code block so the interface can show a dedicated Copy button.",
              options.systemContext || ""
            ].filter(Boolean).join("\n\n")
          }]
        },
        contents,
        generationConfig: { temperature: 0.65, maxOutputTokens: 2200 }
      })
    }
  );

  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `فشل Gemini: HTTP ${response.status}`);
  return data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("").trim() || "لم أتمكن من تجهيز الرد.";
}
