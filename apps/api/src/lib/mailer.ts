import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export async function sendMail(input: { to: string; subject: string; html: string }) {
  const setting = await prisma.appSetting.findUnique({ where: { key: "company_email" } });
  const config = (setting?.value || {}) as Record<string, string>;

  if (!env.SMTP_HOST) {
    console.log("[DEV MAIL]", { to: input.to, subject: input.subject, html: input.html });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });

  await transporter.sendMail({
    from: `"${config.companyName || env.COMPANY_NAME}" <${config.fromEmail || env.COMPANY_EMAIL}>`,
    ...input
  });
}
