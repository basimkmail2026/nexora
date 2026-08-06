# Nexora 3.0.2 — Live AI and Employee Reply Stability

This release fixes the live employee reply channel used by embedded widgets.

- Disables ETag caching globally for dynamic API responses.
- Adds explicit no-store headers to widget config and session endpoints.
- Adds a cache-busting timestamp to every widget session poll.
- Polls every 1.5 seconds and refreshes immediately after handoff/chat actions.
- Refreshes on browser focus and visibility changes.
- Preserves AI replies whenever Gemini quota is available.
- When Gemini quota is exhausted, the same conversation is transferred to an employee.
