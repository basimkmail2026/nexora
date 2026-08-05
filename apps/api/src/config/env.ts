import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  ENCRYPTION_KEY: z.string().min(16),
  APP_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default("false").transform(v => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  COMPANY_EMAIL: z.string().default("no-reply@nexora.local"),
  COMPANY_NAME: z.string().default("Nexora"),
  REDIS_URL: z.string().optional(),
  OBJECT_STORAGE_PROVIDER: z.string().default("local"),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  OBJECT_STORAGE_REGION: z.string().optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().optional(),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.string().default("gemini"),
  EMBEDDING_MODEL: z.string().default("text-embedding-004"),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  BACKUP_ENABLED: z.string().default("false").transform(v => v === "true")
});

export const env = schema.parse(process.env);
