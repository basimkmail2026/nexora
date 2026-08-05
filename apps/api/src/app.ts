import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { assistantRouter } from "./modules/assistants/assistant.routes.js";
import { publicAssistantRouter } from "./modules/assistants/public.routes.js";
import { billingRouter } from "./modules/billing/billing.routes.js";
import { adminBillingRouter } from "./modules/billing/admin-billing.routes.js";
import { webhookRouter } from "./modules/billing/webhook.routes.js";
import { marketplaceRouter } from "./modules/marketplace/marketplace.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { whiteLabelRouter } from "./modules/white-label/white-label.routes.js";
import { voiceRouter } from "./modules/voice/voice.routes.js";
import { apiLog } from "./middleware/api-log.js";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { requestId, noStoreSensitive } from "./middleware/security.js";
import { connectionsRouter } from "./modules/connections/connections.routes.js";
import { systemRouter } from "./modules/system/system.routes.js";

export const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set("trust proxy", 1);
app.use(requestId);
app.use(pinoHttp({ logger }));
app.use(noStoreSensitive);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.CORS_ORIGIN.split(","), credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.use("/api", apiLog);

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/admin", adminRouter);
app.use("/api/assistants", assistantRouter);
app.use("/api/public/assistants", publicAssistantRouter);
app.use("/api/billing", billingRouter);
app.use("/api/admin/billing", adminBillingRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api/marketplace", marketplaceRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/white-label", whiteLabelRouter);
app.use("/api/voice", voiceRouter);
app.use("/api/admin/connections", connectionsRouter);
app.use("/api/admin/system", systemRouter);

if (env.NODE_ENV === "production") {
  const webDist = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  if (err?.name === "ZodError") {
    return res.status(400).json({ error: "البيانات غير صحيحة", details: err.issues });
  }
  res.status(500).json({ error: err?.message || "خطأ داخلي" });
});
