---
name: Auto-approved cross-surface records
description: Keep Inbox and Audit Log automatic-payment records aligned without fabricating timestamps or audit history.
---

Automatic-payment records shown in Inbox and Audit Log must come from the same live PaymentIntent queue, with the proposal's original Brain `created_at` used for ordering and date filtering. The Audit Log representation is a read-only projection of that source, not a newly timestamped event.

**Why:** Separate projections previously drifted in content, and generating a timestamp during rendering made records reorder and undermined the audit trail's meaning.

**How to apply:** When adding a surface for automatic approvals, reuse the live auto-approved proposal mapper and preserve its source creation timestamp; do not synthesize a fresh audit event or current-time timestamp.