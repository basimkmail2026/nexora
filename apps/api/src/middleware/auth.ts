import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/security.js";

export interface AuthRequest extends Request {
  auth?: { userId: string; role: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "الجلسة غير صالحة" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.auth || !["ADMIN", "SUPER_ADMIN"].includes(req.auth.role)) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  next();
}
