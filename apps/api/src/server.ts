import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectRedis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";

await connectRedis();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Nexora API started");
});
