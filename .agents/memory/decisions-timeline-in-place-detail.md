---
name: Settled records must open in place, not on the old Audit Log page
description: Why the unified Decisions/Inbox timeline opens audit records in a popup, and the trap that the retired-looking Audit Log page is still a live route.
---

Every row in the unified Decisions/Inbox timeline — pending **or** settled — opens its detail
**in place**. A settled (approved / rejected / acknowledged) row is backed by an audit record, and
the tempting one-liner is to `navigate("/audit-log?record=…")` because that page already knows how
to render one. Doing so swaps the entire page for the old six-tab Audit Log, so the user taps a row
in one product and lands in another.

**Why:** the timeline rebuild folded the old Inbox/Activity/Audit split into one list, but it did
**not** delete `AuditLogPage` — it is still a registered route, still reachable from Settings →
Developers and from assistant citations. So the old UI is always one `navigate()` away, and a
surface can regress to it without anything being deleted or erroring. The detail *popup*
(`AuditRecordPopup`) is the reusable part; the *page* is not.

**How to apply:**
- Render the shared popup locally with its own state instead of routing to the page that owns it.
- Give any such popup a `returnToBase`, because its linked-entity links build a return URL from a
  hardcoded route — left at the default, following a vendor/proposal link from an in-place popup
  returns the user to the old page anyway. Build that URL with `URLSearchParams`, not concatenation.
- A record pager must walk the records left on screen *after filters*, not the raw feed.
- Deep-link effects reading the same `search` string need an explicit precedence between params;
  two independent effects both opening a surface and rewriting the route will race.

**Verifying it:** the failure is entirely about what *renders* after a tap, so an endpoint check
proves nothing. `scripts/qa-inbox-settled-record.mjs` drives a real logged-in browser, and a
freshly seeded demo tenant has **no decided history**, so the script has to create a settled row
(one declared `permitWrite` approval) before the case it tests even exists.
