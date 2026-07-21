# Developers section — round 2 fixes

Scope: the Developers section (Overview / API Keys / Tenants / Usage & Limits / Docs) already exists and is reading real data from brain-core. This is a fix-and-polish pass, not a rebuild. Each item below references what's currently on screen.

## 1. Move the Sandbox/Live toggle
Currently it sits in a fixed bar at the bottom of the submenu column, on every Developers subpage. Move it to the **top right of each subpage's header row**, next to the page title (same row as "+ New key" on API Keys) — starting with Overview. Remove it from the bottom bar once it's in the header; don't show it in both places, that invites the two to drift out of sync. It should still be one shared piece of state across all four subpages — switching it on Overview should already show Live on API Keys if you navigate there next.

## 2. Give Overview a real header
Add a title above "GET STARTED", following the same pattern Home uses ("Good evening, ACME Inc." → "Here's where your money stands today."). Something like: eyebrow "Developers · [org name]" then an H1 stating what the page is for. The Sandbox/Live toggle from item 1 sits in this header row, top right.

## 3. Fix the Get Started checklist logic
- "Make your first call" should only check off once a call has actually been authenticated with an **issued key** — not any chat session activity. If the current "wiki.question" event that triggered the checkmark used internal session auth rather than a platform-issued key, that's the wrong signal; find/gate on key-authenticated request events instead once gateway enforcement exists. Until enforcement ships, either hold this checkbox as incomplete-by-default or clearly relabel the step (e.g. "Try Brain in chat") so it doesn't imply the key was used.
- Make step-indicator styling consistent: every step is a numbered circle (1/2/3) that becomes a check-mark on completion. Don't mix "always a check" with "always a number" across steps.
- Steps should reflect real dependency order: tenant → key → first key-authenticated call. Don't allow step 3 to show complete while step 2 is incomplete.

## 4. Add a "+ Create tenant" button
Tenants currently has no create action — only explanatory paragraph text. Add a "+ Create tenant" button in the page header (same treatment as "+ New key" on API Keys), always visible. On click:
- **Demo/sandbox tenancy mode:** show the existing explanation ("this workspace runs in demo mode...") as the response to the action (toast, inline message, or disabled-state tooltip on hover) rather than permanent page text. The button existing and explaining itself when clicked is a better pattern than a wall of text with no control.
- **Production tenancy mode:** button opens the real create-tenant form (name, id/slug, environments to enable) and calls the actual creation endpoint.

## 5. Fix "Created –" on the tenant row
The demo tenant is provisioned fresh per session, so a real creation timestamp exists — render it (relative time is fine: "created just now" / "created 12 min ago") instead of a bare dash. Audit whether other date fields elsewhere in Developers have the same fallback bug.

## 6. Correct the scope taxonomy
Real enforced scopes are `ledger:read` and `audit:read` (confirmed from the existing test keys), not the `read` / `pay:propose` / `pay:execute` / `proof:read` set assumed earlier. Update the create-key form's scope checkboxes to offer the real scope set brain-core's policy layer actually recognizes. Until gateway enforcement (see item 8) ships, label the section "Requested scopes" rather than implying they're currently enforced.

## 7. Humanize method/event names in Usage and Recent Activity
"Usage by method" currently shows raw internal audit event names (`wiki.question`). Add a display-name mapping layer so developers see the SDK-facing concept they actually called (e.g. `wiki.question` → "Ask a question (`brain.ask`)"), while keeping the raw event name available on hover/expand or in the full Audit Log page for anyone who wants the internal detail. Apply the same mapping to Overview's Recent Activity list.

## 8. Surface the enforcement-gap disclosure earlier
The note "keys authenticate against platform endpoints only — brain-core gateway enforcement is rolling out" currently only appears on API Keys and Usage & Limits. Add an equivalent short status line to Overview (near the header or Get Started block) so it's the first thing a developer sees, not something they discover two clicks in.

## 9. Restore the full chat panel inside Developers
Home shows the complete right-hand chat panel (avatar, greeting, quick-prompt chips, input). Inside Developers it's collapsed to icon-only. Since the chat panel is the actual mechanism for "make your first call," it needs to be present and usable on Developers subpages, not just Home. Add two Developers-specific quick-prompt chips when a Developers subpage is active: "Run a test call" and "Show my usage this month" — both submit through the same real chat pipe, scoped to the active tenant + environment.

## 10. Add a Live section (or state) to API Keys
Tenants explains why Live is gated ("production tenant creation unlocks when the platform runs in production tenancy mode"). API Keys should say the equivalent for Live key issuance — an explicit empty/gated state under a "Live" heading, not silence. Reuse the same demo-mode messaging pattern as Tenants so the two pages feel like one coherent explanation of the platform's current phase, not two different implementations of the same idea.

## Non-goals for this pass
No new pages, no Webhooks, no redesign of the sidebar/submenu structure — this is entirely about correctness and consistency within the four subpages that already exist.
