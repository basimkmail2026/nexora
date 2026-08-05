import { redis } from "./redis.js";
import { logger } from "./logger.js";

export async function enqueue(name: string, payload: unknown) {
  if (!redis || redis.status !== "ready") {
    logger.info({ name }, "Queue fallback: executing synchronously");
    return false;
  }
  await redis.lpush(`queue:${name}`, JSON.stringify({ payload, queuedAt: new Date().toISOString() }));
  return true;
}

export async function dequeue(name: string) {
  if (!redis || redis.status !== "ready") return null;
  const raw = await redis.rpop(`queue:${name}`);
  return raw ? JSON.parse(raw) : null;
}
