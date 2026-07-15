import { useQuery } from "@tanstack/react-query";
import type { AutoRule } from "./proposalTypes";

/* ── Live brain-core policy → read-only rule cards ────────────────────────────
   Surfaces the tenant's ACTUAL signed policy document on the Rules page via
   the EXISTING `GET /api/brain/approval-policy` route (server/brain/proxy.ts,
   backed by server/brain/client.ts's `getApprovalPolicyFacts`) - no new BFF
   route added. That function already reads `GET /policy/{tenantId}` for
   TeamSection's locked rows but only returned ONE derived fact (the
   second-approval threshold). FLAG: this Phase 2a change WIDENS its response
   to also include `version`, `quorumRequired`, and the full `rules[]` array
   (server/brain/client.ts's `ApprovalPolicyFacts` + `PolicyContentRule`, now
   exported) so the Rules page can render every clause, not just one number.
   Still a read-only GET on the member token - no new scope, no new write path,
   same shape `bff-invariants.test.ts` already covers (that suite never calls
   this route, so it stays green, but per CLAUDE.md this touch to
   server/brain/* must be flagged for the Replit-side test run.

   Shape verified against brain-core source, not docs:
   - services/policy/src/routes.ts:38-48 (`GET /policy/:tenant_id` → `serialize`
     at :465-479 returns `{ id, version, state, content, content_hash, signers,
     quorum_required, activated_at, deactivated_at, created_by, created_at }`).
   - services/policy/src/dsl.ts:69-81 (`PolicyRule`: `id, applies_to[], when,
     require?, execute, approval_required_above?`) and :100-115 (`PolicyDocument`:
     `version, rules[], lists?, message_templates?, agent_actions?`).
   - services/api/src/onboarding/provision.ts:85-104 (`buildDefaultPolicyDocument`)
     is what a fresh/demo tenant actually gets: TWO rules, no amount thresholds -
     `default-money-requires-confirmation` (outbound_payment/onchain_tx, confirm,
     single_signer) and `default-non-money-confidence-floor` (inbound_payment/
     ledger_write, auto). version 1, quorum_required 1 (provision.ts:179).

   Honesty: this is NOT the app's 12 hand-authored rule cards (mockRules.ts).
   A policy rule has no name/summary/vendor allowlist - those are invented by
   this mapper as a plain-English rendering of the DSL fields (applies_to +
   when + execute/require), never copied from mock data. Every mapped card is
   `locked: true` (no pause/resume - Phase 2b, blocked on policy:sign scope) and
   `kind: "always_on"` so it renders in the read-only style, never mixed into
   the app-local Automations/Guardrails tabs. */

export interface PolicyContentRule {
  id: string;
  applies_to?: string[];
  when?: Record<string, unknown>;
  require?: string;
  execute?: string;
}
export interface ApprovalPolicyFacts {
  selfApprovalBlocked: true;
  secondApprovalThreshold: { value: string; currency: string } | null;
  version: number;
  quorumRequired: number;
  rules: PolicyContentRule[];
}

export const APPLIES_TO_LABEL: Record<string, string> = {
  outbound_payment: "outbound payments",
  inbound_payment: "inbound payments",
  ledger_write: "ledger writes",
  onchain_tx: "on-chain transactions",
  agent_action: "agent actions",
  any: "any action",
};

export const EXECUTE_LABEL: Record<string, string> = {
  auto: "runs automatically",
  confirm: "waits for approval",
  reject: "is blocked",
};

/** Plain-English rendering of a rule's `when` clause. Only the fields
 *  brain-core's DSL actually defines (dsl.ts:48-67) - no invented conditions. */
export function describeWhen(when: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const amountGt = when["amount.gt"] as { value?: string; currency?: string } | undefined;
  const amountLte = when["amount.lte"] as { value?: string; currency?: string } | undefined;
  if (amountGt?.value) parts.push(`over ${amountGt.value} ${amountGt.currency ?? "USD"}`);
  if (amountLte?.value) parts.push(`up to ${amountLte.value} ${amountLte.currency ?? "USD"}`);
  const confidence = when["agent.confidence.gte"];
  if (typeof confidence === "number") parts.push(`agent confidence ≥ ${confidence}`);
  const riskLte = when["agent.risk_level.lte"];
  if (typeof riskLte === "string") parts.push(`risk ≤ ${riskLte}`);
  const agentRole = when["agent.role"];
  if (typeof agentRole === "string") parts.push(`agent role: ${agentRole}`);
  const inList = when["counterparty.in"];
  if (typeof inList === "string") parts.push(`counterparty in ${inList}`);
  const notInList = when["counterparty.not_in"];
  if (typeof notInList === "string") parts.push(`counterparty not in ${notInList}`);
  return parts;
}

/** Map one brain-core policy rule to the app's read-only rule-card shape.
 *  Always `locked: true` - Phase 2a is display-only; mutation needs the
 *  policy-sign scope the token lacks (Phase 2b). */
export function mapPolicyRuleToCard(rule: PolicyContentRule): AutoRule {
  const appliesTo = rule.applies_to ?? [];
  const scopes = appliesTo.length > 0
    ? appliesTo.map((a) => APPLIES_TO_LABEL[a] ?? a).join(", ")
    : "any action";
  const conditions = describeWhen(rule.when ?? {});
  const conditionSummary = conditions.length > 0 ? conditions.join(" · ") : "no conditions";
  const requireSuffix = rule.require ? ` · requires ${rule.require.replace(/_/g, " ")}` : "";
  const executeLabel = EXECUTE_LABEL[rule.execute ?? "confirm"] ?? (rule.execute ?? "unknown");

  return {
    id: `policy-${rule.id}`,
    kind: "always_on",
    locked: true,
    name: rule.id.replace(/[-_]/g, " "),
    summary: `${scopes} - ${executeLabel}${requireSuffix}`,
    createdLabel: "From your active Brain policy",
    policyId: rule.id,
    active: true,
    scopeSummary: `${scopes} · ${conditionSummary}`,
  };
}

/** Map the facts response's rule list to display cards, in rule order (the VM
 *  evaluates rules in this order and short-circuits on the first match, so
 *  order is meaningful - not re-sorted). */
export function mapPolicyToRuleCards(facts: ApprovalPolicyFacts | undefined): AutoRule[] {
  return (facts?.rules ?? []).map(mapPolicyRuleToCard);
}

export function useBrainPolicy() {
  const query = useQuery<ApprovalPolicyFacts>({
    queryKey: ["/api/brain/approval-policy"],
    retry: false,
  });
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    rules: mapPolicyToRuleCards(query.data),
    version: query.data?.version,
    quorum: query.data?.quorumRequired,
  };
}

/** Look up a single policy rule by its app-facing `policy-{id}` card id.
 *  Returns `{rule, isLoading, isError}` so callers can distinguish
 *  "not loaded yet" from "not found". */
export function usePolicyRule(cardId: string | undefined) {
  const query = useQuery<ApprovalPolicyFacts>({
    queryKey: ["/api/brain/approval-policy"],
    retry: false,
  });
  if (!cardId || !cardId.startsWith("policy-")) {
    return { rule: undefined, isLoading: false, isError: false };
  }
  const rawId = cardId.slice("policy-".length);
  return {
    rule: query.data?.rules.find((r) => r.id === rawId),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
