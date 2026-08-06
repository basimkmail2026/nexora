# Nexora 3.0.4 TypeScript Build Fix

Fixed the live session loader return union in `public.routes.ts`.

The validation error is now wrapped explicitly, so TypeScript can safely narrow the result to either:
- `{ error }`
- `{ conversation }`

This resolves TS2339 on `loaded.conversation` without removing the reliable live-sync behavior.
