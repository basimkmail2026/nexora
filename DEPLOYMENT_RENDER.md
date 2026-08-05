# نشر Nexora على Render

## ما تغيّر في النسخة المستقرة

- يتم إنشاء مخطط قاعدة البيانات تلقائيًا عند بدء الخدمة عبر `npm run db:prepare`.
- يتم تشغيل Seed آمن ومتكرر لإنشاء أو تحديث حساب المدير والباقات والإعدادات الأساسية.
- لا تحتاج إلى Render Shell.
- مسار واجهة الويب مصحح إلى `apps/web/dist`.
- البناء لا يتجاهل أخطاء TypeScript.

## متغيرات Render المطلوبة

- `DATABASE_URL`: Internal Database URL من PostgreSQL على Render.
- `APP_URL`: رابط الخدمة، مثال `https://nexora-4uva.onrender.com`.
- `CORS_ORIGIN`: نفس قيمة `APP_URL`.
- `ADMIN_EMAIL`: بريد المدير.
- `ADMIN_PASSWORD`: كلمة مرور قوية.
- `GEMINI_API_KEY`: اختياري ويمكن تركه فارغًا أولًا.

## أوامر Render

- Build: `npm install --include=dev && npm run db:generate && npm run build`
- Start: `npm run db:prepare && npm run start`

عند كل تشغيل، ينفذ Prisma `db push` ثم Seed قبل تشغيل الخادم.
