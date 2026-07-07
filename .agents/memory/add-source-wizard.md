---
name: Add Source ingestion wizard
description: Durable constraints for the Brain Finance "Add Source" data-ingestion modal and its document/integration routes.
---

# Add Source ingestion wizard

The "Add Source" sidebar button opens a paginated, source-agnostic connector wizard
(`client/src/components/AddSourceModal.tsx`), NOT the old AddAccountModal.

## Constraints / decisions

- **Documents persist metadata only locally; bytes go to brain-core.** The `sourceDocuments` table
  stores name/size/mimeType/category + ingestion state (rawId/sha256/sourceType/extractStatus/
  parsedId/confidence) — never file bytes. Bytes stream to brain-core `/raw/ingest`. No local object
  storage. **Why:** Brain is the system of record for ingestion/extraction. **How to apply:** don't
  add OCR/storage here; treat brain-core as the pipeline.

- **Document routes are session-scoped + `requireAuth`.** All `/api/integrations/documents*` routes
  key storage on `req.session.userId` (NOT the app-wide `DEMO_USER` used by bank/tool connections),
  because the resulting obligations/wiki data is brain-core tenant-scoped by that same session.
  **Why:** mixing DEMO_USER local metadata with per-session brain data leaks/misaligns docs across
  users. **How to apply:** any new document route must auth-gate and scope by session user.

- **Document ingestion is a thin client over brain-core; extracted data is ADVISORY.** Upload →
  `/raw/ingest` (multipart, source_type pdf_upload|csv_upload) → `/raw/{raw_id}/extract`. Extract
  404 → `unavailable` ("coming soon", self-heals when Brain ships the endpoint), 422 → `unsupported`
  (can't read this file type). ReadingScreen reads live doc extractStatus (polls 15s while in
  progress); FoundScreen reads live `/api/brain/ledger/obligations` (tolerant: 404/empty → [], polls
  15s while empty, never infinite spinner) + resolves counterparty ids via `/ledger/counterparties`;
  Q&A → `/api/brain/wiki/question`. Confidence ≤0.5 → always show a "needs confirmation" pill; NEVER
  a document→payment path. All brain calls use the MEMBER token (agent token is propose-only).
  **How to apply:** keep extraction outputs advisory-framed; don't wire auto-pay from a document.

- **Generic `:toolId/disconnect` must be registered LAST in `server/routes.ts`.** Specific integration
  routes (`/plaid/*`, `/documents/*`, `/stripe/connect`) must come before
  `app.post("/api/integrations/:toolId/disconnect")` or the wildcard swallows them.
  **Why:** Express matches in registration order. **How to apply:** add any new
  `/api/integrations/<specific>` route above the generic disconnect handler.

- **Wizard navigation is a screen stack; step dots are display-only.** Flow branches
  (home→categories→leaf, plus a linear categories→reading→found tail), so navigation uses
  `stack: Screen[]` with push/back. The header renders onboarding-style StepDots driven by a
  `STEP_INDEX` map (TOTAL_STEPS=4; leaf connect screens pin to the categories step) purely for
  visual progress — it does NOT control navigation. Don't refactor nav into the dots.
  **How to apply:** when adding a screen, add it to `STEP_INDEX` (and `headerTitle` for the
  sr-only DialogTitle) so the dots/a11y label stay correct.

- **Provider connect status:** only Stripe is live (`/api/integrations/stripe/connect`); other tools
  (QuickBooks/Xero/Wave/Gusto/Rippling/ADP/PayPal/Square) are intentionally "Coming soon" placeholders.

- **Plaid access_token is stripped server-side** before any client response (`/plaid/connections`,
  `/plaid/exchange`). Keep it that way for any new bank route.
