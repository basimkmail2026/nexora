# Nexora 3.0.3 — Reliable Live Sync

## Fixed

- Employee replies now use a POST live-sync endpoint instead of relying on a GET request and browser referrer headers.
- The external website URL is sent in the polling request body, so allowed-domain validation works even when the host site uses `Referrer-Policy: no-referrer`.
- Live replies are returned with strict no-cache headers for browser and CDN layers.
- The old GET session endpoint remains available for backward compatibility.
- Widget JavaScript syntax was checked successfully with Node.js.

## Important

Gemini quota cannot be bypassed in application code. When the configured Google project has quota available, AI replies use Gemini. When quota is exhausted, the conversation can be handed to an employee. A paid Gemini project or a configured fallback AI provider is required for uninterrupted AI service.
