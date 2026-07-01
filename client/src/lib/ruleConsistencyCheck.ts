import { MOCK_AUDIT_RECORDS } from "./mockAuditRecords";
import { AUTO_HANDLED_PROPOSALS } from "./mockProposals";
import { getRule } from "./rulesStore";
import { UNTRUSTED_VENDORS } from "./mockRules";

/* ── Semantic audit-record consistency (lightweight) ───────────────────────────
   These checks go beyond "does the id resolve?" — they assert that the NARRATIVE
   in mock audit records is internally consistent with the vendor trust model and
   rule categories. This is the guard that would have caught AUD-7N2S originally
   claiming Bright Futures was auto_approved (it should be flagged for bank-detail
   change). It never throws; it only console.error's.
   ──────────────────────────────────────────────────────────────────────────── */

export type SemanticIssue = { source: string; message: string };

/* Asserts that every auto_approved audit record has a linked rule whose category
   semantically matches the counterparty's line of business.  This is deliberately
   lightweight: we only flag category/counterparty mismatches that are OBVIOUSLY
   wrong (e.g. a contractor auto-approved under a "rent & lease" rule).  */
export function checkSemanticAuditRecords(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  // Derive "under review" vendors from the data itself: any vendor that has a
  // `flagged` or `trust_revoked` audit record is conceptually under review and
  // must never also have an `auto_approved` record (held payments were not
  // cleared by a rule).  Bright Futures is the canonical example.
  const underReviewVendors = new Set<string>();
  for (const rec of MOCK_AUDIT_RECORDS) {
    if (
      (rec.eventType === "flagged" || rec.eventType === "trust_revoked") &&
      rec.counterparty
    ) {
      underReviewVendors.add(rec.counterparty);
    }
  }

  for (const rec of MOCK_AUDIT_RECORDS) {
    // 1 — An under-review vendor (flagged or trust_revoked) must never have an
    //     auto_approved record.  A held/escalated payment was NOT cleared.
    if (
      rec.eventType === "auto_approved" &&
      rec.counterparty &&
      underReviewVendors.has(rec.counterparty)
    ) {
      issues.push({
        source: `audit ${rec.id}`,
        message: `Vendor "${rec.counterparty}" is under review (has a flagged/trust_revoked record) and must not have an auto_approved record (held payments are not cleared by a rule)`,
      });
    }

    // 1b — An explicitly untrusted vendor must also never have an auto_approved
    //      record (catches vendors that are permanently untrusted but never
    //      got a flagged record in the demo data).
    if (
      rec.eventType === "auto_approved" &&
      rec.counterparty &&
      UNTRUSTED_VENDORS.includes(rec.counterparty)
    ) {
      issues.push({
        source: `audit ${rec.id}`,
        message: `Untrusted vendor "${rec.counterparty}" must not have an auto_approved record (trust revoked; always_on guards or human review required)`,
      });
    }

    // 2 — An auto_approved record with a linked rule must match on category.
    if (rec.eventType === "auto_approved" && rec.counterparty) {
      const ruleLink = rec.linked.find((l) => l.kind === "rule");
      if (ruleLink) {
        const rule = getRule(ruleLink.refId);
        if (rule) {
          const vendor = rec.counterparty.toLowerCase();
          // Known category/counterparty mismatches that are always wrong:
          const isContractorLike =
            /studio|consulting|contractor|design|creative/.test(vendor);
          const isLease =
            /lease|rent|property|landlord/.test(rule.category || "");
          const isPayroll = /payroll|gusto|benefits/.test(rule.category || "");
          if (isContractorLike && isLease) {
            issues.push({
              source: `audit ${rec.id}`,
              message: `Category mismatch: vendor "${rec.counterparty}" looks like a contractor/studio but was auto_approved under a "${rule.category}" rule ("${rule.name}")`,
            });
          }
          if (/gusto/.test(vendor) && !isPayroll) {
            issues.push({
              source: `audit ${rec.id}`,
              message: `Category mismatch: Gusto is a payroll provider but auto_approved under a non-payroll rule ("${rule.name}")`,
            });
          }
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error(
      `[semantic-consistency] ${issues.length} semantic issue(s) in mock audit records:\n` +
        issues.map((i) => `  • ${i.source} — ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[semantic-consistency] OK — every auto_approved record's vendor + rule category is coherent.",
    );
  }

  return issues;
}

/* ── Dev-time rule-reference consistency guard ────────────────────────────
   Asserts that EVERY ruleId referenced anywhere in mock data resolves to a real
   rule in the store (seeded from mockRules). This is the guard that would have
   caught the original dangling-refId bug (audit records pointing at rules that
   don't exist). It runs once in dev on boot and logs loudly — it never throws,
   so it can't break the app; it just makes drift impossible to miss.
   ──────────────────────────────────────────────────────────────────────────── */

export type RuleRef = { source: string; ruleId: string };

/* Collect every place a rule is referenced by id across mock data. */
export function collectRuleReferences(): RuleRef[] {
  const refs: RuleRef[] = [];

  // Audit records — linked entities of kind "rule".
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "rule") {
        refs.push({ source: `audit ${rec.id}`, ruleId: link.refId });
      }
    }
  }

  // Auto-handled receipts / settled cards — the embedded governing rule.
  for (const p of AUTO_HANDLED_PROPOSALS) {
    if (p.rule) {
      refs.push({ source: `receipt ${p.id}`, ruleId: p.rule.id });
    }
  }

  return refs;
}

/* Returns the unresolved references (empty when everything is consistent) and
   logs the result loudly. Safe to call anywhere; never throws. */
export function checkRuleReferences(): RuleRef[] {
  const unresolved = collectRuleReferences().filter((r) => !getRule(r.ruleId));

  if (unresolved.length > 0) {
    console.error(
      `[rule-consistency] ${unresolved.length} rule reference(s) do not resolve ` +
        `to any rule in mockRules — dangling refs will render as "(rule unavailable)":\n` +
        unresolved.map((r) => `  • ${r.source} → '${r.ruleId}'`).join("\n"),
    );
  } else {
    console.info(
      "[rule-consistency] OK — every rule reference in mock data resolves.",
    );
  }

  return unresolved;
}
