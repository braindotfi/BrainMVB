# Proposals read model

This is the client-facing contract used by the shared proposal card. The
canonical upstream reference is the live Brain documentation:

- [Proposals and Evidence API](https://docs.brain.fi/api-reference/proposals-api.md)
- [Wiki API](https://docs.brain.fi/api-reference/wiki-api.md)
- [Policy API](https://docs.brain.fi/api-reference/policy-api.md)

The list and by-id proposal responses use the same shape. Reads are
tenant-scoped and cursor-paginated:

```ts
type ProposalReadItem = {
  id: string;
  type: string;
  created_at: string;
  status: string;
  risk_band: "low" | "standard" | "elevated" | "high" | null;
  confidence: number | null;
  mode: "propose" | "notify_only";
  narrative: string | null;
  evidence: Array<{ kind: string; ref: string; resolvable: boolean }>;
  agent: { id: string; kind: string; display_name: string } | null;
  payment_intent_id: string | null;
  action_type: string | null;
  stored_action_type?: string | null;
  details?: Record<string, unknown> | null;
  policy?: ProposalPolicy | null;
  presentation?: ProposalPresentation | null;
  available_decisions?: ProposalDecisionOption[] | null;
};

type ProposalPolicy = {
  decision?: string | null;
  policy_id?: string | null;
  policy_version?: number | null;
  matched_rule_id?: string | null;
  explanation?: string | null;
  required_approvers?: string[] | null;
  trace?: Array<{
    rule_id?: string | null;
    matched?: boolean;
    checks?: Array<{ key?: string; detail?: string; passed?: boolean }>;
  }> | null;
};

type ProposalPresentation = {
  headline?: string | null;
  recommendation?: string | null;
  key_facts?: Array<{ label: string; value: string | number | null }> | null;
  confidence_band?: string | null;
  policy?: ProposalPolicy | null;
  consequences?: Record<string, string | null | undefined> | null;
  actions?: ProposalDecisionOption[] | null;
  technical_detail?: Record<string, unknown> | null;
};

type ProposalDecisionOption = {
  id: string;
  label: string;
  meaning?: string | null;
};
```

`available_decisions` is authoritative whenever the field is present,
including an explicitly empty array. Only an absent field may fall back to
`presentation.actions`. The UI renders the decision label from this list, but
only submits the documented write verbs `approve`, `reject`, `acknowledge`, or
`undo`; unsupported values are visible but disabled.

Evidence labels come from resolved Ledger records for financial entities and
Wiki-backed entities for Wiki kinds. Raw IDs and `wiki:` URIs stay in the
collapsed technical section, never in the primary card. Policy attribution
uses the fallback order `policy_id → matched_rule_id → policy content`; if no
human-readable attribution exists, the line is omitted.

The shared card is used for every public proposal type. Advisory types route
through the Inbox when pending and decidable; the Inbox action controls are
derived from `available_decisions`, not from `mode` or a type-specific table.