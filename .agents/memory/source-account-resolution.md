---
name: Source-to-account resolution
description: How Settings source rows safely resolve to ledger account details.
---

Settings source rows must only open Account Details when upstream metadata resolves to a real ledger account ID. Brain-core seeded sources may publish `overlaps_with.ledger_account_ids`, while account records may publish `source_ids`; provider/source rows without either must remain non-interactive rather than opening an empty or guessed account.

**Why:** Source records and ledger accounts are separate upstream surfaces, and several valid connected sources do not represent a ledger account.

**How to apply:** Resolve explicit metadata links first, then overlap ledger IDs, source IDs, or an exact account-name match. Make the row keyboard/tap accessible only after validation against the loaded account list.