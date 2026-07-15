import { MOCK_AUDIT_RECORDS } from "./mockAuditRecords";
import { getRule } from "./rulesStore";
import { UNTRUSTED_VENDORS } from "./mockRules";
import { MOCK_VENDORS } from "./mockVendors";
import { resolveVendor } from "./openVendorDetail";
import { MOCK_DOCUMENTS } from "./mockDocuments";
import { resolveDocument } from "./openDocumentDetail";
import { allProposals, resolveProposal } from "./openProposalDetail";
import { actorIdentityTokens, ACTORS } from "./actors";
import { linkedRelationship } from "./auditTypes";

/* ── Semantic audit-record consistency (lightweight) ───────────────────────────
   These checks go beyond "does the id resolve?" - they assert that the NARRATIVE
   in mock audit records is internally consistent with the vendor trust model and
   rule categories. This is the guard that would have caught AUD-7N2S originally
   claiming Bright Futures was auto_approved (it should be flagged for bank-detail
   change). It never throws; it only console.error's.
   ──────────────────────────────────────────────────────────────────────────── */

export type SemanticIssue = { source: string; message: string };

/* Asserts that every auto_approved audit record has a linked rule whose category
   semantically matches the counterparty's line of business.  This is deliberately
   lightweight: we only flag category/counterparty mismatches that are OBVIOUSLY
   wrong (e.g. a contractor auto-approved under a "rent and lease" rule).  */
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
    // 1 - An under-review vendor (flagged or trust_revoked) must never have an
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

    // 1b - An explicitly untrusted vendor must also never have an auto_approved
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

    // 2 - An auto_approved record with a linked rule must match on category.
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
        issues.map((i) => `  • ${i.source} - ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[semantic-consistency] OK - every auto_approved record's vendor + rule category is coherent.",
    );
  }

  return issues;
}

/* ── Dev-time rule-reference consistency guard ────────────────────────────
   Asserts that EVERY ruleId referenced anywhere in mock data resolves to a real
   rule in the store (seeded from mockRules). This is the guard that would have
   caught the original dangling-refId bug (audit records pointing at rules that
   don't exist). It runs once in dev on boot and logs loudly - it never throws,
   so it can't break the app; it just makes drift impossible to miss.
   ──────────────────────────────────────────────────────────────────────────── */

export type RuleRef = { source: string; ruleId: string };

/* Collect every place a rule is referenced by id across mock data. */
export function collectRuleReferences(): RuleRef[] {
  const refs: RuleRef[] = [];

  // Audit records - linked entities of kind "rule".
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "rule") {
        refs.push({ source: `audit ${rec.id}`, ruleId: link.refId });
      }
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
        `to any rule in mockRules - dangling refs will render as "(rule unavailable)":\n` +
        unresolved.map((r) => `  • ${r.source} → '${r.ruleId}'`).join("\n"),
    );
  } else {
    console.info(
      "[rule-consistency] OK - every rule reference in mock data resolves.",
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

  // Audit records - linked entities of kind "vendor".
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "vendor") {
        refs.push({ source: `audit ${rec.id} linked vendor`, id: link.refId });
      }
    }
  }

  // Documents - the vendor they belong to (when they have a KNOWN vendor;
  // non-vendor counterparties like landlords/ledgers carry no vendorId).
  for (const doc of MOCK_DOCUMENTS) {
    if (doc.vendorId) {
      refs.push({ source: `document ${doc.id} vendorId`, id: doc.vendorId });
    }
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
      "[vendor-consistency] OK - every vendor reference (linked refs, invoice.vendorId, vendor.ruleIds) resolves.",
    );
  }

  return all;
}

/* Collect every place a DOCUMENT is referenced by id across mock data. The
   canonical documentsStore serves every DocKind (invoice / prior_payment /
   bank_transaction / contract / purchase_order); the references today are the
   audit-log linked evidence (linked kind "invoice") and a proposal's source
   document (`proposal.invoiceId`). Both must resolve or they dangle. */
export function collectDocumentReferences(): EntityRef[] {
  const refs: EntityRef[] = [];

  // Audit records - linked evidence (kind "invoice" routes to the doc viewer).
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "invoice") {
        refs.push({ source: `audit ${rec.id} linked document`, id: link.refId });
      }
    }
  }

  // Proposals (queue + receipts + standalone settled/held twins via allProposals) -
  // the source document they clear. Scope matches the lifecycle coherence check so a
  // dangling invoiceId on a standalone twin can't evade resolution.
  for (const p of allProposals()) {
    if (p.invoiceId) {
      refs.push({ source: `proposal ${p.id} invoiceId`, id: p.invoiceId });
    }
  }

  return refs;
}

export function checkDocumentReferences(): EntityRef[] {
  const unresolved = collectDocumentReferences().filter(
    (r) => !resolveDocument(r.id),
  );

  if (unresolved.length > 0) {
    console.error(
      `[document-consistency] ${unresolved.length} document reference(s) do not resolve ` +
        `to any document in mockDocuments - dangling refs will render as "(document unavailable)":\n` +
        unresolved.map((r) => `  • ${r.source} → '${r.id}'`).join("\n"),
    );
  } else {
    console.info(
      "[document-consistency] OK - every document reference (linked evidence, proposal.invoiceId) resolves.",
    );
  }

  return unresolved;
}

/* Collect every place a PROPOSAL is referenced by id across mock data. */
export function collectProposalReferences(): EntityRef[] {
  const refs: EntityRef[] = [];

  // Audit records - linked entities of kind "proposal" AND the top-level
  // `proposalId` wiring (used to deep-link the record's own proposal). Both are
  // live references, so both must resolve or they dangle.
  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const link of rec.linked) {
      if (link.kind === "proposal") {
        refs.push({ source: `audit ${rec.id} linked proposal`, id: link.refId });
      }
    }
    if (rec.proposalId) {
      refs.push({ source: `audit ${rec.id} proposalId`, id: rec.proposalId });
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
        `to any proposal (queue, receipts, or standalone records) - dangling refs will ` +
        `render as "(proposal unavailable)":\n` +
        unresolved.map((r) => `  • ${r.source} → '${r.id}'`).join("\n"),
    );
  } else {
    console.info(
      "[proposal-consistency] OK - every proposal reference in mock data resolves.",
    );
  }

  return unresolved;
}

/* ── Cross-entity COHERENCE guard ─────────────────────────────────────────
   Resolution is necessary but not sufficient - the reference can resolve yet
   still LIE. This is the gap that let rules break before (an id that resolved
   to the wrong thing). Beyond resolution, assert that:
     • a linked invoice's total == the linking audit record's amount;
     • a linked invoice's vendorId == the record's linked vendor;
     • every kind:"vendor" linked ref points at an ACTUAL vendor (catches the
       j-smith/aave misfiling class - a payroll employee or DeFi protocol
       masquerading as a vendor);
     • a vendor with a linked PAID invoice is not contradicted by zero payment
       history (paymentCount === 0).
   PLUS the lifecycle-state coherence that catches "resolves-but-lies" across the
   proposal → invoice → audit → anchor chain (a reference that resolves to the
   WRONG lifecycle state):
     • a SETTLED audit record (approved / auto_approved) must not link a proposal
       that is still pending/verifying/postponed - a settled/anchored event can't
       point at an un-acted proposal (catches the AUD-3308FE → prop-aws(pending)
       class);
     • a linked invoice's status must match the record's event type
       (approved/auto_approved ⇒ paid; flagged ⇒ held);
     • a proposal's invoiceId must match its own lifecycle - a pending/verifying/
       postponed proposal must not OWN a paid invoice, and a settled proposal
       (executed/auto_handled) must own a paid one (catches the pending-proposal-
       owns-settled-invoice class);
     • an invoice's vendorName must equal its resolved vendor.name (catches the
       vendor-rename drift where the invoice and the catalogue disagree).
   NOTE: a FLAGGED record CAN link a pending proposal and CAN be anchored (a hold
   is itself an auditable event) - see AUD-3K8Q - so neither is treated as a lie.
   Display labels (linked-ref label, counterparty) are allowed to differ from a
   vendor's canonical name (e.g. "Notion Team" vs "Notion Labs"), so labels are
   NOT equality-checked.
   (The "no auto_approved record for an under_review vendor" invariant lives in
   checkSemanticAuditRecords above.) Logs loudly, never throws.
   ──────────────────────────────────────────────────────────────────────────── */
// Lifecycle buckets over ProposalStatus. `executing` is deliberately in NEITHER:
// it's an in-flight, approved-but-not-yet-settled state, so its invoice can
// legitimately still be unpaid/held - asserting either way would misfire.
//   UNSETTLED - never acted on / declined: must NOT own a paid invoice, and a
//               settled (approved/auto_approved) audit record must NOT link one.
//   SETTLED   - actually paid out: MUST own a paid invoice.
const UNSETTLED_STATUSES: ReadonlyArray<string> = [
  "pending",
  "verifying",
  "postponed",
  "rejected",
];
const SETTLED_STATUSES: ReadonlyArray<string> = ["executed", "auto_handled"];

export function checkReferenceCoherence(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  for (const rec of MOCK_AUDIT_RECORDS) {
    const invLink = rec.linked.find((l) => l.kind === "invoice");
    const venLink = rec.linked.find((l) => l.kind === "vendor");
    const propLink = rec.linked.find((l) => l.kind === "proposal");
    const isSettledEvent =
      rec.eventType === "approved" || rec.eventType === "auto_approved";

    // Every kind:"vendor" ref must point at an actual vendor.
    if (venLink && !resolveVendor(venLink.refId)) {
      issues.push({
        source: `audit ${rec.id}`,
        message: `linked vendor '${venLink.refId}' is not an actual vendor - a non-vendor counterparty (employee/protocol/ledger) is misfiled as kind:"vendor"`,
      });
    }

    // Lifecycle coherence: a settled record must not link an un-acted proposal.
    if (propLink && isSettledEvent) {
      const prop = resolveProposal(propLink.refId);
      if (prop && UNSETTLED_STATUSES.includes(prop.status)) {
        issues.push({
          source: `audit ${rec.id}`,
          message: `is a settled ${rec.eventType} record but its linked proposal '${prop.id}' is still ${prop.status} - a settled/anchored event cannot point at an un-acted proposal`,
        });
      }
    }

    if (invLink) {
      const doc = resolveDocument(invLink.refId);
      if (doc) {
        // Amount coherence: document amount must match the record amount.
        if (typeof rec.amount === "number" && doc.amount !== rec.amount) {
          issues.push({
            source: `audit ${rec.id}`,
            message: `linked document ${doc.id} amount (${doc.amount}) ≠ record amount (${rec.amount})`,
          });
        }
        // Vendor coherence: document.vendorId must match the record's vendor.
        // (Only when the document names a KNOWN vendor - non-vendor
        // counterparties carry no vendorId and are checked below.)
        if (venLink && doc.vendorId && doc.vendorId !== venLink.refId) {
          issues.push({
            source: `audit ${rec.id}`,
            message: `linked document ${doc.id} vendorId ('${doc.vendorId}') ≠ record's linked vendor ('${venLink.refId}')`,
          });
        }
        // Status coherence: document status must match the record's event type.
        // Only meaningful for kinds with a payment lifecycle (a status set).
        if (doc.status) {
          if (isSettledEvent && doc.status !== "paid") {
            issues.push({
              source: `audit ${rec.id}`,
              message: `is a settled ${rec.eventType} record but linked document ${doc.id} status is '${doc.status}' (expected 'paid')`,
            });
          }
          if (rec.eventType === "flagged" && doc.status !== "held") {
            issues.push({
              source: `audit ${rec.id}`,
              message: `is a flagged/held record but linked document ${doc.id} status is '${doc.status}' (expected 'held')`,
            });
          }
        }
      }
    }
  }

  // Proposal ↔ invoice lifecycle coherence over EVERY proposal source (queue,
  // receipts, AND standalone settled/held twins via allProposals) - otherwise
  // exactly the twins this guard exists to protect (e.g. settled-aws) escape it.
  // An unsettled proposal must not own a paid invoice; a settled one must.
  for (const p of allProposals()) {
    if (!p.invoiceId) continue;
    const doc = resolveDocument(p.invoiceId);
    if (!doc) continue; // resolution is covered by checkDocumentReferences
    // Amount coherence: a proposal's source document amount must match the
    // payment amount it clears (both present).
    if (
      typeof p.amount === "number" &&
      typeof doc.amount === "number" &&
      doc.amount !== p.amount
    ) {
      issues.push({
        source: `proposal ${p.id}`,
        message: `amount (${p.amount}) ≠ its source document ${doc.id} amount (${doc.amount})`,
      });
    }
    // Lifecycle coherence only applies to documents that HAVE a payment status
    // (invoice / prior_payment / purchase_order); bank_transaction & contract
    // carry no status and are legitimately linked by proposals of any state.
    if (doc.status) {
      if (UNSETTLED_STATUSES.includes(p.status) && doc.status === "paid") {
        issues.push({
          source: `proposal ${p.id}`,
          message: `is ${p.status} but its linked document ${doc.id} is already 'paid' - an unsettled proposal cannot own a settled document`,
        });
      }
      if (SETTLED_STATUSES.includes(p.status) && doc.status !== "paid") {
        issues.push({
          source: `proposal ${p.id}`,
          message: `is ${p.status} (settled) but its linked document ${doc.id} status is '${doc.status}' (expected 'paid')`,
        });
      }
    }
  }

  for (const doc of MOCK_DOCUMENTS) {
    // A KNOWN vendor with a paid document must have real payment history.
    if (doc.status === "paid" && doc.vendorId) {
      const v = resolveVendor(doc.vendorId);
      if (v && v.history.paymentCount === 0) {
        issues.push({
          source: `vendor ${v.id}`,
          message: `has a linked paid document (${doc.id}) but zero payment history (paymentCount === 0)`,
        });
      }
    }
    // Name coherence: a KNOWN vendor's document.vendorName must match the
    // catalogue vendor.name.
    if (doc.vendorId) {
      const v = resolveVendor(doc.vendorId);
      if (v && doc.vendorName && doc.vendorName !== v.name) {
        issues.push({
          source: `document ${doc.id}`,
          message: `vendorName '${doc.vendorName}' ≠ resolved vendor.name '${v.name}' (vendorId '${doc.vendorId}') - document names its vendor differently from the catalogue`,
        });
      }
    }
    // A document naming a KNOWN vendor must also carry a vendorName (so the
    // viewer can render the catalogue name without a second lookup).
    if (doc.vendorId && !doc.vendorName) {
      issues.push({
        source: `document ${doc.id}`,
        message: `has vendorId '${doc.vendorId}' but no vendorName`,
      });
    }
    // bank_transaction records ARE the reconciliation evidence - they must
    // carry a reconciliation block or the viewer has nothing to render.
    if (doc.kind === "bank_transaction" && !doc.reconciliation) {
      issues.push({
        source: `document ${doc.id}`,
        message: `is a bank_transaction but has no reconciliation block`,
      });
    }
    // Compare pair coherence: a document's compareToId twin must resolve, name
    // the SAME vendor (when both are known vendors), and sit within a small
    // amount band - the pair exists to surface a duplicate / bank-detail change,
    // so a wildly different vendor or amount would be an incoherent comparison.
    if (doc.compareToId) {
      const twin = resolveDocument(doc.compareToId);
      if (!twin) {
        issues.push({
          source: `document ${doc.id}`,
          message: `compareToId '${doc.compareToId}' does not resolve to a document`,
        });
      } else {
        if (doc.vendorId && twin.vendorId && doc.vendorId !== twin.vendorId) {
          issues.push({
            source: `document ${doc.id}`,
            message: `compare twin ${twin.id} names a different vendor ('${twin.vendorId}' ≠ '${doc.vendorId}') - the comparison is incoherent`,
          });
        }
        if (
          typeof doc.amount === "number" &&
          typeof twin.amount === "number" &&
          twin.amount > 0
        ) {
          const delta = Math.abs(doc.amount - twin.amount) / twin.amount;
          if (delta > 0.05) {
            issues.push({
              source: `document ${doc.id}`,
              message: `compare twin ${twin.id} amount (${twin.amount}) differs from ${doc.amount} by ${(delta * 100).toFixed(1)}% (> 5%) - too far apart to be a duplicate/bank-change pair`,
            });
          }
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error(
      `[coherence] ${issues.length} cross-entity coherence issue(s) in mock data:\n` +
        issues.map((i) => `  • ${i.source} - ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[coherence] OK - linked document amounts/vendors/status match their records, compare pairs are coherent, and no vendor contradicts its paid documents.",
    );
  }

  return issues;
}

/* ── ANCHOR-UI coherence guard ────────────────────────────────────────────
   Verification is only real once a record is anchored on-chain. A record still
   "pending_next_batch" must NOT advertise a verifiable state at the DATA level:
   no merkleRoot / baseTx / verifyHref may be present (there is nothing to link
   to yet). Asserting at the data level is what keeps the ONE shared AnchorStatus
   component honest across every surface (audit popup, settled card, receipt) -
   the UI renders Verify disabled purely from anchor.status, so a pending record
   that carried hashes/href would be a lie waiting to leak into the UI.
   ──────────────────────────────────────────────────────────────────────────── */
export function checkAnchorUiCoherence(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  for (const rec of MOCK_AUDIT_RECORDS) {
    if (rec.anchor.status !== "pending_next_batch") continue;
    const leaked: string[] = [];
    if (rec.anchor.merkleRoot) leaked.push("merkleRoot");
    if (rec.anchor.baseTx) leaked.push("baseTx");
    if (rec.anchor.verifyHref) leaked.push("verifyHref");
    if (leaked.length > 0) {
      issues.push({
        source: `audit ${rec.id}`,
        message: `is anchor.status "pending_next_batch" but carries ${leaked.join(", ")} - a not-yet-anchored record must not present a verifiable/linkable proof`,
      });
    }
  }

  if (issues.length > 0) {
    console.error(
      `[anchor-ui-consistency] ${issues.length} anchor-state issue(s) in mock data:\n` +
        issues.map((i) => `  • ${i.source} - ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[anchor-ui-consistency] OK - no pending_next_batch record advertises hashes or a verify link.",
    );
  }

  return issues;
}

/* ── AGENT-DOMAIN coherence guard ─────────────────────────────────────────
   The proposing agent on an audit record must stay inside its own domain per the
   canonical agent catalog: Invoice = AP / vendor payments (incl. payroll runs &
   subscriptions), Collections = AR, Cash = treasury / sweep, Close =
   reconciliation. This catches the class where an agent proposes outside its lane
   (e.g. the Close Agent - reconciliation - "proposing a payroll run" or a vendor
   payment, which belongs to the Invoice Agent).
   The proposing agent lives only in the lifecycle label ("<X> Agent proposed |
   detected …"), so we parse it, then match the ACTION PHRASE against per-domain
   keywords. We flag ONLY when the phrase clearly belongs to a different agent's
   domain and NOT the proposing agent's - an ambiguous phrase (no keyword match)
   is skipped, so the guard never fires false positives on future copy. Never
   throws; only console.error's.
   ──────────────────────────────────────────────────────────────────────────── */
const AGENT_DOMAIN_KEYWORDS: Record<string, RegExp> = {
  // Invoice Agent - accounts payable: vendor payments, payroll, subscriptions, bills.
  invoice: /payment|payroll|invoice|subscription|renewal|utility|bill|vendor|ach to/,
  // Collections Agent - accounts receivable: chasing money owed TO the business.
  collections: /receivable|overdue|reminder|dunning|collection|past due/,
  // Cash Agent - treasury: idle-balance sweeps, yield moves.
  cash: /sweep|yield|idle|treasury|savings|operating balance|deposit to/,
  // Close Agent - reconciliation: ledger/close discrepancies, correcting entries.
  close: /reconcil|ledger|correcting entry|close period|month-end|journal entry/,
};

export function checkAgentDomainCoherence(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const PROPOSE_RE = /^(Invoice|Collections|Cash|Close) Agent (?:proposed|detected) (.+)$/;

  for (const rec of MOCK_AUDIT_RECORDS) {
    for (const step of rec.lifecycle) {
      const m = step.label.match(PROPOSE_RE);
      if (!m) continue;
      const agent = m[1].toLowerCase();
      const phrase = m[2].toLowerCase();

      // Which domains does the action phrase belong to?
      const matchedDomains = Object.keys(AGENT_DOMAIN_KEYWORDS).filter((a) =>
        AGENT_DOMAIN_KEYWORDS[a].test(phrase),
      );
      // Ambiguous (no domain keyword) → can't judge, skip.
      if (matchedDomains.length === 0) continue;
      // Coherent if the proposing agent is one of the matched domains.
      if (matchedDomains.includes(agent)) continue;

      issues.push({
        source: `audit ${rec.id}`,
        message: `${m[1]} Agent proposed/detected "${m[2]}" - that action is in the ${matchedDomains.join("/")} domain, not the ${agent} agent's. An agent must not act outside its catalog domain.`,
      });
    }
  }

  if (issues.length > 0) {
    console.error(
      `[agent-domain-consistency] ${issues.length} record → agent mismatch(es) in mock data:\n` +
        issues.map((i) => `  • ${i.source} - ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[agent-domain-consistency] OK - every audit record's proposing agent stays inside its catalog domain.",
    );
  }

  return issues;
}

/* Segregation of duties: the human ACTOR who approved a payment must never be the
   same party as the PAYEE it moves money to. Payment records surface both the
   approver (lifecycle step `actor`) and the receiving counterparty (linked
   vendor/employee); if those resolve to the same identity, the record fails a
   basic four-eyes control. Gating to PAYEE rows reuses the SHARED
   `linkedRelationship` predicate (payment event type + numeric amount + receiving
   kind), so this guard can never drift from what the UI labels a payee - non-payment
   governance rows, treasury destinations (protocol/ledger) and evidence
   (rule/invoice/proposal) are all skipped. Compares actor identity tokens (raw +
   resolved email/id) against the payee's label/refId (+ resolved vendor name).
   Passes clean on current mock data (sarah@meridian is never a payee). */
function norm(v?: string): string {
  return (v ?? "").trim().toLowerCase();
}
export function checkActorPayeeSegregation(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  for (const rec of MOCK_AUDIT_RECORDS) {
    // Collect every human actor that acted on this record (only approval-type
    // steps carry `actor`; system steps omit it).
    const actorTokens = new Set<string>();
    for (const step of rec.lifecycle) {
      for (const t of actorIdentityTokens(step.actor)) actorTokens.add(t);
    }
    if (actorTokens.size === 0) continue; // no human actor → nothing to segregate

    for (const link of rec.linked) {
      // Only true payees on payment records - same derivation the UI chip uses.
      if (linkedRelationship(rec, link) !== "PAYEE") continue;
      const payeeTokens = new Set<string>([norm(link.label), norm(link.refId)]);
      if (link.kind === "vendor") {
        const vendor = resolveVendor(link.refId);
        if (vendor) payeeTokens.add(norm(vendor.name));
      }
      payeeTokens.delete("");

      const overlap = Array.from(actorTokens).find((t) => payeeTokens.has(t));
      if (overlap) {
        issues.push({
          source: `audit ${rec.id}`,
          message: `approver "${overlap}" is also the payee (${link.kind} "${link.label}") - an actor must never approve a payment to themselves (segregation of duties).`,
        });
      }
    }
  }

  if (issues.length > 0) {
    console.error(
      `[actor-payee-segregation] ${issues.length} record(s) where the approver is also the payee:\n` +
        issues.map((i) => `  • ${i.source} - ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[actor-payee-segregation] OK - no audit record has the same party as both approver and payee.",
    );
  }

  return issues;
}

/* ── Member ↔ actor seam coherence ─────────────────────────────────────────────
   Members are CORE-BACKED (fetched at runtime, ephemeral ids) so this guard can't
   assert against live member data at boot. What it CAN protect is the client seam
   that links an audit ACTOR to a core member: `resolveMemberByTokens` matches by
   normalized email/id, so the ACTORS registry those tokens come from must be
   unambiguous. Duplicate or empty email/id would make an actor resolve to the wrong
   member (or silently fail to link). Never throws; only console.error's.
   ──────────────────────────────────────────────────────────────────────────── */
export function checkMemberActorCoherence(): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const seenEmail = new Map<string, string>();
  const seenId = new Map<string, string>();

  for (const a of ACTORS) {
    const email = norm(a.email);
    const id = norm(a.id);
    if (!email) {
      issues.push({ source: `actor ${a.id}`, message: `actor has an empty email - the member link resolves by email/id and would break.` });
    }
    if (!id) {
      issues.push({ source: `actor ${a.email}`, message: `actor has an empty id.` });
    }
    if (email) {
      const prev = seenEmail.get(email);
      if (prev) issues.push({ source: `actor ${a.id}`, message: `duplicate actor email "${a.email}" (also on "${prev}") - an audit actor would resolve ambiguously to a member.` });
      else seenEmail.set(email, a.id);
    }
    if (id) {
      const prev = seenId.get(id);
      if (prev) issues.push({ source: `actor ${a.id}`, message: `duplicate actor id "${a.id}" (also on "${prev}").` });
      else seenId.set(id, a.email);
    }
  }

  if (issues.length > 0) {
    console.error(
      `[member-actor-coherence] ${issues.length} issue(s) in the actor↔member seam:\n` +
        issues.map((i) => `  • ${i.source} - ${i.message}`).join("\n"),
    );
  } else {
    console.info(
      "[member-actor-coherence] OK - actor registry ids/emails are unambiguous for member linking.",
    );
  }

  return issues;
}
