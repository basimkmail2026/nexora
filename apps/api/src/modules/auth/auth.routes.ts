import { Router } from "express";
import argon2 from "argon2";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { hashIp, randomToken, sha256, signAccessToken, signRefreshToken } from "../../lib/security.js";
import { sendMail } from "../../lib/mailer.js";
import { AuthRequest, requireAuth } from "../../middleware/auth.js";
import { env } from "../../config/env.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

async function issueSession(user: { id: string; role: string }, req: any) {
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, role: user.role });
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      userAgent: req.headers["user-agent"],
      ipHash: hashIp(req.ip),
      expiresAt: new Date(Date.now() + 30 * 86400000)
    }
  });
  return { accessToken, refreshToken };
}

authRouter.post("/guest", async (req, res) => {
  const fingerprint = String(req.body?.fingerprint || "").trim();
  if (fingerprint.length < 12) return res.status(400).json({ error: "بصمة الجهاز غير صالحة" });

  const limits = await prisma.appSetting.findUnique({ where: { key: "guest_limits" } });
  const config = (limits?.value || { messages: 10, hours: 24 }) as any;

  const guest = await prisma.guest.upsert({
    where: { fingerprint },
    update: {},
    create: {
      fingerprint,
      ipHash: hashIp(req.ip),
      expiresAt: new Date(Date.now() + Number(config.hours || 24) * 3600000)
    }
  });

  res.json({ guestId: guest.id, remaining: Math.max(0, Number(config.messages || 10) - guest.usageCount) });
});

authRouter.post("/register", async (req, res) => {
  const data = credentials.extend({ displayName: z.string().min(2).max(60).optional() }).parse(req.body);
  const email = data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: "البريد مستخدم مسبقًا" });
  }

  const freePlan = await prisma.plan.findUnique({ where: { code: "free" } });
  const user = await prisma.user.create({
    data: {
      email,
      displayName: data.displayName,
      passwordHash: await argon2.hash(data.password),
      planId: freePlan?.id
    }
  });

  const session = await issueSession(user, req);
  res.status(201).json({ user: { id: user.id, email: user.email, role: user.role }, ...session });
});

authRouter.post("/login", async (req, res) => {
  const data = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user || !(await argon2.verify(user.passwordHash, data.password))) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  if (user.status !== "ACTIVE") return res.status(403).json({ error: "الحساب غير متاح" });

  if (user.twoFactorEnabled) {
    const challenge = signAccessToken({ userId: user.id, role: user.role, purpose: "2fa" });
    return res.json({ requiresTwoFactor: true, challenge });
  }

  res.json({ user: { id: user.id, email: user.email, role: user.role }, ...(await issueSession(user, req)) });
});

authRouter.post("/login/2fa", async (req, res) => {
  const body = z.object({ challenge: z.string(), code: z.string().length(6) }).parse(req.body);
  const payload = (await import("../../lib/security.js")).verifyToken<any>(body.challenge);
  if (payload.purpose !== "2fa") return res.status(400).json({ error: "طلب غير صالح" });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user?.twoFactorSecret || !authenticator.check(body.code, user.twoFactorSecret)) {
    return res.status(401).json({ error: "رمز التحقق غير صحيح" });
  }
  res.json({ user: { id: user.id, email: user.email, role: user.role }, ...(await issueSession(user, req)) });
});

authRouter.post("/forgot-password", async (req, res) => {
  const email = z.string().email().parse(req.body?.email).toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    const raw = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 30 * 60000)
      }
    });
    const url = `${env.APP_URL}/reset-password?token=${raw}`;
    await sendMail({
      to: user.email,
      subject: "استعادة كلمة مرور نكسورا",
      html: `<p>اضغط الرابط لتغيير كلمة المرور. الرابط صالح لمدة 30 دقيقة.</p><p><a href="${url}">${url}</a></p>`
    });
  }

  res.json({ ok: true, message: "إذا كان البريد مسجلًا، أرسلنا رابط الاستعادة." });
});

authRouter.post("/reset-password", async (req, res) => {
  const body = z.object({ token: z.string(), password: z.string().min(8) }).parse(req.body);
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    return res.status(400).json({ error: "الرابط منتهي أو مستخدم" });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: await argon2.hash(body.password) }
    }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);

  res.json({ ok: true });
});


authRouter.post("/refresh", async (req, res) => {
  const refreshToken = z.string().min(20).parse(req.body?.refreshToken);
  const session = await prisma.session.findFirst({
    where: {
      tokenHash: sha256(refreshToken),
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });
  if (!session) return res.status(401).json({ error: "جلسة التحديث غير صالحة" });
  const accessToken = signAccessToken({ userId: session.user.id, role: session.user.role });
  res.json({ accessToken });
});

authRouter.post("/logout", requireAuth, async (req: AuthRequest, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { userId: req.auth!.userId, tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
  res.json({ ok: true });
});

authRouter.post("/login/backup-code", async (req, res) => {
  const body = z.object({ challenge: z.string(), code: z.string().min(6) }).parse(req.body);
  const payload = (await import("../../lib/security.js")).verifyToken<any>(body.challenge);
  if (payload.purpose !== "2fa") return res.status(400).json({ error: "طلب غير صالح" });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

  const codeHash = sha256(body.code.trim().toUpperCase());
  if (!user.backupCodesHash.includes(codeHash)) {
    return res.status(401).json({ error: "الرمز الاحتياطي غير صحيح" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { backupCodesHash: user.backupCodesHash.filter(x => x !== codeHash) }
  });

  res.json({ user: { id: user.id, email: user.email, role: user.role }, ...(await issueSession(user, req)) });
});


authRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: {
      id: true, email: true, displayName: true, role: true, status: true,
      twoFactorEnabled: true, usageCount: true, plan: true, createdAt: true
    }
  });
  res.json(user);
});

authRouter.post("/2fa/setup", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(user.email, "Nexora", secret);
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
  res.json({ qrCode: await QRCode.toDataURL(uri), secret });
});

authRouter.post("/2fa/enable", requireAuth, async (req: AuthRequest, res) => {
  const code = z.string().length(6).parse(req.body?.code);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (!user.twoFactorSecret || !authenticator.check(code, user.twoFactorSecret)) {
    return res.status(400).json({ error: "رمز التحقق غير صحيح" });
  }
  const backupCodes = Array.from({ length: 8 }, () => randomToken(4).toUpperCase());
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true, backupCodesHash: backupCodes.map(sha256) }
  });
  res.json({ enabled: true, backupCodes });
});

authRouter.post("/2fa/disable", requireAuth, async (req: AuthRequest, res) => {
  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, backupCodesHash: [] }
  });
  res.json({ disabled: true });
});

authRouter.get("/sessions", requireAuth, async (req: AuthRequest, res) => {
  res.json(await prisma.session.findMany({
    where: { userId: req.auth!.userId, revokedAt: null },
    select: { id: true, userAgent: true, createdAt: true, expiresAt: true }
  }));
});

authRouter.delete("/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
  await prisma.session.updateMany({
    where: { id: String(req.params.id), userId: req.auth!.userId },
    data: { revokedAt: new Date() }
  });
  res.json({ ok: true });
});
