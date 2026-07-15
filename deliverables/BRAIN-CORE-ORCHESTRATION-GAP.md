# brain-core orchestration gap: the fabricated agent-proposal surface

## Why this exists

BrainMVB ships a "Your Review" / "Brain Detected" experience with 11 fully-designed
agent proposal cards (`client/src/lib/agentProposals.ts`) covering every non-payment
agent in the product story: vendor-risk flags, cash forecasts, dispute filings,
compliance checks, revenue insights, reconciliation entries, subscription cleanup,
fraud/anomaly detection. None of it is backed by brain-core. It is static seed data
with a client-side decision store (`decideAgentProposal`) that never leaves the
browser tab.

This is the honest state of the mock-removal effort so far: real brain-core
PaymentIntents (the §6-gated payment approval flow) are fully wired and live. The 11
agent-proposal records are not, because **brain-core has no API surface for them** —
there is nothing to remove-and-replace-with-real-data yet. This document inventories
exactly what's fabricated, maps it against what brain-core already exposes, and
specifies the concrete API brain-core would need to ship to make this real.

## 1. Inventory — what's actually in `agentProposals.ts`

### Agent types (11, `AgentKey`)

| Key | Display name | Category | Execution mode | Example title |
|---|---|---|---|---|
| `vendor_risk` | Vendor Risk | business | propose | "Bank details changed on a contractor invoice" |
| `payment` | Payment | business | propose | "3 vendor invoices ready to batch and pay" |
| `collections` | Collections | business | propose | "Northstar Design invoice is 18 days overdue" |
| `treasury` | Treasury | business | propose | "Move idle cash into treasury yield?" |
| `cash_forecast` | Cash Forecasting | business | propose | "13-week cash forecast updated" / "Cash shortfall projected in week 9" |
| `dispute` | Dispute | business | propose | "Card charge disputed by customer, evidence ready" |
| `compliance` | Compliance | business | notify_only | "New vendor missing a signed W-9" |
| `revenue_intel` | Revenue Intelligence | business | notify_only | "Enterprise segment revenue up/down N% MoM" |
| `reconciliation` | Reconciliation | agnostic | propose | "A bank line doesn't match the ledger" |
| `subscription` | Subscription | agnostic | propose | "Unused software seat renewing in 4 days" |
| `fraud_anomaly` | Fraud & Anomaly | agnostic | notify_only | "Two invoices from different vendors share a phone number" |

21 total records: 11 `needs_review` + 10 `approved_automatically` (one pair per
agent, so each agent has both a live-decision card and an already-resolved outcome
card; `cash_forecast` and `revenue_intel` each have an extra escalation variant,
`pr_005b` / `pr_008b`, that never got an auto-approved twin).

### Per-proposal shape (`AgentProposal` interface)

```ts
interface AgentProposal {
  id: string;
  agentKey: AgentKey;
  agentDisplayName: string;
  category: "business" | "agnostic";
  executionMode: "propose" | "notify_only";
  riskLevel: "low" | "standard" | "elevated" | "high";   // drives RISK_META pill/color
  status: "needs_review" | "approved_automatically";
  title: string;
  subtitle: string;
  amount: number | null;
  confidence: number;                                     // 0..1, rendered as a bar
  whySuggested: { trigger: string; evidence: EvidenceLine[] };
  scenarioModule: ScenarioModule;                          // one of 10 kinds, see below
  recommendedAction: string;
  whatHappensNext: { ifApproved: string; ifEdited: string; ifRejected: string };
  riskNote: string;
  source: string;                                          // free-text "derived from"
  createdAt: string;                                       // ISO
  approvedAutomaticallyMeta?: {
    approvedAt: string;
    autoApprovalReason: string;
    outcome: { summary: string; linkedSource: LinkedSource };
    reversibility: "reversible" | "irreversible" | "informational";
    undoAction: string | null;
  };
}
```

- `RISK_META` maps `riskLevel` to a `{ label, color, bg }` pill — `low` green,
  `standard` neutral, `elevated` orange, `high` red. This is the ONLY place
  risk-to-color mapping lives; any real API should return `riskLevel` as an enum,
  not a color, and let the client keep owning the palette.
- `EvidenceLine` = `{ text: string; linkedSource: LinkedSource }`, where
  `LinkedSource = { type: LinkedSourceType; id: string; deepLink: string }`. The
  `deepLink` is a placeholder (`brain://{type}/{id}`) that resolves to nothing —
  tapping it opens a stub `EvidenceSheet` showing the raw id, not a real record.
- `ScenarioModule` is a 10-variant discriminated union (`account_comparison`,
  `entity_comparison`, `document_stack`, `message_preview`, `account_flow`,
  `forecast_chart`, `line_diff`, `usage_timeline`, `document_checklist`,
  `trend_chart`) — this is UI-shape data (chart points, diff rows, doc lists), not
  something brain-core should model 1:1. A real API only needs to supply the
  underlying numbers/evidence; the client already owns how to render them.

### Decision lifecycle (client-side only, `agentProposals.ts` bottom half)

```ts
type AgentDecision = "approved" | "rejected" | "acknowledged" | "undone_to_review";
```

- Stored in a module-global `Record<string, AgentDecision>` (`decisions`), notified
  via `useSyncExternalStore` — **no persistence, no server round-trip, resets on
  page refresh.**
- `needsReviewList(d)` — records with `status: "needs_review"` and no decision yet,
  OR any record whose decision is `"undone_to_review"`.
- `autoApprovedList(d)` — records with `status: "approved_automatically"` and no
  decision recorded against them.
- `decideAgentProposal(id, decision)` stamps `decisionTimes[id] = Date.now()` so
  Activity/Audit Log surfaces can show a real-looking timestamp instead of
  re-stamping "now" on every render.
- Actions surfaced by `AgentProposalModal.tsx`: **Approve**, **Reject**, **Edit**
  (inline amount/category/message-draft edit, client-only, never sent anywhere),
  **Acknowledge** (notify-only records), **Undo** (moves an auto-approved record
  back into `needs_review`, only offered when `reversibility === "reversible"`).

## 2. Coverage mapping — what brain-core already covers vs. nothing covers

### Already covered (payment lifecycle — this is the part that's real)

| Surface | brain-core endpoint | What it gives BrainMVB |
|---|---|---|
| Approval queue | `GET /actions` (approval-queue id+status summaries, `execution:read`) + `GET /payment-intents/{id}` (full record) — see `client/src/lib/brainQueue.ts` | Real proposed → `pending_approval` → `awaiting_second_approval` → `approved`/`rejected`/`executed` state machine, `amount`, `destination_counterparty_id`, `invoice_id`, `obligation_id`, `approval_ids` (multi-signer) |
| Approve/reject | `POST /payment-intents/{id}/approve`, `POST /payment-intents/{id}/reject` | Real §6-gated human decision, session-derived actor, no client-constructed `actor` field ever accepted |
| Grounded narrative/evidence | `POST /wiki/question` (`askWiki`) | Natural-language question → SQL against the Wiki → answer with an evidence path — this is what backs `BrainAssistant.tsx`'s "Grounded in N records" today |
| Why an action was gated | `POST /policy/{tenant_id}/evaluate` | Real policy decision + trace for a `ProposedAction` |
| Settlement/audit trail | `GET /audit/entity/{entityType}/{entityId}`, live `AuditEvent` stream (`layer: agent|execution|audit`, `event_hash`/`prev_event_hash` chain) | What `useBrainAuditRecords` / `AuditLogPage` already consume for real payment events |

This is a solid foundation — the shapes (`riskLevel`→policy decision, `evidence`→wiki
answer path, `whatHappensNext`→approval_ids/execution_receipt_ids) are not far off
from what `AgentProposal` already assumes. The gap is entirely in **surface area**,
not in architecture.

### Covered by NOTHING

- **Non-payment proposal types.** brain-core's Agent layer (`/agents`, `/agents/{id}/propose`,
  `/agents/{id}/actions`) is payment/PaymentIntent-shaped end to end — there is no
  agent action type for a vendor-risk flag, a cash-forecast projection, a dispute
  filing, a compliance gap, a revenue-trend insight, a reconciliation suggestion, or
  a subscription-waste flag. These are exactly the 11 agent types this file invents.
- **Agent identity/provenance on the wire.** `PaymentIntent` has
  `created_by_agent_id`, but nothing in the public API returns a *display name*,
  *category* (business/agnostic), or *risk banding* for a proposing agent — the
  client currently hardcodes `AGENT_META`/`RISK_META` locally with no source of
  truth on the server.
- **Acknowledge / undo lifecycle.** brain-core's PaymentIntent state machine has no
  concept of "acknowledge a flag" (notify-only) or "undo an auto-approval" — those
  are entirely BrainMVB inventions with no server-side counterpart, not even for
  payments.
- **Any list endpoint for non-payment agent outputs.** `GET /actions` only lists
  PaymentIntents. There is nothing to poll for "what has Brain flagged/decided
  outside of a payment."

## 3. The ask — proposed `/v1/proposals` resource

The shapes below are written so brain-core could lift them close to verbatim into
`Brain_API_Specification.yaml`. They generalize the existing PaymentIntent lifecycle
(`proposed → pending_approval → approved/rejected → executed`) to any agent output,
and reuse existing primitives (`policy_decision_id`, evidence-as-Wiki-refs) instead
of inventing new ones.

```yaml
paths:
  /proposals:
    get:
      tags: [Proposals]
      summary: List agent proposals (payment and non-payment)
      description: |
        Requires `proposals:read`. Non-payment counterpart to `GET /actions` —
        returns every agent output that isn't already a PaymentIntent (vendor-risk
        flags, forecasts, dispute recommendations, compliance gaps, revenue
        insights, reconciliation suggestions, subscription flags).
      operationId: listProposals
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [needs_review, acknowledged, approved, rejected, undone_to_review]
        - name: type
          in: query
          schema: { $ref: '#/components/schemas/ProposalType' }
      responses:
        '200':
          description: Proposal summaries
          content:
            application/json:
              schema:
                type: object
                properties:
                  proposals:
                    type: array
                    items: { $ref: '#/components/schemas/ProposalSummary' }

  /proposals/{id}:
    get:
      tags: [Proposals]
      summary: Full proposal detail
      operationId: getProposal
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Full proposal
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Proposal' }
        '404': { $ref: '#/components/responses/NotFound' }

  /proposals/{id}/decide:
    post:
      tags: [Proposals]
      summary: Record a human decision on a proposal
      description: |
        Requires `proposals:write`. Unifies approve/reject/acknowledge/undo into
        one endpoint (mirrors `/payment-intents/{id}/approve` and `/reject` but
        covers execution-modes that aren't a payment). Actor is session-derived,
        never client-supplied, matching the PaymentIntent approve/reject contract.
      operationId: decideProposal
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [decision]
              properties:
                decision:
                  type: string
                  enum: [approved, rejected, acknowledged, undone_to_review]
                edit:
                  type: object
                  description: Optional inline edit (amount/category/message draft) applied at decision time.
                  additionalProperties: true
      responses:
        '200':
          description: Updated proposal
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Proposal' }
        '409':
          description: Proposal already decided, or decision not valid for its execution_mode. Error code `proposal_invalid_state`.

components:
  schemas:
    ProposalType:
      type: string
      enum:
        [vendor_risk, payment_batch, collections, treasury, cash_forecast,
         dispute, compliance, revenue_intel, reconciliation, subscription,
         fraud_anomaly]

    ProposalSummary:
      type: object
      required: [id, type, agent_principal, risk_band, status, created_at]
      properties:
        id: { type: string }
        type: { $ref: '#/components/schemas/ProposalType' }
        agent_principal:
          type: string
          description: Agent id that produced this proposal (join key into `/agents/{agent_id}`).
        risk_band:
          type: string
          enum: [low, standard, elevated, high]
        status:
          type: string
          enum: [needs_review, acknowledged, approved, rejected, undone_to_review]
        title: { type: string }
        amount: { type: [string, "null"] }
        created_at: { type: string, format: date-time }

    Proposal:
      allOf:
        - $ref: '#/components/schemas/ProposalSummary'
        - type: object
          required: [narrative, evidence, execution_mode]
          properties:
            execution_mode:
              type: string
              enum: [propose, notify_only]
            narrative:
              type: string
              description: >-
                Grounded explanation of why this was raised — same shape as
                `WikiAnswer.answer`, ideally produced by the same `POST
                /wiki/question` path rather than a second narrative engine.
            evidence:
              type: array
              items:
                type: object
                required: [text, wiki_entity_id]
                properties:
                  text: { type: string }
                  wiki_entity_id:
                    type: string
                    description: Resolves via `GET /wiki/entity/{entity_id}` — replaces today's dead `brain://type/id` placeholder deep links.
            links:
              type: object
              properties:
                payment_intent_id: { type: [string, "null"] }
                counterparty_id: { type: [string, "null"] }
                raw_id: { type: [string, "null"] }
            policy_decision_id:
              type: [string, "null"]
              description: Set when this proposal was evaluated by `POST /policy/{tenant_id}/evaluate`.
            decided_by: { type: [string, "null"] }
            decided_at: { type: [string, "null"], format: date-time }
```

### Audit events for non-payment decisions

`AuditEvent.layer` already has an `agent` value (v0.2). A decided proposal should
emit exactly one `AuditEvent` with `layer: agent`, `action: "proposal.decided"`,
`outputs: { decision, proposal_id }` — no new layer or event type needed, just a
new `action` value under the existing schema. This is what would let
`AuditLogPage` drop its client-side `agentDecisionToAuditRecord` synthesis
(Increment 8) and read real events instead.

### Agent provenance on PaymentIntents

`PaymentIntent.created_by_agent_id` already exists but is never joined against
anything the client can render (no display name, no category). The cheapest fix:
have `GET /payment-intents/{id}` optionally expand `created_by_agent_id` into the
`Agent` object's `display_name`/`kind` inline (or accept `?expand=agent`), so
BrainMVB stops hardcoding an `AGENT_META` lookup table client-side.

### Flagged for later: policy-proposal path

If a user accepts a rule *suggestion* surfaced by an agent (out of scope for this
document, but adjacent — see the Rules-page honesty work in this same mock-removal
effort), that acceptance should become a real `POST /policy/{tenant_id}` write, not
another client-only store. Worth a follow-up spec once `/proposals` exists, since a
"policy-suggestion" proposal type would want to link `policy_decision_id` on
accept rather than just recording a decision.

## 4. Interim treatment (this mock-removal batch)

Until brain-core ships the surface above, the fabricated agent-proposal surface
stays in the product — it's the only way to demo 8 of Brain's 11 named agents today
— but is now honestly labeled rather than silently presented as live:

- **Increment 7** adds a visible "Demo scenario" label everywhere these 11 records
  render (`ReviewPage` AgentRow, `HomePage`'s Brain Detected fallback, the
  `AgentProposalModal` header). Rows sourced from the real brain-core queue
  (`ProposalRow`/`LiveRow`) are never labeled — they're real.
- **Increment 8** removes the *static* audit-log fixtures
  (`AUTO_APPROVED_AUDIT_RECORDS`, `DEMO_AUDIT_RECORDS`) but keeps the
  `agentDecisions` overlay in `AuditLogPage` that turns a demo-scenario decision
  into a same-session audit row — otherwise approving/rejecting a demo proposal
  would silently vanish instead of showing up anywhere. That overlay is a
  known, documented gap (this file) until `/proposals/{id}/decide` exists to make
  it real; it has no id-continuity across a page refresh today, by design (no
  localStorage — see `client/src/lib/agentProposals.ts`'s in-memory decision
  store).
- **No removal or live rebuild happens** until brain-core answers on the API in
  §3. Ripping the 11 agents out entirely would regress the demo further than
  labeling it; rebuilding it against real data isn't possible without the
  `/proposals` surface (or equivalent) existing first.
