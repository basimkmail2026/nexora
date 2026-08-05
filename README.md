# Nexora | نكسورا — v1.5 Stage 6 Release Candidate

هذه مرحلة الإنتاج والتجهيز للإطلاق، وتبني على كل المراحل السابقة.

## الجديد

- إدارة جميع الاتصالات الخارجية من لوحة التحكم:
  - Gemini
  - OpenAI
  - PayPal
  - Binance Pay
  - بنك فلسطين
  - البنك العربي
  - SMTP
  - التخزين السحابي
  - Redis
- تخزين الأسرار مشفرًا.
- زر اختبار اتصال لكل خدمة.
- Test / Live mode.
- حالة الاتصال وآخر خطأ.
- Redis Cache اختياري.
- Queue abstraction مع fallback.
- Embeddings service.
- ملف pgvector SQL.
- سجلات API مع Request ID.
- Pino logging مع إخفاء الأسرار.
- Health dashboard.
- مهام نسخ احتياطي.
- Dockerfile وdocker-compose.
- بداية اختبارات آلية.
- إعدادات التخزين السحابي والـEmbedding من البيئة ولوحة التحكم.

## مهم جدًا

هذه نسخة Release Candidate وليست ضمانًا أن كل مزود دفع يعمل Live من دون مواصفات حساب التاجر.
اللوحة والكود جاهزان لاستقبال المفاتيح، لكن كل بنك أو بوابة قد تملك:
- عناوين API مختلفة
- صيغة توقيع مختلفة
- Webhook مختلف
- متطلبات اعتماد أو IP whitelist

لذلك موصل كل مزود يحتاج ضبطه حسب الوثائق الرسمية التي يعطيها المزود لحسابك.

## تشغيل Docker

```bash
docker compose up --build
```

ثم نفذ migration/seed داخل الحاوية:

```bash
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

## تفعيل pgvector

نفذ محتوى:

```text
apps/api/prisma/pgvector.sql
```

على قاعدة PostgreSQL بعد تفعيل الامتداد.

## ما تبقى قبل الإطلاق الفعلي

- اختبار المشروع على Render وقاعدة بيانات حقيقية.
- إدخال مفاتيح الخدمات من لوحة التحكم.
- ضبط موصلات الدفع حسب وثائق حساب التاجر.
- إعداد التخزين السحابي الفعلي.
- تشغيل pgvector وإعادة فهرسة الملفات.
- اختبارات end-to-end.
- اختبار اختراق ومراجعة قانونية وسياسة خصوصية.
