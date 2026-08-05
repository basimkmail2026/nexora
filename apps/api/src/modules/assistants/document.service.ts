import fs from "fs/promises";
import path from "path";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { parse } from "csv-parse/sync";

export async function extractText(filePath: string, mimeType: string, originalName: string) {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") {
    const result = await pdf(buffer);
    return result.text;
  }

  if (mimeType.includes("wordprocessingml") || ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType.includes("csv") || ext === ".csv") {
    const rows = parse(buffer.toString("utf-8"), { relax_column_count: true });
    return rows.map((row: unknown[]) => row.join(" | ")).join("\n");
  }

  return buffer.toString("utf-8");
}

export function chunkText(text: string, maxChars = 1800, overlap = 220) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(clean.length, start + maxChars);
    if (end < clean.length) {
      const boundary = Math.max(
        clean.lastIndexOf("\n\n", end),
        clean.lastIndexOf(". ", end),
        clean.lastIndexOf("؟ ", end)
      );
      if (boundary > start + 500) end = boundary + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks.filter(Boolean);
}
