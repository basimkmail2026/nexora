import { NextFunction, Request, Response } from "express";
import crypto from "crypto";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = String(req.headers["x-request-id"] || crypto.randomUUID());
  res.setHeader("x-request-id", id);
  (req as any).requestId = id;
  next();
}

export function noStoreSensitive(req: Request, res: Response, next: NextFunction) {
  if (/\/api\/(auth|admin|billing)/.test(req.path)) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}
