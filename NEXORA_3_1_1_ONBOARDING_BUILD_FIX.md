# Nexora 3.1.1 — Onboarding TypeScript Build Fix

تم إصلاح خطأ TypeScript في إنشاء طلبات إعداد المساعد عبر استبدال نشر كائن Zod (`...body`) بتعيين صريح للحقول المطلوبة في Prisma.

الملف المعدل:
- `apps/api/src/modules/onboarding/onboarding.routes.ts`

هذا الإصلاح يحافظ على جميع مزايا Nexora 3.1 السابقة.
