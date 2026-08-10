import { describe, it, expect } from "vitest";
import {
  buildProposalDetailRows,
  buildProposalHeadline,
  initialsOf,
  isRawIdentifier,
  humanizeEnumValue,
  buildKeyFactRows,
  buildFlaggedBy,
  buildDecisionButtons,
  buildConsequences,
  buildConfidence,
  buildWhySuggested,
  MAX_REASON_BULLETS,
  buildEvidenceTiles,
  isDecidableProposal,
  keyFactsFromPresentation,
  resolveHeadlineText,
  resolveProseText,
  buildRefDisplayMap,
  buildCollectionsDraft,
  applyCurrencyToBareAmounts,
  formatFactDate,
  formatSourceAmount,
  titleCaseDecisionLabel,
  titleCaseLabel,
  buildProposalHeaderCopy,
  proposalInvoiceIdentity,
} from "./proposalCards";
import type { ProposalEvidenceItem } from "./brainProposals";

const money = (a: { value: string; currency: string }) =>
  `$${Number(a.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const invoice: ProposalEvidenceItem = {
  kind: "invoice",
  ref: "inv_01KYSG21MMMHAPE101816VTQNB",
  resolvable: true,
  label: "Invoice",
  display: "Invoice #INV-1042",
  amount: { value: "18600.00000000", currency: "USD" },
  facts: [
    { label: "Counterparty", value: "Midmarket Co" },
    { label: "Due", value: "Jul 17, 2026" },
    { label: "Overdue by", value: "13 days" },
    { label: "Status", value: "Open" },
  ],
};

const counterparty: ProposalEvidenceItem = {
  kind: "counterparty",
  ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM",
  resolvable: true,
  label: "Counterparty",
  display: "Midmarket Co",
  amount: null,
  facts: [],
};

describe("initialsOf", () => {
  it("takes first + last initials", () => {
    expect(initialsOf("Thornebury Imports")).toBe("TI");
  });
  it("falls back to the first two letters of a single word", () => {
    expect(initialsOf("Stripe")).toBe("ST");
  });
  it("does not throw on empty input", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("buildProposalDetailRows", () => {
  it("formats the amount through the caller's currency formatter", () => {
    const rows = buildProposalDetailRows([invoice], null, money);
    const amount = rows.find((r) => r.label === "Amount");
    // The raw ledger string is 18600.00000000 - it must never reach the UI.
    expect(amount?.value).toBe("$18,600.00");
    expect(amount?.mono).toBe(true);
  });

  it("puts the most decision-relevant rows first", () => {
    const rows = buildProposalDetailRows([invoice], null, money);
    expect(rows.slice(0, 4).map((r) => r.label)).toEqual(["Amount", "Overdue by", "Due", "Status"]);
  });

  it("suppresses the row that merely repeats the card subject", () => {
    // "Midmarket Co" is already the header; printing it again wastes a row.
    const rows = buildProposalDetailRows([counterparty, invoice], "Midmarket Co", money);
    expect(rows.filter((r) => r.value === "Midmarket Co")).toHaveLength(1);
  });

  it("de-duplicates identical facts contributed by several evidence items", () => {
    const rows = buildProposalDetailRows([invoice, { ...invoice, ref: "inv_other" }], null, money);
    expect(rows.filter((r) => r.label === "Due")).toHaveLength(1);
  });

  it("contributes no row for evidence that resolved to nothing", () => {
    // An unresolved ref belongs under "Technical reference", not as a named row.
    const unresolved: ProposalEvidenceItem = { kind: "counterparty", ref: "cp_unknown", resolvable: false };
    expect(buildProposalDetailRows([unresolved], null, money)).toEqual([]);
  });

  it("tolerates a raw brain-core item with no enrichment fields at all", () => {
    // Guards the degraded path: enrichment is best-effort, so the modal must not
    // throw when the BFF served the un-enriched payload.
    const raw: ProposalEvidenceItem = { kind: "obligation", ref: "obl_1", resolvable: true };
    expect(() => buildProposalDetailRows([raw], null, money)).not.toThrow();
  });

  it("skips background citations so they cannot bury the decisive rows", () => {
    // A live collections proposal cites the entire counterparty book as context.
    const noise: ProposalEvidenceItem[] = ["Globex Corp", "Acme Analytics", "Initech LLC"].map((n, i) => ({
      kind: "wiki",
      ref: `wiki:/counterparties/cp_${i}`,
      resolvable: true,
      label: "Counterparty",
      display: n,
      context: true,
    }));
    const rows = buildProposalDetailRows([...noise, invoice], null, money);
    expect(rows.some((r) => r.value === "Globex Corp")).toBe(false);
    expect(rows.slice(0, 4).map((r) => r.label)).toEqual(["Amount", "Overdue by", "Due", "Status"]);
  });

  /* The card renders every row this returns — there is no longer a "Technical
     reference" section for a remainder to spill into, so anything dropped here
     is a fact the approver never sees. */
  it("returns every derived row rather than capping the list", () => {
    const rows = buildProposalDetailRows([invoice, counterparty], null, money);
    expect(rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(["Amount", "Overdue by", "Due", "Status", "Counterparty"]),
    );
    expect(rows.length).toBeGreaterThan(4);
  });
});

describe("buildProposalHeadline", () => {
  it("quotes the document number and its own amount", () => {
    const withCode = { ...invoice, code: "AR-MIDMARKET-001" };
    const h = buildProposalHeadline([counterparty, withCode]);
    expect(h.code).toBe("AR-MIDMARKET-001");
    expect(h.amount).toEqual({ value: "18600.00000000", currency: "USD" });
  });

  it("ignores background citations, which describe the book the agent read", () => {
    const noise: ProposalEvidenceItem = {
      kind: "wiki",
      ref: "wiki:/invoices/inv_other",
      resolvable: false,
      label: "Invoice",
      display: "Invoice #INV-9999",
      code: "INV-9999",
      amount: { value: "1.00", currency: "USD" },
      facts: [],
      context: true,
    };
    expect(buildProposalHeadline([noise]).code).toBeNull();
  });

  it("still reports an amount when no cited record carries a document number", () => {
    const h = buildProposalHeadline([counterparty, { ...invoice, code: null }]);
    expect(h.code).toBeNull();
    expect(h.amount).toEqual({ value: "18600.00000000", currency: "USD" });
  });

  it("returns nothing rather than inventing a headline for an id-only proposal", () => {
    const bare: ProposalEvidenceItem = { kind: "policy_decision", ref: "pd_1", resolvable: false };
    expect(buildProposalHeadline([bare])).toEqual({ code: null, amount: null });
  });
});

describe("detail row icons", () => {
  it("gives every row an icon key so no row renders iconless", () => {
    const rows = buildProposalDetailRows([invoice, counterparty], null, money);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => typeof r.icon === "string" && r.icon.length > 0)).toBe(true);
  });

  it("does not repeat the headline document as a row", () => {
    const withCode = { ...invoice, code: "INV-1042" };
    const rows = buildProposalDetailRows([withCode], null, money, "INV-1042");
    expect(rows.some((r) => r.value === "Invoice #INV-1042")).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   Rich card logic (brain-core #384).

   The fixtures below are TRIMMED COPIES OF LIVE ROWS from the reference tenant
   (tnt_01KYS8R54VDRSW6ND3GN2649T0), not invented shapes — including the two
   things the written contract does not prepare you for: `policy_id` is null on
   every row, and key facts carry bare ledger ids.
   ══════════════════════════════════════════════════════════════════════════════ */

describe("isRawIdentifier", () => {
  it("catches prefixed and bare ULIDs and wiki URIs", () => {
    expect(isRawIdentifier("cp_01KYSF0QJ0N18YGNS4JR9EZPHM")).toBe(true);
    expect(isRawIdentifier("tx_01KYS8S1WJF9WKTPQ9YBXFAHYP")).toBe(true);
    expect(isRawIdentifier("01KYS8S1WJF9WKTPQ9YBXFAHYP")).toBe(true);
    expect(isRawIdentifier("wiki:/counterparties/cp_01KY")).toBe(true);
  });
  it("leaves real content alone", () => {
    expect(isRawIdentifier("Harbor Reserve Investment Acct")).toBe(false);
    expect(isRawIdentifier("cmp_policy_violation")).toBe(false);
    expect(isRawIdentifier("70197.57")).toBe(false);
    expect(isRawIdentifier("")).toBe(false);
  });
});

describe("humanizeEnumValue", () => {
  it("turns snake_case enums into prose", () => {
    expect(humanizeEnumValue("create_liquidity_plan")).toBe("Create liquidity plan");
    expect(humanizeEnumValue("unusual_amount")).toBe("Unusual amount");
  });
  it("leaves names, sentences and numbers untouched", () => {
    expect(humanizeEnumValue("Harbor Reserve")).toBe("Harbor Reserve");
    expect(humanizeEnumValue("70197.57")).toBe("70197.57");
    expect(humanizeEnumValue("Review the rejected decision.")).toBe("Review the rejected decision.");
  });
});

describe("buildKeyFactRows", () => {
  it("keeps identifier rows out of the primary view", () => {
    // Live compliance row: two id facts the card face must never show.
    const { primary, technical } = buildKeyFactRows(
      [
        { label: "Finding Type", value: "policy_violation" },
        { label: "Severity", value: "high" },
        { label: "Policy Decision Id", value: "pd_01KYS8SGWK6D66Z3T7QYQBBNK8" },
        { label: "Audit Event Id", value: "evt_01KYS8SGWKFAE5Q0EJDPWQ6XNP" },
      ],
      money,
    );
    expect(primary.map((r) => r.label)).toEqual(["Finding Type", "Severity"]);
    expect(primary.map((r) => r.value)).toEqual(["Policy violation", "High"]);
    expect(technical.map((r) => r.label)).toEqual(["Policy Decision Id", "Audit Event Id"]);
  });

  it("demotes a value that is still a raw id even when the label looks human", () => {
    // Live subscription row: "Merchant" is a bare cp_ id when nothing resolved it.
    const { primary, technical } = buildKeyFactRows(
      [{ label: "Merchant", value: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" }],
      money,
    );
    expect(primary).toEqual([]);
    expect(technical[0].value).toBe("cp_01KYSF0QJ0N18YGNS4JR9EZPHM");
  });

  it("promotes a resolved id back onto the card face", () => {
    const { primary, technical } = buildKeyFactRows(
      [{ label: "Merchant", value: "Fernbridge Wholesale", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" }],
      money,
    );
    expect(primary).toEqual([{ label: "Merchant", value: "Fernbridge Wholesale", mono: false, icon: expect.any(String) }]);
    expect(technical).toEqual([]);
  });

  it("formats money through the caller's currency formatter and drops the Currency row", () => {
    // Live treasury row.
    const { primary } = buildKeyFactRows(
      [
        { label: "Available Cash", value: "70197.57" },
        { label: "Operating Minimum", value: "25000.00" },
        { label: "Currency", value: "USD" },
        { label: "Anomaly Score", value: "0.7" },
      ],
      money,
    );
    expect(primary.find((r) => r.label === "Available Cash")!.value).toBe("$70,197.57");
    expect(primary.some((r) => r.label === "Currency")).toBe(false);
    // Not money: a bare score keeps its own value rather than being dollarised.
    expect(primary.find((r) => r.label === "Anomaly Score")!.value).toBe("0.7");
  });

  it("skips empty values instead of rendering blank rows", () => {
    expect(buildKeyFactRows([{ label: "Merchant", value: "" }, { label: "", value: "x" }], money).primary).toEqual([]);
  });
});

describe("buildFlaggedBy", () => {
  it("prefers policy_id when core sends one", () => {
    expect(buildFlaggedBy({ policy_id: "Wire approval policy", policy_version: 3 })).toEqual({
      text: "policy Wire Approval Policy (v3)",
      source: "policy_id",
    });
  });

  it("falls back to matched_rule_id — the live compliance case", () => {
    const flagged = buildFlaggedBy({ policy_id: null, matched_rule_id: "cmp_policy_violation" });
    expect(flagged).toEqual({ text: 'rule the "cmp policy violation" rule', source: "matched_rule_id" });
  });

  it("does not put opaque policy ids on the primary card", () => {
    expect(buildFlaggedBy({
      policy_id: "pol_8231",
      matched_rule_id: null,
      explanation: "The active policy requires review.",
      decision: null,
    })).toEqual({
      text: "The active policy requires review.",
      source: "policy_content",
    });
  });

  it("falls back to policy CONTENT when both ids are null — the majority live case", () => {
    // Live treasury / cash_forecast / subscription / fraud_anomaly shape.
    const flagged = buildFlaggedBy({
      decision: "confirm",
      policy_id: null,
      matched_rule_id: null,
      explanation: null,
      required_approvers: ["signer"],
      trace: [
        { rule_id: "default-agent-action-requires-review", matched: true },
        { rule_id: "auto-approve-under-limit", matched: false },
      ],
    });
    expect(flagged?.source).toBe("policy_content");
    expect(flagged?.text).toBe('the "default agent action requires review" rule · requires Signer approval');
  });

  it("prefers a written explanation over the trace", () => {
    expect(
      buildFlaggedBy({ policy_id: null, matched_rule_id: null, explanation: "Vendor is on the watchlist." })?.text,
    ).toBe("Vendor is on the watchlist.");
  });

  it("describes the bare decision when there is nothing else", () => {
    expect(buildFlaggedBy({ decision: "confirm" })?.text).toBe("a policy confirm decision");
  });

  it("omits the line entirely rather than inventing one", () => {
    expect(buildFlaggedBy(null)).toBeNull();
    expect(buildFlaggedBy({})).toBeNull();
    expect(buildFlaggedBy({ policy_id: null, matched_rule_id: null, trace: [] })).toBeNull();
  });
});

/* "Why Brain Suggested This" has no dedicated brain-core field, so the whole
   value of these tests is proving the section stays tied to data the engine
   actually recorded and produces NOTHING when it recorded none. */
describe("buildWhySuggested", () => {
  it("reads the policy trace's own written checks", () => {
    expect(
      buildWhySuggested(
        {
          trace: [
            {
              rule_id: "vendor-bank-change",
              matched: true,
              checks: [
                { key: "new_account", detail: "New account number first seen 2 days ago", passed: false },
                { key: "vendor_history", detail: "Vendor has no prior record of changing banking details", passed: false },
              ],
            },
          ],
        },
        null,
      ),
    ).toEqual([
      { text: "New account number first seen 2 days ago", passed: false },
      { text: "Vendor has no prior record of changing banking details", passed: false },
    ]);
  });

  it("keeps a check's own verdict, including a passing one", () => {
    const bullets = buildWhySuggested(
      { trace: [{ matched: true, checks: [{ key: "within_terms", detail: "Invoice is within payment terms", passed: true }] }] },
      null,
    );
    expect(bullets).toEqual([{ text: "Invoice is within payment terms", passed: true }]);
  });

  it("records no verdict when the check states none", () => {
    const bullets = buildWhySuggested(
      { trace: [{ matched: true, checks: [{ detail: "Amount matches the purchase order" }] }] },
      null,
    );
    expect(bullets).toEqual([{ text: "Amount matches the purchase order", passed: null }]);
  });

  it("humanizes the machine key only when there is no written sentence", () => {
    expect(
      buildWhySuggested({ trace: [{ matched: true, checks: [{ key: "amount_over_limit", passed: false }] }] }, null),
    ).toEqual([{ text: "Amount over limit", passed: false }]);
  });

  it("reads ranked_signals, as plain strings and as objects", () => {
    expect(
      buildWhySuggested(null, {
        ranked_signals: [
          "Combined batch fits within this week's operating cash buffer",
          { label: "velocity_spike", detail: "Payment velocity is 4x the vendor's norm" },
          { name: "geo_mismatch" },
        ],
      }),
    ).toEqual([
      { text: "Combined batch fits within this week's operating cash buffer", passed: null },
      { text: "Payment velocity is 4x the vendor's norm", passed: null },
      { text: "Geo mismatch", passed: null },
    ]);
  });

  it("does not repeat a reason the trace and the signals both carry", () => {
    const bullets = buildWhySuggested(
      { trace: [{ matched: true, checks: [{ detail: "Vendor bank details changed" }] }] },
      { ranked_signals: ["vendor bank details changed"] },
    );
    expect(bullets).toEqual([{ text: "Vendor bank details changed", passed: null }]);
  });

  /* The trace records every rule the engine CONSIDERED. A rule that did not fire
     had no bearing on this proposal, so quoting its checks under "Why Brain
     Suggested This" would answer the question with an irrelevance. */
  it("ignores checks belonging to a rule that did not fire", () => {
    expect(
      buildWhySuggested(
        {
          trace: [
            { rule_id: "auto-approve-under-limit", matched: false, checks: [{ detail: "Amount is under the auto-approve limit" }] },
            { rule_id: "requires-review", matched: true, checks: [{ detail: "Amount exceeds the review threshold" }] },
          ],
        },
        null,
      ),
    ).toEqual([{ text: "Amount exceeds the review threshold", passed: null }]);
  });

  it("will not assume a rule fired when the trace omits the flag", () => {
    expect(buildWhySuggested({ trace: [{ checks: [{ detail: "Something the engine checked" }] }] }, null)).toEqual([]);
  });

  it("drops a raw identifier rather than showing it as a reason", () => {
    expect(
      buildWhySuggested({ trace: [{ matched: true, checks: [{ detail: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" }] }] }, null),
    ).toEqual([]);
  });

  it("caps the list so the card stays scannable", () => {
    const checks = Array.from({ length: 9 }, (_, i) => ({ detail: `Signal number ${i}` }));
    expect(buildWhySuggested({ trace: [{ matched: true, checks }] }, null)).toHaveLength(MAX_REASON_BULLETS);
  });

  it("invents nothing for a record that recorded no trace and no signals", () => {
    expect(buildWhySuggested(null, null)).toEqual([]);
    expect(buildWhySuggested({}, {})).toEqual([]);
    expect(buildWhySuggested({ trace: [] }, { ranked_signals: [] })).toEqual([]);
    // A trace that walked rules but recorded no per-check text yields no bullets.
    expect(buildWhySuggested({ trace: [{ rule_id: "some-rule", matched: true }] }, null)).toEqual([]);
  });
});

describe("buildDecisionButtons", () => {
  it("builds acknowledge-only footers from the record, not from a hardcoded pair", () => {
    const buttons = buildDecisionButtons([{ id: "acknowledge", label: "Acknowledge", meaning: "Mark as seen" }]);
    expect(buttons).toEqual([
      {
        id: "acknowledge",
        label: "Acknowledge",
        meaning: "Mark as seen",
        tone: "acknowledge",
        writable: true,
      },
    ]);
  });

  it("orders reject before approve to match the design's footer", () => {
    const buttons = buildDecisionButtons([
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
    ]);
    expect(buttons.map((b) => b.id)).toEqual(["reject", "approve"]);
  });

  it("never renders an Edit button, even if core starts offering the decision", () => {
    /* brain-core has no `edit` decision and no route that would accept one, so
       the control could only ever be a disabled placeholder. Filtering by id
       (rather than merely not synthesising one) is what stops a future core
       release from quietly resurrecting a button nothing can service. */
    expect(
      buildDecisionButtons([
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
      ]).map((b) => b.id),
    ).toEqual(["reject", "approve"]);
    expect(
      buildDecisionButtons([
        { id: "approve", label: "Approve" },
        { id: "edit", label: "Edit amount", meaning: "Change the amount first" },
      ]).map((b) => b.id),
    ).toEqual(["approve"]);
    expect(buildDecisionButtons([{ id: "edit", label: "Edit amount" }])).toEqual([]);
  });

  it("keeps brain-core's domain label but marks an unwritable id disabled", () => {
    const [button] = buildDecisionButtons([{ id: "hold_transaction", label: "Hold transaction" }]);
    expect(button.label).toBe("Hold Transaction");
    expect(button.writable).toBe(false);
  });

  it("capitalizes multi-word action labels without changing the API id", () => {
    const buttons = buildDecisionButtons([
      { id: "hold_vendor", label: "Hold vendor" },
      { id: "clear_vendor", label: "clear vendor" },
      { id: "reject", label: "reject" },
    ]);
    expect(buttons.map((button) => [button.id, button.label])).toEqual([
      ["reject", "Reject"],
      ["hold_vendor", "Hold Vendor"],
      ["clear_vendor", "Clear Vendor"],
    ]);
  });

  it("falls back to presentation.actions, then to nothing", () => {
    expect(buildDecisionButtons(null, [{ id: "approve", label: "Approve" }]).map((b) => b.id))
      .toEqual(["approve"]);
    expect(buildDecisionButtons(null, null)).toEqual([]);
  });

  it("treats an EMPTY available_decisions as authoritative and never falls back", () => {
    /* An empty list is core stating this record accepts no decision at all. That is a
       different fact from the field being absent, and only absence may fall back.
       Collapsing the two let the mirrored presentation.actions resurrect an Approve
       button on a record the API refuses to approve. */
    expect(buildDecisionButtons([], [{ id: "approve", label: "Approve" }])).toEqual([]);
    expect(buildDecisionButtons([], [{ id: "acknowledge", label: "Acknowledge" }])).toEqual([]);
    expect(buildDecisionButtons([], null)).toEqual([]);
  });

  it("still falls back when the field is absent rather than empty", () => {
    /* Guards the other direction: the fix must not silence a legitimate fallback. */
    expect(buildDecisionButtons(undefined, [{ id: "approve", label: "Approve" }]).map((b) => b.id))
      .toEqual(["approve"]);
  });
});

describe("buildConsequences", () => {
  const decisions = buildDecisionButtons([
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ]);

  it("splits the reject path into If This Is Wrong", () => {
    const { next, ifWrong } = buildConsequences(
      { approve: "Transfer is queued.", reject: "Nothing moves.", acknowledge: null },
      decisions,
    );
    expect(next.map((l) => l.decisionId)).toEqual(["approve"]);
    expect(ifWrong.map((l) => l.text)).toEqual(["Nothing moves."]);
  });

  it("writes no line for a consequence core left null", () => {
    const { next, ifWrong } = buildConsequences({ approve: null, reject: null }, decisions);
    expect(next).toEqual([]);
    expect(ifWrong).toEqual([]);
  });

  it("ignores consequences for decisions the proposal does not offer", () => {
    const ackOnly = buildDecisionButtons([{ id: "acknowledge", label: "Acknowledge" }]);
    const { next } = buildConsequences({ approve: "unused", acknowledge: "Finding is filed." }, ackOnly);
    expect(next.map((l) => l.text)).toEqual(["Finding is filed."]);
  });
});

describe("buildConfidence", () => {
  it("renders High/Medium/Low · XX%", () => {
    expect(buildConfidence(0.94, "high")?.text).toBe("High · 94%");
  });
  it("keeps core's band even when it disagrees with the percentage", () => {
    // Live fraud_anomaly row: band "high" at 47%.
    expect(buildConfidence(0.471, "high")?.text).toBe("High · 47%");
  });
  it("derives a band only when core sends none", () => {
    expect(buildConfidence(0.42, null)?.text).toBe("Low · 42%");
  });
  it("omits the section when there is no confidence at all", () => {
    expect(buildConfidence(null, "high")).toBeNull();
  });
});

describe("buildEvidenceTiles", () => {
  it("drops wiki context and unresolved refs, and dedupes repeats", () => {
    // Live fraud_anomaly / subscription evidence: wiki context, one resolvable
    // transaction, and the same transaction cited twice.
    const tiles = buildEvidenceTiles([
      { kind: "wiki", ref: "wiki:/transactions", resolvable: false, label: "Transaction", display: null, amount: null, facts: [], context: true },
      { kind: "transaction", ref: "tx_01KYS8S1WJF9WKTPQ9YBXFAHYP", resolvable: true, label: "Transaction", display: "WIRE Transfer Out", amount: null, facts: [{ label: "Posted", value: "Jul 28, 2026" }], context: false },
      { kind: "transaction", ref: "tx_01KYS8S1WJF9WKTPQ9YBXFAHYP", resolvable: true, label: "Transaction", display: "WIRE Transfer Out", amount: null, facts: [], context: false },
      { kind: "policy_decision", ref: "pd_01KYS8SGWK6D66Z3T7QYQBBNK8", resolvable: false, label: "Policy Decision", display: null, amount: null, facts: [], context: false },
    ] as ProposalEvidenceItem[]);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      label: "Transaction",
      display: "WIRE Transfer Out",
      kind: "transaction",
      ref: "tx_01KYS8S1WJF9WKTPQ9YBXFAHYP",
    });
  });

  it("never emits a tile whose display is itself an id", () => {
    expect(
      buildEvidenceTiles([
        { kind: "counterparty", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM", resolvable: true, label: "Counterparty", display: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM", amount: null, facts: [], context: false },
      ] as ProposalEvidenceItem[]),
    ).toEqual([]);
  });
});

describe("isDecidableProposal", () => {
  it("routes a notify_only record WITH an acknowledge decision into the queue", () => {
    // This is the compliance / fraud_anomaly case the old mode-only gate stranded.
    expect(
      isDecidableProposal({ mode: "notify_only", available_decisions: [{ id: "acknowledge", label: "Acknowledge" }] }),
    ).toBe(true);
  });

  it("keeps a record with no writable decision out", () => {
    expect(isDecidableProposal({ mode: "notify_only", available_decisions: [] })).toBe(false);
    expect(isDecidableProposal({ mode: "propose", available_decisions: [{ id: "hold_transaction", label: "Hold" }] })).toBe(false);
  });

  it("falls back to the old mode rule for rows that predate available_decisions", () => {
    expect(isDecidableProposal({ mode: "propose" })).toBe(true);
    expect(isDecidableProposal({ mode: "notify_only" })).toBe(false);
  });
});

describe("keyFactsFromPresentation", () => {
  it("applies the same primary/technical split without server resolution", () => {
    const facts = keyFactsFromPresentation([
      { label: "Severity", value: "high" },
      { label: "Transaction Id", value: "tx_01KYS8S1WJF9WKTPQ9YBXFAHYP" },
      { label: "Amount", value: 50000 },
    ]);
    expect(facts).toEqual([
      { label: "Severity", value: "high", technical: false },
      { label: "Transaction Id", value: "tx_01KYS8S1WJF9WKTPQ9YBXFAHYP", technical: true },
      { label: "Amount", value: "50000", technical: false },
    ]);
  });
});

describe("resolveHeadlineText", () => {
  const refs = new Map([["tx_01KYS8S1WJ3PJ4HHAM9JH4KHZD", "WIRE Transfer Out - Harbor Reserve"]]);

  it("replaces the raw id core puts at the front of a fraud headline", () => {
    // Verbatim live fraud_anomaly headline.
    expect(
      resolveHeadlineText("tx_01KYS8S1WJ3PJ4HHAM9JH4KHZD fraud anomaly risk is elevated; recommend review.", refs),
    ).toBe("WIRE Transfer Out - Harbor Reserve fraud anomaly risk is elevated; recommend review.");
  });

  it("removes an id that resolved to nothing rather than showing it", () => {
    expect(resolveHeadlineText("tx_01KYS8S1WB61VSWH6YJJ9AKFG9 fraud anomaly risk is high.", new Map())).toBe(
      "Fraud anomaly risk is high.",
    );
  });

  it("spaces out snake_case enums and sentence-cases the result", () => {
    // Verbatim live treasury / subscription headlines.
    expect(resolveHeadlineText("create_liquidity_plan for USD balance 70197.57.", refs)).toBe(
      "Create liquidity plan for USD balance 70197.57.",
    );
    expect(resolveHeadlineText("Subscription detection not_matched.", refs)).toBe("Subscription detection not matched.");
  });

  it("leaves an already-human headline alone", () => {
    expect(resolveHeadlineText("Compliance finding policy violation severity high.", refs)).toBe(
      "Compliance finding policy violation severity high.",
    );
  });

  it("returns null when there is nothing to show", () => {
    expect(resolveHeadlineText(null, refs)).toBeNull();
    expect(resolveHeadlineText("   ", refs)).toBeNull();
    expect(resolveHeadlineText("tx_01KYS8S1WB61VSWH6YJJ9AKFG9", new Map())).toBeNull();
  });
});

describe("buildProposalHeaderCopy", () => {
  it("matches the detail title/text and preserves title-case display labels", () => {
    const proposal = {
      id: "pr_test",
      type: "vendor_risk",
      created_at: "2026-07-30T00:00:00.000Z",
      status: "pending",
      risk_band: "high",
      confidence: 0.9,
      mode: "live",
      narrative: "Review this vendor.",
      evidence: [
        {
          kind: "invoice",
          ref: "inv_01KYS8S1WJ3PJ4HHAM9JH4KHZD",
          resolvable: true,
          label: "Invoice",
          display: "INV-001",
          code: "INV-001",
          amount: { value: "500.00", currency: "USD" },
          facts: [],
        },
      ],
      agent: { id: "agent_test", kind: "vendor_risk", display_name: "Vendor Risk" },
      payment_intent_id: null,
      action_type: null,
      subject: { label: "Vendor", display: "Cascade Freight" },
      presentation: {
        headline: "inv_01KYS8S1WJ3PJ4HHAM9JH4KHZD vendor risk is elevated.",
        key_facts: null,
      },
      key_facts: null,
      resolved_refs: { inv_01KYS8S1WJ3PJ4HHAM9JH4KHZD: "INV-001" },
    } as any;

    const formatText = (value: string) => (value === "USD 500.00" ? "$500.00" : value);
    expect(buildProposalHeaderCopy(proposal, "Vendor Risk", formatText)).toEqual({
      title: "INV-001 vendor risk is elevated.",
      text: "Cascade Freight · INV-001 · $500.00",
    });
    expect(titleCaseLabel("high risk")).toBe("High Risk");
  });

  it("falls back to the resolved narrative, not the bare agent name, when there's no subject or headline", () => {
    // Exactly the compliance/notify_only shape: no subject, no presentation.headline,
    // so every one of these previously rendered an identical, indistinguishable
    // "Compliance" row title regardless of what each finding was actually about.
    const proposal = {
      id: "pr_compliance",
      type: "compliance",
      created_at: "2026-07-29T00:00:00.000Z",
      status: "pending",
      risk_band: "high",
      confidence: 0.94,
      mode: "notify_only",
      narrative: "Compliance review found policy_violation with high severity.",
      evidence: [],
      agent: { id: "agent_compliance", kind: "compliance", display_name: "Compliance" },
      payment_intent_id: null,
      action_type: null,
      subject: null,
      presentation: null,
      key_facts: null,
      resolved_refs: null,
    } as any;

    const formatText = (value: string) => value;
    expect(buildProposalHeaderCopy(proposal, "Compliance", formatText)).toEqual({
      title: "Compliance review found policy violation with high severity.",
      text: "Proposed by Compliance",
    });
  });

  it("still falls back to the agent name when there's no subject, headline, OR narrative", () => {
    const proposal = {
      id: "pr_bare",
      type: "compliance",
      created_at: "2026-07-29T00:00:00.000Z",
      status: "pending",
      risk_band: "high",
      confidence: 0.94,
      mode: "notify_only",
      narrative: null,
      evidence: [],
      agent: { id: "agent_compliance", kind: "compliance", display_name: "Compliance" },
      payment_intent_id: null,
      action_type: null,
      subject: null,
      presentation: null,
      key_facts: null,
      resolved_refs: null,
    } as any;

    const formatText = (value: string) => value;
    expect(buildProposalHeaderCopy(proposal, "Compliance", formatText)).toEqual({
      title: "Compliance",
      text: "Proposed by Compliance",
    });
  });

  /* Shape taken from a live tenant: the collections agent cited INV-1027 only
     through its wiki page, and the "invoice" evidence item pointed at the
     OBLIGATION id with no code or amount on it. The row went out as a bare
     "Wayne Enterprises" next to a second proposal on the same invoice that did
     carry the caption, so one document produced two rows that looked unrelated. */
  it("captions from key_facts when the invoice is only cited as context", () => {
    const proposal = {
      id: "prop_wayne",
      type: "collections",
      status: "pending",
      mode: "propose",
      narrative: "Wayne Enterprises has 4300.00000000 USD outstanding on invoice INV-1027.",
      evidence: [
        { kind: "wiki", ref: "wiki:/invoices/inv_01KZKGQ7FZK86XRWFWCJDZRCQM", context: true, code: "INV-1027", facts: [] },
        { kind: "counterparty", ref: "cp_01KZKGQ7FX6H5BVFGVEAD31TB4", context: false, display: "Wayne Enterprises", facts: [] },
        { kind: "obligation", ref: "obl_01KZKGQ7FY81CDQPQZZXJVGEEJ", context: false, facts: [] },
      ],
      subject: { label: "Counterparty", display: "Wayne Enterprises" },
      presentation: { headline: "Receivable is 108 days overdue for Wayne Enterprises.", key_facts: null },
      key_facts: [
        { label: "Invoice Number", value: "INV-1027" },
        { label: "Amount Due", value: "4300.00000000" },
        { label: "Currency", value: "USD" },
      ],
      resolved_refs: null,
    } as any;

    const formatText = (value: string) => (value === "USD 4300.00000000" ? "$4,300.00" : value);
    expect(buildProposalHeaderCopy(proposal, "Collections", formatText)).toEqual({
      title: "Receivable is 108 days overdue for Wayne Enterprises.",
      text: "Wayne Enterprises · INV-1027 · $4,300.00",
    });
  });

  it("prefers the cited record's own amount over key_facts", () => {
    const proposal = {
      id: "prop_direct",
      type: "collections",
      status: "pending",
      mode: "propose",
      narrative: null,
      evidence: [
        {
          kind: "invoice",
          ref: "inv_01KZKGPW1QFKQ61MZGETKKZRTH",
          context: false,
          code: "AR-STARTUPX-001",
          amount: { value: "8000.00000000", currency: "USD" },
          facts: [],
        },
      ],
      subject: { label: "Counterparty", display: "StartupX" },
      presentation: { headline: "Review collections outreach for StartupX", key_facts: null },
      /* Deliberately contradicts the evidence: the document's own figure wins. */
      key_facts: [
        { label: "Invoice Number", value: "AR-OTHER-999" },
        { label: "Amount Due", value: "1.00" },
        { label: "Currency", value: "USD" },
      ],
      resolved_refs: null,
    } as any;

    const formatText = (value: string) => (value === "USD 8000.00000000" ? "$8,000.00" : value);
    expect(buildProposalHeaderCopy(proposal, "Collections", formatText).text).toBe(
      "StartupX · AR-STARTUPX-001 · $8,000.00",
    );
  });
});

/* Two live proposals on one invoice is a real brain-core state, not a render
   bug: the collections agent re-proposes an open invoice on each sweep and its
   output overlaps the seeded proposals. Both are separately approvable, so the
   Inbox groups them by the record they cite instead of hiding either. */
describe("proposalInvoiceIdentity", () => {
  const build = (evidence: unknown[], keyFacts: unknown[] | null = null) =>
    ({ id: "p", evidence, key_facts: keyFacts, presentation: null } as any);

  it("groups a directly cited invoice and a wiki-cited one under the same id", () => {
    const direct = build([
      { kind: "invoice", ref: "inv_01KZKGPW1QFKQ61MZGETKKZRTH", context: false, code: "AR-STARTUPX-001", facts: [] },
    ]);
    const viaWiki = build([
      { kind: "wiki", ref: "wiki:/invoices/inv_01KZKGPW1QFKQ61MZGETKKZRTH", context: true, code: "AR-STARTUPX-001", facts: [] },
      { kind: "obligation", ref: "obl_01KZKGPW1QFKQ61MZGETKKZRTX", context: false, facts: [] },
    ]);
    expect(proposalInvoiceIdentity(direct)?.key).toBe("inv_01KZKGPW1QFKQ61MZGETKKZRTH");
    expect(proposalInvoiceIdentity(viaWiki)?.key).toBe(proposalInvoiceIdentity(direct)?.key);
    expect(proposalInvoiceIdentity(viaWiki)?.code).toBe("AR-STARTUPX-001");
  });

  it("never groups on a counterparty/amount resemblance", () => {
    /* Same customer, same figure, two different invoices — a customer billed the
       same amount twice is two debts, and merging them would hide one. */
    const first = build([
      { kind: "invoice", ref: "inv_AAA", context: false, code: "INV-1", amount: { value: "4300.00", currency: "USD" }, facts: [] },
      { kind: "counterparty", ref: "cp_1", context: false, display: "Wayne Enterprises", facts: [] },
    ]);
    const second = build([
      { kind: "invoice", ref: "inv_BBB", context: false, code: "INV-2", amount: { value: "4300.00", currency: "USD" }, facts: [] },
      { kind: "counterparty", ref: "cp_1", context: false, display: "Wayne Enterprises", facts: [] },
    ]);
    expect(proposalInvoiceIdentity(first)?.key).not.toBe(proposalInvoiceIdentity(second)?.key);
  });

  it("groups on a record id only — never on a document number or on nothing at all", () => {
    /* An invoice NUMBER is unique per issuer, not per book: two vendors can both
       send an "INV-001". Grouping on it would tell an approver that two
       unrelated bills are one document. */
    expect(proposalInvoiceIdentity(build([], [{ label: "Invoice Number", value: "INV-1027" }]))).toBeNull();
    /* A vendor-risk proposal cites no invoice at all: it must not group with
       every other invoice-less proposal under one "unknown" bucket. */
    expect(
      proposalInvoiceIdentity(build([{ kind: "counterparty", ref: "cp_1", context: false, facts: [] }])),
    ).toBeNull();
  });
});

describe("buildRefDisplayMap", () => {
  it("indexes resolved names from both evidence and key facts, bare and wiki-suffixed", () => {
    const map = buildRefDisplayMap(
      [{ label: "Merchant", value: "Cascade Freight", ref: "cp_01KYS8S1V2HXCRN0GGFEJ8VAY1" }],
      [
        { kind: "transaction", ref: "wiki:/transactions/tx_01KYS8S1WJ3PJ4HHAM9JH4KHZD", resolvable: true, label: "Transaction", display: "WIRE Transfer Out", amount: null, facts: [], context: true },
      ] as ProposalEvidenceItem[],
    );
    expect(map.get("cp_01KYS8S1V2HXCRN0GGFEJ8VAY1")).toBe("Cascade Freight");
    expect(map.get("tx_01KYS8S1WJ3PJ4HHAM9JH4KHZD")).toBe("WIRE Transfer Out");
  });

  it("never indexes an id as its own display", () => {
    const map = buildRefDisplayMap([{ label: "Merchant", value: "cp_01KYS8S1V2HXCRN0GGFEJ8VAY1", ref: "cp_01KYS8S1V2HXCRN0GGFEJ8VAY1", technical: true }], []);
    expect(map.size).toBe(0);
  });
});

describe("buildKeyFactRows — de-duplication", () => {
  it("shows a value once when resolution makes two facts identical", () => {
    // Live fraud row: "Transaction Id" resolves to the same string as "Counterparty Name".
    const { primary } = buildKeyFactRows(
      [
        { label: "Transaction", value: "WIRE Transfer Out - Harbor Reserve", ref: "tx_01KYS8S1WJ3PJ4HHAM9JH4KHZD" },
        { label: "Counterparty Name", value: "WIRE Transfer Out - Harbor Reserve" },
        { label: "Anomaly Type", value: "unusual_amount" },
      ],
      money,
    );
    expect(primary.map((r) => r.label)).toEqual(["Transaction", "Anomaly Type"]);
  });
});

describe("resolveProseText", () => {
  const refs = new Map([["inv_01KYS8RK94M7CED84B00QM9TNQ", "Invoice #INV-1042"]]);

  it("names the id core buries in the compliance narrative", () => {
    expect(
      resolveProseText(
        "Compliance review for inv_01KYS8RK94M7CED84B00QM9TNQ found policy_violation with high severity.",
        refs,
      ),
    ).toBe("Compliance review for Invoice #INV-1042 found policy violation with high severity.");
  });

  it("keeps the prose's own capitalisation instead of sentence-casing it", () => {
    expect(resolveProseText("brain flagged this.", refs)).toBe("brain flagged this.");
  });
});

describe("buildKeyFactRows number formatting", () => {
  it("formats a cents-less amount with the fallback currency when the table omits a Currency row", () => {
    // brain-core writes "70197" as often as "70197.57"; the card must not print
    // one of them raw beside the other.
    const { primary } = buildKeyFactRows(
      [
        { label: "Available Cash", value: "70197" },
        { label: "Operating Minimum", value: "25000.00" },
      ],
      money,
      "USD",
    );
    expect(primary.map((r) => r.value)).toEqual(["$70,197.00", "$25,000.00"]);
  });

  it("does NOT read a bare integer under a loose money label as an amount", () => {
    // "Payment Terms: 30" is a day count. $30.00 would be a fabrication.
    const { primary } = buildKeyFactRows([{ label: "Payment Terms", value: "30" }], money, "USD");
    expect(primary[0].value).toBe("30");
  });

  it("leaves non-money numbers alone but groups their digits", () => {
    const { primary } = buildKeyFactRows(
      [
        { label: "Transactions Reviewed", value: "18422" },
        { label: "Anomaly Score", value: "0.7" },
        { label: "Days Overdue", value: "45" },
      ],
      money,
      "USD",
    );
    expect(primary.map((r) => r.value)).toEqual(["18,422", "0.7", "45"]);
  });
});

describe("buildCollectionsDraft", () => {
  const facts = [
    { label: "Customer", value: "Thornebury Imports", icon: "user" },
    { label: "Amount Outstanding", value: "$42,000.00", icon: "amount" },
    { label: "Invoice", value: "AR-MIDMARKET-001", icon: "doc" },
    { label: "Days Past Due", value: "45", icon: "calendar" },
  ];

  it("composes a draft from the proposal's own facts", () => {
    const draft = buildCollectionsDraft(facts, null, "Brightline Foods")!;
    expect(draft.subject).toBe("Invoice AR-MIDMARKET-001: $42,000.00");
    expect(draft.body).toContain("Hi Thornebury Imports,");
    expect(draft.body).toContain(
      "Our records show invoice AR-MIDMARKET-001 for $42,000.00 is now 45 days past due.",
    );
    expect(draft.body.endsWith("Thanks,\nBrightline Foods")).toBe(true);
  });

  it("prefers the proposal's resolved subject over a fact row", () => {
    const draft = buildCollectionsDraft(facts, "Thornebury Imports Ltd", null)!;
    expect(draft.body).toContain("Hi Thornebury Imports Ltd,");
    expect(draft.body).toContain("Accounts Receivable");
  });

  it("drops the clauses whose facts are missing instead of inventing them", () => {
    const draft = buildCollectionsDraft(
      [{ label: "Amount Outstanding", value: "$1,200.00", icon: "amount" }],
      "Cedar Lane Co",
      null,
    )!;
    expect(draft.body).toContain("Our records show your account for $1,200.00 is still outstanding.");
    // The facts sentence carries no invented age, date or invoice number. (The
    // fixed closing line mentions "the invoice" generically, so scope the check.)
    const factsLine = draft.body.split("\n").find((l) => l.startsWith("Our records show"))!;
    expect(factsLine).not.toMatch(/past due|due on|invoice [A-Z0-9]/i);
    expect(draft.subject).toBe("Outstanding balance: $1,200.00");
  });

  it("falls back to the due date when no overdue age is known", () => {
    const draft = buildCollectionsDraft(
      [
        { label: "Invoice", value: "INV-7", icon: "doc" },
        { label: "Due Date", value: "2026-06-01", icon: "calendar" },
      ],
      "Cedar Lane Co",
      null,
    )!;
    expect(draft.body).toContain("was due on 2026-06-01");
  });

  it("withholds the draft entirely when there is nothing concrete to chase", () => {
    expect(buildCollectionsDraft([{ label: "Severity", value: "High", icon: "dot" }], "Cedar Lane Co", null)).toBeNull();
    expect(buildCollectionsDraft([], "Cedar Lane Co", null)).toBeNull();
  });
});

describe("applyCurrencyToBareAmounts", () => {
  it("tags a bare ledger amount in core's prose so the currency formatter sees it", () => {
    expect(
      applyCurrencyToBareAmounts("Transaction at Harbor for 50000.00 scored 0.70 risk.", "USD"),
    ).toBe("Transaction at Harbor for USD 50000.00 scored 0.70 risk.");
  });

  it("leaves scores, percentages and short numbers alone", () => {
    const s = "Score 0.70, variance 12.50%, 3.25 days, ratio 999.00.";
    expect(applyCurrencyToBareAmounts(s, "USD")).toBe(s);
  });

  it("does not double-tag an amount that already carries a symbol or code", () => {
    const s = "Paid $42,000.00 and USD 8200.00 today.";
    expect(applyCurrencyToBareAmounts(s, "USD")).toBe(s);
  });

  it("is a no-op when the proposal cites no currency", () => {
    expect(applyCurrencyToBareAmounts("for 50000.00", null)).toBe("for 50000.00");
  });
});

describe("formatFactDate", () => {
  it("renders a Postgres timestamp as a date", () => {
    // Live collections fact: "Due Date": "2026-07-20 00:00:00+00".
    expect(formatFactDate("2026-07-20 00:00:00+00")).toBe("Jul 20, 2026");
    expect(formatFactDate("2026-07-20")).toBe("Jul 20, 2026");
  });

  it("keeps a meaningful UTC time instead of silently dropping it", () => {
    expect(formatFactDate("2026-07-20T14:05:09Z")).toBe("Jul 20, 2026 14:05 UTC");
  });

  it("drops a time it cannot place in UTC rather than mislabelling it", () => {
    expect(formatFactDate("2026-07-20 14:05:09-05")).toBe("Jul 20, 2026");
  });

  it("ignores anything that is not a date", () => {
    expect(formatFactDate("INV-2036")).toBeNull();
    expect(formatFactDate("5460.00")).toBeNull();
    expect(formatFactDate("2026-13-40")).toBeNull();
  });

  it("reaches the fact table", () => {
    const { primary } = buildKeyFactRows(
      [{ label: "Due Date", value: "2026-07-20 00:00:00+00" }],
      money,
      "USD",
    );
    expect(primary[0].value).toBe("Jul 20, 2026");
  });
});

describe("formatSourceAmount", () => {
  it("quotes the record's own currency, never the display currency", () => {
    expect(formatSourceAmount({ value: "5460.00000000", currency: "USD" })).toBe("$5,460.00");
    expect(formatSourceAmount({ value: "5460.00", currency: "EUR" })).toBe("€5,460.00");
  });

  it("spells out a currency it has no symbol for", () => {
    expect(formatSourceAmount({ value: "1200", currency: "CHF" })).toBe("CHF 1,200.00");
  });

  it("keeps the sign and never rounds a third decimal into the cents", () => {
    expect(formatSourceAmount({ value: "-42000.999", currency: "USD" })).toBe("-$42,000.99");
  });
});

describe("groupDigits (via buildKeyFactRows)", () => {
  it("never coerces through Number — a value past 2^53 keeps every digit", () => {
    const { primary } = buildKeyFactRows(
      [{ label: "Statement Line", value: "9007199254740993" }],
      money,
      "USD",
    );
    expect(primary[0].value).toBe("9,007,199,254,740,993");
  });

  it("leaves a leading-zero code alone rather than grouping it as a quantity", () => {
    const { primary } = buildKeyFactRows([{ label: "Routing", value: "0012345" }], money, "USD");
    expect(primary[0].value).toBe("0012345");
  });
});
