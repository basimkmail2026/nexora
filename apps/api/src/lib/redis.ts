import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true })
  : null;

export async function connectRedis() {
  if (!redis) return false;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.ping();
    return true;
  } catch (error) {
    logger.warn({ error }, "Redis unavailable; continuing without cache");
    return false;
  }
}
