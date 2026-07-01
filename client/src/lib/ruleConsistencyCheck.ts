import { MOCK_AUDIT_RECORDS } from "./mockAuditRecords";
import { AUTO_HANDLED_PROPOSALS, MOCK_PROPOSALS } from "./mockProposals";
import { getRule } from "./rulesStore";
import { UNTRUSTED_VENDORS } from "./mockRules";
import { MOCK_VENDORS } from "./mockVendors";
import { resolveVendor } from "./openVendorDetail";
import { MOCK_INVOICES } from "./mockInvoices";
import { resolveInvoice } from "./openInvoiceDetail";
import { resolveProposal } from "./openProposalDetail";

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

/* ── Vendor + invoice reference resolution guard ──────────────────────────
   Mirrors checkRuleReferences for the other two entity types. Asserts that
   EVERY vendor id and EVERY invoice id referenced anywhere in mock data
   resolves to a real store entity. This is the guard whose ABSENCE let the
   vendor-id drift (aws / adobe / comcast / bright-futures / …) ship silently.
   Also asserts vendor.ruleIds resolve to real rules (the reverse edge).
   Runs in dev on boot, logs loudly, never throws.
   ──────────────────────────────────────────────────────────────────────────── */

export type EntityRef = { source: string; id: string };

/* Collect every place a VENDOR is referenced by id across mock data. */
export function collectVendorReferences(): EntityRef[] {
  const refs: EntityRef[] = [];

  // Audit records — linked entities of kind "vendor".
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "vendor") {
        refs.push({ source: `audit ${rec.id} linked vendor`, id: link.refId });
      }
    }
  }

  // Invoices — the vendor they belong to.
  for (const inv of MOCK_INVOICES) {
    refs.push({ source: `invoice ${inv.id} vendorId`, id: inv.vendorId });
  }

  return refs;
}

export function checkVendorReferences(): EntityRef[] {
  const unresolved = collectVendorReferences().filter(
    (r) => !resolveVendor(r.id),
  );

  // Reverse edge: every rule a vendor claims membership of must exist.
  const badRuleEdges: EntityRef[] = [];
  for (const v of MOCK_VENDORS) {
    for (const rid of v.ruleIds) {
      if (!getRule(rid)) {
        badRuleEdges.push({ source: `vendor ${v.id} ruleId`, id: rid });
      }
    }
  }

  const all = [...unresolved, ...badRuleEdges];
  if (all.length > 0) {
    console.error(
      `[vendor-consistency] ${all.length} vendor reference(s) do not resolve ` +
        `to any vendor in mockVendors (or a vendor.ruleIds points at a missing rule):\n` +
        all.map((r) => `  • ${r.source} → '${r.id}'`).join("\n"),
    );
  } else {
    console.info(
      "[vendor-consistency] OK — every vendor reference (linked refs, invoice.vendorId, vendor.ruleIds) resolves.",
    );
  }

  return all;
}

/* Collect every place an INVOICE is referenced by id across mock data. */
export function collectInvoiceReferences(): EntityRef[] {
  const refs: EntityRef[] = [];

  // Audit records — linked entities of kind "invoice".
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "invoice") {
        refs.push({ source: `audit ${rec.id} linked invoice`, id: link.refId });
      }
    }
  }

  // Proposals (pending + auto-handled) — the invoice they clear.
  for (const p of [...MOCK_PROPOSALS, ...AUTO_HANDLED_PROPOSALS]) {
    if (p.invoiceId) {
      refs.push({ source: `proposal ${p.id} invoiceId`, id: p.invoiceId });
    }
  }

  return refs;
}

export function checkInvoiceReferences(): EntityRef[] {
  const unresolved = collectInvoiceReferences().filter(
    (r) => !resolveInvoice(r.id),
  );

  if (unresolved.length > 0) {
    console.error(
      `[invoice-consistency] ${unresolved.length} invoice reference(s) do not resolve ` +
        `to any invoice in mockInvoices — dangling refs will render as "(invoice unavailable)":\n` +
        unresolved.map((r) => `  • ${r.source} → '${r.id}'`).join("\n"),
    );
  } else {
    console.info(
      "[invoice-consistency] OK — every invoice reference (linked refs, proposal.invoiceId) resolves.",
    );
  }

  return unresolved;
}

/* Collect every place a PROPOSAL is referenced by id across mock data. */
export function collectProposalReferences(): EntityRef[] {
  const refs: EntityRef[] = [];

  // Audit records — linked entities of kind "proposal".
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "proposal") {
        refs.push({ source: `audit ${rec.id} linked proposal`, id: link.refId });
      }
    }
  }

  return refs;
}

export function checkProposalReferences(): EntityRef[] {
  const unresolved = collectProposalReferences().filter(
    (r) => !resolveProposal(r.id),
  );

  if (unresolved.length > 0) {
    console.error(
      `[proposal-consistency] ${unresolved.length} proposal reference(s) do not resolve ` +
        `to any proposal (queue, receipts, or standalone records) — dangling refs will ` +
        `render as "(proposal unavailable)":\n` +
        unresolved.map((r) => `  • ${r.source} → '${r.id}'`).join("\n"),
    );
  } else {
    console.info(
      "[proposal-consistency] OK — every proposal reference in mock data resolves.",
    );
  }

  return unresolved;
}

/* ── Cross-entity COHERENCE guard ─────────────────────────────────────────
   Resolution is necessary but not sufficient — the reference can resolve yet
   still LIE. This is the gap that let rules break before (an id that resolved
   to the wrong thing). Beyond resolution, assert that:
     • a linked invoice's total == the linking audit record's amount;
     • a linked invoice's vendorId == the record's linked vendor;
     • every kind:"vendor" linked ref points at an ACTUAL vendor (catches the
       j-smith/aave misfiling class — a payroll employee or DeFi protocol
       masquerading as a vendor);
     • a vendor with a linked PAID invoice is not contradicted by zero payment
       history (paymentCount === 0).
   (The "no auto_approved record for an under_review vendor" invariant lives in
   checkSemanticAuditRecords above.) Logs loudly, never throws.
   ──────────────────────────────────────────────────────────────────────────── */
export function checkReferenceCoherence(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  for (const rec of MOCK_AUDIT_RECORDS) {
    const invLink = rec.linked.find((l) => l.kind === "invoice");
    const venLink = rec.linked.find((l) => l.kind === "vendor");

    // Every kind:"vendor" ref must point at an actual vendor.
    if (venLink && !resolveVendor(venLink.refId)) {
      issues.push({
        source: `audit ${rec.id}`,
        message: `linked vendor '${venLink.refId}' is not an actual vendor — a non-vendor counterparty (employee/protocol/ledger) is misfiled as kind:"vendor"`,
      });
    }

    if (invLink) {
      const inv = resolveInvoice(invLink.refId);
      if (inv) {
        // Amount coherence: invoice total must match the record amount.
        if (typeof rec.amount === "number" && inv.total !== rec.amount) {
          issues.push({
            source: `audit ${rec.id}`,
            message: `linked invoice ${inv.id} total (${inv.total}) ≠ record amount (${rec.amount})`,
          });
        }
        // Vendor coherence: invoice.vendorId must match the record's vendor.
        if (venLink && inv.vendorId !== venLink.refId) {
          issues.push({
            source: `audit ${rec.id}`,
            message: `linked invoice ${inv.id} vendorId ('${inv.vendorId}') ≠ record's linked vendor ('${venLink.refId}')`,
          });
        }
      }
    }
  }

  // A vendor with a linked PAID invoice must have real payment history.
  for (const inv of MOCK_INVOICES) {
    if (inv.status === "paid") {
      const v = resolveVendor(inv.vendorId);
      if (v && v.history.paymentCount === 0) {
        issues.push({
          source: `vendor ${v.id}`,
          message: `has a linked paid invoice (${inv.id}) but zero payment history (paymentCount === 0)`,
        });
      }
    }
  }

  if (issues.length > 0) {
    console.error(
      `[coherence] ${issues.length} cross-entity coherence issue(s) in mock data:\n` +
        issues.map((i) => `  • ${i.source} — ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[coherence] OK — linked invoice amounts/vendors match their records and no vendor contradicts its paid invoices.",
    );
  }

  return issues;
}
