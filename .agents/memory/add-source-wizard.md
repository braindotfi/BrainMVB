---
name: Add Source ingestion wizard
description: Durable constraints for the Brain Finance "Add Source" data-ingestion modal and its document/integration routes.
---

# Add Source ingestion wizard

The "Add Source" sidebar button opens a paginated, source-agnostic connector wizard
(`client/src/components/AddSourceModal.tsx`), NOT the old AddAccountModal.

## Constraints / decisions

- **Documents persist metadata only.** The `sourceDocuments` table + `/api/integrations/documents`
  routes store name/size/mimeType/category — never the file bytes. There is no object storage wired.
  **Why:** the feature scope was connect/manage sources, not file hosting. **How to apply:** if a
  future task needs file contents (preview, parsing), you must add object storage first; don't assume
  bytes exist.

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
