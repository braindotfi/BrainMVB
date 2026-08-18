import { useQuery } from "@tanstack/react-query";
import type { AutoRule } from "./proposalTypes";
import { useCurrency } from "./useCurrency";

/* ── Live brain-core policy → read only rule cards ────────────────────────────
   Surfaces the tenant's ACTUAL signed policy document on the Rules page via
   the EXISTING `GET /api/brain/approval-policy` route (server/brain/proxy.ts,
   backed by server/brain/client.ts's `getApprovalPolicyFacts`) - no new BFF
   route added. That function already reads `GET /policy/{tenantId}` for
   TeamSection's locked rows but only returned ONE derived fact (the
   second-approval threshold). FLAG: this Phase 2a change WIDENS its response
   to also include `version`, `quorumRequired`, and the full `rules[]` array
   (server/brain/client.ts's `ApprovalPolicyFacts` + `PolicyContentRule`, now
   exported) so the Rules page can render every clause, not just one number.
   Still a read only GET on the member token - no new scope, no new write path,
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
   `kind: "always_on"` so it renders in the read only style, never mixed into
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
  /** Policy engine version from brain-core's top-level `version` field.
   *  null means core did not return a version — NOT the same as "v1". */
  version: number | null;
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

/** Format a numeric string (e.g. "50000.00") from brain-core with comma separators. */
function fmtAmt(v: string): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return v;
  const decimals = (v.split(".")[1] ?? "").length;
  return n.toLocaleString("en-US", { minimumFractionDigits: Math.max(decimals, 2), maximumFractionDigits: Math.max(decimals, 2) });
}

const C_LEVEL = new Set(["cfo", "ceo", "coo", "cto", "cmo", "cpo", "cro"]);
/** Render a `require` field value (e.g. "single_signer", "cfo") as plain English
 *  with C-suite acronyms uppercased. */
function formatRequire(require: string): string {
  return require
    .replace(/_/g, " ")
    .replace(/\b\w+/g, (w) => C_LEVEL.has(w.toLowerCase()) ? w.toUpperCase() : w);
}

/** Plain-English rendering of a rule's `when` clause. Only the fields
 *  brain-core's DSL actually defines (dsl.ts:48-67) - no invented conditions. */
export function describeWhen(when: Record<string, unknown>, fmt: (v: string | number) => string = (v) => fmtAmt(String(v))): string[] {
  const parts: string[] = [];
  const amountGt = when["amount.gt"] as { value?: string; currency?: string } | undefined;
  const amountLte = when["amount.lte"] as { value?: string; currency?: string } | undefined;
  if (amountGt?.value) parts.push(`over ${fmt(amountGt.value)}`);
  if (amountLte?.value) parts.push(`up to ${fmt(amountLte.value)}`);
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

/** Map one brain-core policy rule to the app's read only rule-card shape.
 *  Always `locked: true` - Phase 2a is display-only; mutation needs the
 *  policy-sign scope the token lacks (Phase 2b). */
export function mapPolicyRuleToCard(rule: PolicyContentRule, fmt?: (v: string | number) => string): AutoRule {
  const appliesTo = rule.applies_to ?? [];
  const scopes = appliesTo.length > 0
    ? appliesTo.map((a) => APPLIES_TO_LABEL[a] ?? a).join(", ")
    : "any action";
  const conditions = describeWhen(rule.when ?? {}, fmt);
  const conditionSummary = conditions.length > 0 ? conditions.join(" · ") : "no conditions";
  const requireSuffix = rule.require ? ` · requires ${formatRequire(rule.require)}` : "";
  const executeLabel = EXECUTE_LABEL[rule.execute ?? "confirm"] ?? (rule.execute ?? "unknown");
  // Conditions are included in the summary so the card is self-describing.
  // Without this, an auto rule with an allowlist + cap + risk gate reads as
  // "runs automatically" unconditionally, which is actively misleading.
  const conditionInfix = conditions.length > 0 ? ` · ${conditions.join(" · ")}` : "";

  return {
    id: `policy-${rule.id}`,
    kind: "always_on",
    locked: true,
    name: rule.id.replace(/[-_]/g, " "),
    summary: `${scopes} - ${executeLabel}${conditionInfix}${requireSuffix}`,
    createdLabel: "From your active Brain policy",
    policyId: rule.id,
    active: true,
    scopeSummary: `${scopes} · ${conditionSummary}`,
  };
}

/** Map the facts response's rule list to display cards, in rule order (the VM
 *  evaluates rules in this order and short-circuits on the first match, so
 *  order is meaningful - not re-sorted). */
export function mapPolicyToRuleCards(facts: ApprovalPolicyFacts | undefined, fmt?: (v: string | number) => string): AutoRule[] {
  return (facts?.rules ?? []).map((r) => mapPolicyRuleToCard(r, fmt));
}

/** Group a brain-core amount string ("50000.00") without going through a float.
 *  Parsing to Number and re-formatting can round a value that is being shown as
 *  an authorization limit, so the digits are grouped as text. */
export function groupPolicyAmount(value: string): string {
  const [int, frac] = value.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export type AutoApproveLimit =
  /** One unconditional "runs automatically up to X" line. */
  | { kind: "limit"; value: string; currency: string }
  /** Auto-execution exists, but only under conditions beyond a plain amount cap. */
  | { kind: "conditional" }
  /** Nothing in the policy runs automatically. */
  | { kind: "none" }
  /** The policy answered but cannot be read: the rule collection is missing or
   *  not the shape it claims to be. Distinct from "none" on purpose — the
   *  declared TypeScript type does not validate what the BFF actually sends, so
   *  a malformed payload would otherwise arrive here as an authoritative
   *  "nothing is automated". Callers must present this as unknown. */
  | { kind: "unknown" };

/** Rules that can match an outbound payment. An absent/empty `applies_to` is
 *  "any action" (the same reading `mapPolicyRuleToCard` uses), which includes
 *  payments. Anything scoped only to ledger writes or inbound money cannot
 *  decide what a payment does, in either direction. */
const PAYMENT_SCOPES = new Set(["outbound_payment", "any"]);
function coversPayments(rule: PolicyContentRule): boolean {
  const applies = rule.applies_to ?? [];
  return applies.length === 0 || applies.some((a) => PAYMENT_SCOPES.has(a));
}

/** Derive the auto-approve line for OUTBOUND PAYMENTS from an activated policy.
 *
 *  Two things make this narrower than "find an auto rule with an amount cap",
 *  and both exist because overstating here tells a finance lead that a payment
 *  will go out untouched when it will not, or the reverse:
 *
 *  1. ORDER. brain-core's VM evaluates rules in order and short-circuits on the
 *     first match, so an auto rule is only the effective answer if no earlier
 *     payment-scoped rule can claim the same payment first. Rather than
 *     re-implementing the DSL's matching to prove non-overlap, only the FIRST
 *     payment-scoped rule may be reported as the payment-wide line. A qualifying
 *     auto rule sitting behind another payment rule reports as "conditional" —
 *     vague, but never false.
 *  2. SCOPE. A rule that auto-executes ledger writes is not a payment limit and
 *     is not counted as one, in either direction.
 *
 *  The condition itself must also be a bare `amount.lte`. "Auto up to $5k for a
 *  named counterparty" is not a blanket limit, and rendering its number as one
 *  would claim automation that most payments do not get.
 *
 *  `undefined` facts (loading, unreachable, or no policy) are the caller's to
 *  distinguish — this returns nothing for them rather than a reassuring "none".
 */
export function autoApproveLimitFromPolicy(facts: ApprovalPolicyFacts | undefined): AutoApproveLimit | null {
  if (!facts) return null;
  /* The declared type is not a runtime guarantee: this comes off the BFF. A
     response missing `rules`, or carrying something other than a list of rule
     objects, tells us nothing about what is automated -- and the old
     `facts.rules ?? []` turned exactly that into a confident `{kind:"none"}`,
     which the Settings row renders as "Nothing runs automatically". For a
     money-authorization figure that is the worst available answer, so an
     unreadable rule set is reported as unknown. */
  const rules = facts.rules;
  if (!Array.isArray(rules) || rules.some((r) => typeof r !== "object" || r === null)) {
    return { kind: "unknown" };
  }
  const paymentRules = rules.filter(coversPayments);

  /* No rule that can touch a payment executes automatically: nothing about
     payments is automated, whatever the rest of the policy does. */
  if (!paymentRules.some((r) => r.execute === "auto")) return { kind: "none" };

  const first = paymentRules[0];
  if (first.execute !== "auto") return { kind: "conditional" };

  const when = first.when ?? {};
  const keys = Object.keys(when);
  if (keys.length !== 1 || keys[0] !== "amount.lte") return { kind: "conditional" };
  const lte = when["amount.lte"] as { value?: string; currency?: string } | undefined;
  if (!lte?.value) return { kind: "conditional" };

  return { kind: "limit", value: lte.value, currency: lte.currency ?? "USD" };
}

/** brain-core returns 404 `policy_not_found` for a tenant with no policy document
 *  activated yet (e.g. fresh production tenant) — that's an honest empty set, not a
 *  load failure. Real network/5xx errors still surface as errors. */
function isPolicyNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("policy_not_found");
}

export function useBrainPolicy() {
  const { format } = useCurrency();
  const query = useQuery<ApprovalPolicyFacts>({
    queryKey: ["/api/brain/approval-policy"],
    retry: false,
  });
  const notFound = isPolicyNotFound(query.error);
  return {
    isLoading: query.isLoading,
    isError: query.isError && !notFound,
    rules: notFound ? [] : mapPolicyToRuleCards(query.data, format),
    /* The raw document as well as the rendered cards. `mapPolicyRuleToCard` throws
       away the numbers — it renders `when` to prose — and bulk approve has to
       COMPARE against them, so it reads the facts rather than re-parsing a
       sentence. Undefined while loading or unreachable, which callers must treat
       as "no thresholds known", never as "no thresholds apply". */
    facts: notFound ? undefined : query.data,
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
    isError: query.isError && !isPolicyNotFound(query.error),
  };
}
