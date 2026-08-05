import { env } from "../../config/env.js";

export async function createEmbedding(text: string): Promise<number[] | null> {
  if (env.EMBEDDING_PROVIDER !== "gemini" || !env.GEMINI_API_KEY) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.EMBEDDING_MODEL)}:embedContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${env.EMBEDDING_MODEL}`,
        content: { parts: [{ text }] }
      })
    }
  );

  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Embedding request failed");
  return data?.embedding?.values || null;
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb) || 1);
}
