---
name: Activity page tap convention
description: Unified rule for what tapping an Activity feed row opens
---

**Rule:** Every clickable Activity row opens the record it represents — never a generic destination:
- Live brain-core audit rows → deep-link to the Audit Log record popup (`/audit-log?record=<id>`), the record's canonical home.
- Review-flow decision rows (carry `proposal`) → inline `ProposalDetail` sheet.
- Agent-decision rows (carry `agentProposal`) → re-open the `AgentProposalModal` as a receipt.

**Why:** Rows previously behaved three different ways (some dead taps); the user asked for one convention. "Open the surface where the record lives / where the decision was made" preserves context better than routing everything through the audit log.

**How to apply:** Any new Activity row source must attach one of `linkTo` / `proposal` / `agentProposal` so it is tappable. When the AgentProposalModal shows an already-decided record, its footer must render the muted decision line ("You approved/rejected this proposal.") instead of re-offering Approve/Edit/Reject — decisions are made once; receipts are read-only.
