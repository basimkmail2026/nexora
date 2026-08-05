# Nexora 2.0 Foundation

This release reorganizes Nexora around two clearly separated experiences:

- **User workspace:** multilingual chat, conversation history, assistant tools, billing, marketplace, analytics, settings, file/image uploads, and copy-ready response cards.
- **Admin console:** platform metrics, official Nexora knowledge, and AI/service connections.

## Included in this foundation

- Automatic Arabic/English device-language selection with RTL/LTR support.
- Light, dark and system appearance modes.
- New professional user workspace and separate admin console.
- Official platform knowledge stored in PostgreSQL and editable by admins.
- Verified plan data injected into AI context.
- User memory models and conservative explicit-fact capture.
- Image analysis through Gemini inline data.
- Text extraction for PDF, DOCX, CSV, JSON and text files.
- Audio/video upload storage with honest processing status (full transcription pipeline remains a later milestone).
- Copy buttons for full responses and fenced copy-ready blocks.
- Multimodal attachment records linked to users and conversations.

## Deployment

Render continues to run `npm run db:prepare` before starting, so Prisma `db push` creates the new tables and the seed adds initial official knowledge.

## Important production note

Local uploads on Render's free ephemeral filesystem are suitable for testing. Before commercial launch, configure persistent object storage (S3-compatible, Cloudflare R2, etc.).
