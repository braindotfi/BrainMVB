import { describe, it, expect } from "vitest";
import { buildProposalDetailRows, buildProposalHeadline, initialsOf, MAX_VISIBLE_DETAIL_ROWS } from "./proposalCards";
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

  it("keeps overflow rows available rather than dropping them", () => {
    const rows = buildProposalDetailRows([invoice, counterparty], null, money);
    expect(rows.length).toBeGreaterThan(MAX_VISIBLE_DETAIL_ROWS);
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
