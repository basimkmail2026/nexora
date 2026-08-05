import { redis } from "./redis.js";

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis || redis.status !== "ready") return null;
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) as T : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300) {
  if (!redis || redis.status !== "ready") return;
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function cacheDelete(pattern: string) {
  if (!redis || redis.status !== "ready") return;
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}
