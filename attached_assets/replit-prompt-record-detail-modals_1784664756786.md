# Developers section — add record detail modals

## Why
API Key rows currently show data but no actions — there's no way to rotate or revoke a key from the list. Activity rows show a method name and timestamp with no way to see what was actually asked or returned. Both need a tap target that opens a detail view; the list row itself is too narrow to hold this.

## Pattern
Tapping a row opens a centered modal (dark card, rounded, same border/elevation as existing cards — reuse whatever modal/dialog primitive already exists in the codebase; if none exists, build one component and reuse it for all three cases below rather than one-off implementations). Rows get `cursor: pointer` and a hover state (`background: var(--elev2)` or equivalent token) plus a trailing chevron to signal they're tappable.

## Where to add it

**API Keys** (highest priority — this closes a real functionality gap, not just a UX nicety)
- Modal shows: name, environment + status badges, the masked key with a "reveal" action (only enabled while the key is active — revoked keys show "reveal unavailable"), full scope list, created date, last-used date, and tenant id.
- Active keys get two actions in the modal footer: **Rotate** (revoke + reissue same name/scopes, shows the new plaintext once same as creation) and **Revoke** (with a confirm step — this is destructive).
- Revoked keys show no action buttons, just a "Revoked [date] · [reason if available]" field instead.
- If a key was created before gateway enforcement shipped, show the same enforcement-gap note used elsewhere ("...never able to authenticate live traffic") so a developer doesn't wonder why a key that was never used shows no usage.

**Recent Activity (Overview) / any Audit-style list**
- Modal shows: humanized method name with the raw event name alongside it (e.g. "Ask a question (`brain.ask`)" / raw: `wiki.question`), timestamp, auth method used (key name if key-authenticated, or "Session — no key used" if not), tenant, and — for `brain.ask`-type events — the actual question asked and the response returned. Link out to the full Audit Log entry for the raw payload rather than duplicating everything here.

**Tenants**
- Modal shows: full tenant id, environments enabled, number of keys issued against this tenant (with a link into API Keys filtered to it), and creation timestamp.
- **Session countdown**: while in demo tenancy mode, show time remaining until this tenant expires (e.g. "expires in 12 min"), both in the modal and ideally as a small indicator on the list row itself — a tenant that resets in ~30 minutes with no warning anywhere is a bad surprise mid-integration. This field goes away once the platform runs in production tenancy mode (tenants don't expire there).

## Usage & Limits — expand in place, not a modal
The method-breakdown rows are aggregates across many requests, not a single record, so they shouldn't open the same detail modal as Keys/Activity/Tenants. Instead, tapping a method row expands it in place (accordion-style) into a small day-by-day trend for that method, using data already available from the existing usage aggregation endpoint grouped by day. Collapses back on a second tap. Don't build a separate page or modal for this.

## Small linked improvement while in this area
Overview's two metric cards ("Requests today," "Active keys") currently aren't clickable. Make them navigate to Usage & Limits and API Keys respectively — cheap to add alongside this work and removes a navigation step.

## Data wiring
No new data is needed for the API Keys modal — everything shown is already fetched for the list row, just currently truncated. Rotate/Revoke call the existing (or newly added, per the original build brief) `POST /v1/keys/:id/rotate` and `DELETE /v1/keys/:id` endpoints. The Activity modal's request/response detail should come from the same audit-event record already used to render the list row — if the current list endpoint doesn't return the full request/response, extend it to, rather than issuing a second fetch on open (keeps the modal from having its own loading state for data that's one row away).
