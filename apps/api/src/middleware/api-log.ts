import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { hashIp } from "../lib/security.js";

export function apiLog(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  res.on("finish", () => {
    prisma.apiUsageLog.create({
      data: {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        latencyMs: Date.now() - started,
        ipHash: hashIp(req.ip),
        userAgent: req.headers["user-agent"]
      }
    }).catch(() => {});
  });
  next();
}
