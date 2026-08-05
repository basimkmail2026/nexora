import { PrismaClient, UserRole } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@nexora.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisImmediately123!";
  const passwordHash = await argon2.hash(adminPassword);

  const free = await prisma.plan.upsert({
    where: { code: "free" },
    update: {},
    create: {
      code: "free",
      nameAr: "مجانية",
      nameEn: "Free",
      messageLimit: 50,
      voiceMinutes: 10,
      assistantLimit: 1
    }
  });

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: { role: UserRole.SUPER_ADMIN },
    create: {
      email: adminEmail.toLowerCase(),
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      planId: free.id,
      emailVerifiedAt: new Date()
    }
  });

  const settings = [
    ["brand", { nameAr: "نكسورا", nameEn: "Nexora" }],
    ["guest_limits", { messages: 10, hours: 24 }],
    ["security", { requireAdmin2FA: false, resetTokenMinutes: 30 }],
    ["company_email", {
      companyName: process.env.COMPANY_NAME || "Nexora",
      fromEmail: process.env.COMPANY_EMAIL || "no-reply@nexora.local",
      supportEmail: process.env.COMPANY_EMAIL || "support@nexora.local"
    }]
  ] as const;

  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  for (const [code, name] of [
    ["bank_palestine", "Bank of Palestine"],
    ["arab_bank", "Arab Bank"],
    ["paypal", "PayPal"],
    ["binance_pay", "Binance Pay"]
  ]) {
    await prisma.paymentGateway.upsert({
      where: { code },
      update: {},
      create: { code, name }
    });
  }

  await prisma.aiProvider.upsert({
    where: { id: "gemini-default" },
    update: {},
    create: {
      id: "gemini-default",
      name: "Google Gemini",
      type: "GEMINI",
      enabled: true,
      defaultModel: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    }
  });

  for (const plan of [
    { code: "pro", nameAr: "احترافية", nameEn: "Pro", priceMonthly: 19, priceYearly: 190, messageLimit: 5000, voiceMinutes: 600, assistantLimit: 10 },
    { code: "business", nameAr: "أعمال", nameEn: "Business", priceMonthly: 59, priceYearly: 590, messageLimit: 25000, voiceMinutes: 3000, assistantLimit: 50 },
    { code: "enterprise", nameAr: "شركات", nameEn: "Enterprise", priceMonthly: 199, priceYearly: 1990, messageLimit: 100000, voiceMinutes: 10000, assistantLimit: 500 }
  ]) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: {}, create: plan });
  }

  for (const currency of [
    { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
    { code: "ILS", name: "Israeli New Shekel", symbol: "₪", decimals: 2 },
    { code: "JOD", name: "Jordanian Dinar", symbol: "د.أ", decimals: 3 }
  ]) {
    await prisma.currency.upsert({ where: { code: currency.code }, update: {}, create: currency });
  }
  for (const voice of [
    { code: "ar-young-male", nameAr: "شاب", nameEn: "Young Male", provider: "browser", voiceId: "browser-ar-male", gender: "male", ageGroup: "young", language: "ar" },
    { code: "ar-young-female", nameAr: "صبية", nameEn: "Young Female", provider: "browser", voiceId: "browser-ar-female", gender: "female", ageGroup: "young", language: "ar" },
    { code: "ar-senior-male", nameAr: "رجل كبير", nameEn: "Senior Male", provider: "browser", voiceId: "browser-ar-senior-male", gender: "male", ageGroup: "senior", language: "ar" },
    { code: "ar-senior-female", nameAr: "امرأة كبيرة", nameEn: "Senior Female", provider: "browser", voiceId: "browser-ar-senior-female", gender: "female", ageGroup: "senior", language: "ar" }
  ]) {
    await prisma.voiceProfile.upsert({ where: { code: voice.code }, update: {}, create: voice });
  }

  await prisma.appSetting.upsert({
    where: { key: "marketplace_categories" },
    update: {},
    create: { key: "marketplace_categories", value: ["دعم العملاء","المبيعات","التعليم","البرمجة","المحاسبة","المطاعم","العيادات"] }
  });
  for (const connection of [
    { code: "gemini", name: "Google Gemini", kind: "AI" as const },
    { code: "openai", name: "OpenAI", kind: "AI" as const },
    { code: "paypal", name: "PayPal", kind: "PAYMENT" as const },
    { code: "binance_pay", name: "Binance Pay", kind: "PAYMENT" as const },
    { code: "bank_palestine", name: "Bank of Palestine", kind: "PAYMENT" as const },
    { code: "arab_bank", name: "Arab Bank", kind: "PAYMENT" as const },
    { code: "smtp", name: "Company Email SMTP", kind: "EMAIL" as const },
    { code: "object_storage", name: "Object Storage", kind: "STORAGE" as const },
    { code: "redis", name: "Redis Cache", kind: "CACHE" as const }
  ]) {
    await prisma.serviceConnection.upsert({
      where: { code: connection.code },
      update: {},
      create: { ...connection, enabled: false }
    });
  }
}

main().finally(() => prisma.$disconnect());
