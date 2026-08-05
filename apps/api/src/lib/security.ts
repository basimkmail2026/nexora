import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const randomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

export const signAccessToken = (payload: object) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });

export const signRefreshToken = (payload: object) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: "30d" });

export const verifyToken = <T>(token: string) =>
  jwt.verify(token, env.JWT_SECRET) as T;

export const hashIp = (ip?: string) => ip ? sha256(ip) : undefined;
