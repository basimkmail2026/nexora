# Deploy Nexora 2.0 Foundation

## Recommended upgrade

1. Download and extract this archive.
2. Open Terminal inside the extracted folder.
3. Run:

```bash
chmod +x install-v2-over-existing.sh
./install-v2-over-existing.sh ~/Downloads/nexora-v1.5-stage6
```

The script copies the new release over the existing Git repository while preserving `.git`, then commits and pushes it.

## What happens on Render

The existing Render configuration runs:

```bash
npm run db:prepare && npm run start
```

`db:prepare` performs Prisma `db push` and seed, creating the new tables and initial official Nexora knowledge.

## Test checklist

- Log in and open the redesigned workspace.
- Confirm `/admin` access through the Admin Console button for an admin account.
- Add an official knowledge item and ask Nexora about it.
- Upload a JPG/PNG and ask for analysis.
- Upload PDF/DOCX/TXT/CSV/JSON and ask for a summary.
- Confirm fenced code/text responses show a dedicated Copy button.
- Test Arabic and English interface direction.

## Production storage warning

Render free instances use ephemeral disk. Uploaded files can disappear after a restart or redeploy. Before customer launch, configure persistent object storage.
