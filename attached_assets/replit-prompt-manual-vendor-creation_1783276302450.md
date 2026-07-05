# Replit prompt — BrainMVB: Manual Vendor Creation & Edit

**Dependency gate:** Do not start until brain-core has merged `feat/counterparty-manual-endpoints` including the PATCH edit endpoint (contract: `docs/contracts/counterparty-manual.md` in brain-core — covers `GET /ledger/counterparties`, `GET /:id`, `POST`, `PATCH /:id`). Core leads. If any of these endpoints are not yet live in the target environment, stop and report — do not mock them.

**Existing UI note:** BrainMVB already has a Vendors page with trust-lifecycle tabs (Needs Review / New / Trusted / Suggested) and a Review Vendor modal (payment history stats, active flag card, Paused badge, Previous/Next pager). Extend these existing surfaces — do not build a parallel vendor management area.

---

## Workflow

- `git fetch && git pull` before starting.
- Work on feature branch `feature/manual-vendor-creation`.
- Execute in the four checkpoints below, in order. After each checkpoint, update the tracking checklist at the bottom of this prompt (done/pending) before moving on.
- At the end, update `CLAUDE.md` in this repo: new BFF endpoints, new screens, and the core-backed status of this feature (this moves vendor creation from "mock-only" to "core-backed" in the boundary table).

## What you are building

A manual vendor creation flow in BrainMVB (the reference client), backed entirely by the new brain-core endpoints. Four pieces: a Vendors list with provenance badges, a create form, a duplicate check on submit, and an inline "create vendor from this invoice" path in invoice review. A wireframe of all four screens exists — follow its structure; style with the existing BrainMVB design system (Brain violet v2.1).

## Architecture rules (non-negotiable)

1. **All calls go client → BFF → brain-core.** The client never calls core directly. Add four BFF endpoints:
   - `GET /bff/vendors?q=&limit=` → proxies core `GET /ledger/counterparties` with `type=vendor` fixed.
   - `GET /bff/vendors/:id` → proxies core `GET /ledger/counterparties/:id`.
   - `POST /bff/vendors` → proxies core `POST /ledger/counterparties` with `type: "vendor"` fixed.
   - `PATCH /bff/vendors/:id` → proxies core `PATCH /ledger/counterparties/:id`, identity fields only.
2. **Actor attribution:** the BFF resolves the logged-in session to a member and forwards the member's identity on the core call (same pattern as the existing members/approval integration). Never a shared service account.
3. **The client sends identity fields only:** `name` (legal name), `display_name`, `country`, `tax_id`, `category`, `contact_email`, `aliases`. There are no payment/bank fields anywhere in this feature — no inputs, no form state, no BFF pass-through. Core rejects them (`payment_fields_not_allowed`); the client must never produce them.
4. **Trust core's responses.** `201 created: true` → success toast "Vendor created", navigate to the vendor. `200 created: false, merged: true` → toast "Matched existing vendor — details merged", navigate to the *existing* vendor's Review card. Do not re-implement dedup client-side beyond the pre-submit check.
5. **Manual vendors enter the lifecycle at New — never Trusted.** A newly created manual vendor appears in the New tab with a `Manual` badge and `Unverified` status. Trust transitions (trust, pause, restore) remain the existing dedicated actions with their own confirmations; nothing in the create or edit flow touches trust state.
6. **Refetch after every write.** After a successful POST or PATCH, refetch the vendor via `GET /bff/vendors/:id` and re-render from server truth. No optimistic updates on this surface — trust status, flags, and payment stats are server-computed and optimistic state can contradict core.
7. **Edit is identity-fields-only, and core enforces the rules — surface them, don't duplicate them.** Renaming the *legal* name keeps the old one as an alias and can return `409 name_conflict` → inline error "Another vendor already has this name" with a link to the conflicting vendor. Changing the *display* name is metadata-only (core auto-aliases the old one; no conflict possible). `field_not_editable` and `payment_fields_not_allowed` should be unreachable if the form is built correctly; if they occur, show a generic error and log.

## Checkpoint 1 — Vendors page integration (Screen 1)

- Add an add-vendor control to the Vendors page using the **same component and styling as the "add a new rule" control on the Rules page** — locate that component in the codebase and reuse it (do not rebuild it). Description text: "Add a new vendor manually". Button label: "Add".
- Add a new tab **"Manually Added"** immediately after the "Needs Review" tab. It is a **provenance filter**, not a lifecycle state: it shows every vendor with `provenance = human_confirmed` (BFF filters on the provenance field from core), regardless of current trust state. Manual vendors also continue to appear in their lifecycle tab (New → Trusted etc.) as they progress — a vendor can appear in both Manually Added and Trusted.
- Vendor rows show `display_name` as the primary label with the legal `name` as a muted secondary when they differ.
- Search input wired to `GET /bff/vendors?q=` (debounced 300ms) if the page doesn't already have one; core matches on legal name and aliases, and display names are auto-aliased, so one query covers both.
- Extend existing vendor rows with two badges:
  - Provenance badge: `Manual` (accent tint) when `provenance` is `human_confirmed`; `Synced · {source}` (success tint) for ingested vendors. Derive source label from `source_ids` prefix if available, else just "Synced".
  - Verification badge: `Unverified` (warning tint) when `verified_status = unverified`; `Verified` (success tint) for `document_verified` / `sanctions_cleared`; `Self-attested` (neutral) for `self_attested`.
- A manually created vendor row shows "added by {member} · {date}" in its subtitle (from the create response / audit data the BFF passes through).
- Empty state on the Manually Added tab: "No manually added vendors" with the add control's "Add" CTA.

## Checkpoint 2 — Create form (Screen 2)

- Modal in the same visual family as the existing Review Vendor modal (same header pattern, same close affordance). Title: "Add vendor".
- Fields, in order:
  - **Legal name** (required) — maps to core `name`, the identity/dedup anchor. Helper text under the field: "As it appears on invoices and registrations. Used to match incoming documents."
  - **Display name** (optional) — placeholder "Defaults to legal name". Sent as `display_name`; core auto-aliases it, the client does nothing special.
  - Country (select), Category (select), Tax / registration ID, Contact email. Aliases optional (tag input if one already exists in the design system; otherwise skip for v1).
- A locked note beneath the fields: "Payment details are managed in your ERP. Brain never stores manually entered bank information." — with a lock icon. This is a deliberate, visible design statement.
- Submit button: "Add vendor". Client-side validation: legal name non-empty; email format if provided.
- Error handling: render core's structured rejection reasons as inline errors (`invalid_type`, validation errors). `actor_unresolved` → "Your account isn't linked to a member — contact your admin."

## Checkpoint 3 — Duplicate check (Screen 3)

- On submit, first call `GET /bff/vendors?q={name}`. If any result's normalized name or alias matches (core does the matching — just check for non-empty results whose match relevance the API returns), show the "Possible match found" interstitial:
  - Card for each match: name, match reason subtitle (e.g. "Alias match"), provenance + verification badges.
  - Two actions: "Use existing vendor" (navigates to it, no create call) and "Create anyway" (proceeds to POST).
- If no matches, POST directly — no interstitial.

## Checkpoint 4 — Inline from invoice review (Screen 4)

- In the invoice review view, when a proposal carries the `unknown_vendor` flag from Invoice Agent, render an accent-tinted callout: "Create vendor from this invoice", showing the extracted fields (name, country, TRN) from the proposal's extraction payload.
- "Review and create" opens the Checkpoint 2 form pre-filled with those values (user confirms, nothing auto-creates). "Dismiss" hides the callout for this proposal.
- After creation, the invoice view refreshes so the proposal re-evaluates against the now-known vendor.
- If the extraction payload shape isn't yet available from the proposal object, stop at this checkpoint and report what's missing rather than inventing a shape.

## Checkpoint 5 — Edit details in Review Vendor (Screens 2–3 of wireframe v2)

- Add an "Edit details" action to the existing Review Vendor modal header (quiet button or overflow menu item).
- It swaps the modal body to an edit state with *identity fields only*, in order: **Legal name** (with hint underneath: "Renaming keeps the current legal name as an alias so matching never breaks"), **Display name**, Category, Country, **Tax / registration ID**, Contact email. The 409 conflict handling applies to legal name only.
- Everything else stays read-only and visibly so: payment history stats (computed), trust status badge (own actions), and bank/account details. In the read state, add one line to the active-flag card copy where relevant: account details come from ingested data and are never editable here.
- A locked note in the edit state lists what's not editable and why (trust = separate actions; account details = connected systems).
- Save → `PATCH /bff/vendors/:id` with only changed fields → on success, refetch via `GET /bff/vendors/:id`, return to read state, toast "Vendor updated". On `409 name_conflict`, inline error with link to the conflicting vendor; no state change.
- The read state shows "edited by {member}, {date}" when the vendor has human edits (from audit data the BFF passes through; if the BFF doesn't yet surface this, omit the line and note it as pending rather than inventing a source).

## Out of scope

- Deactivating or archiving vendors.
- Trust-state transitions inside the create/edit flows (existing dedicated actions only).
- Alias removal (append-only; the edit form only adds).
- Merging two vendors (409 conflict links to the other vendor instead).
- Any approval gating on creation (downstream invoice policy handles unverified-vendor strictness — core-side).
- Payment instructions, bank details, remittance info — anywhere, in any form, including the edit state.
- Verification-status promotion UI (that's the evidence/annotate path, separate feature).

## Tracking checklist

- [ ] Checkpoint 1 — Vendors page: rules-style add control, Manually Added tab, badges
- [ ] Checkpoint 2 — Create form (legal + display name) + ERP note + error states
- [ ] Checkpoint 3 — Duplicate interstitial
- [ ] Checkpoint 4 — Inline create-from-invoice
- [ ] Checkpoint 5 — Edit details in Review Vendor + refetch-after-write
- [ ] CLAUDE.md updated (feature marked core-backed; create + edit)
- [ ] PR opened from `feature/manual-vendor-creation`
