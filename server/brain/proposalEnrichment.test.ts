import { describe, it, expect } from "vitest";
import {
  labelForKind,
  daysOverdue,
  resolveEvidenceItem,
  enrichProposal,
  hydrateMissingRefs,
  type EntityIndex,
} from "./proposalEnrichment";

const index: EntityIndex = new Map([
  [
    "cp_01KYSF0QJ0N18YGNS4JR9EZPHM",
    { label: "Counterparty", display: "Midmarket Co", code: null, amount: null, facts: [] },
  ],
  [
    "inv_01KYSG21MMMHAPE101816VTQNB",
    {
      label: "Invoice",
      display: "Invoice #INV-1042",
      code: "INV-1042",
      amount: { value: "18600.00000000", currency: "USD" },
      facts: [{ label: "Due", value: "Jul 17, 2026" }],
    },
  ],
]);

describe("labelForKind", () => {
  it("captions the known kinds", () => {
    expect(labelForKind("counterparty")).toBe("Counterparty");
    expect(labelForKind("payment_intent")).toBe("Payment");
  });

  it("title-cases an unknown kind instead of leaking a raw token", () => {
    // A new brain-core kind must degrade to "Vendor Risk", never "vendor_risk".
    expect(labelForKind("vendor_risk")).toBe("Vendor Risk");
  });

  it("does not throw on a missing kind", () => {
    expect(labelForKind("")).toBe("Reference");
  });
});

describe("daysOverdue", () => {
  const now = new Date("2026-07-30T12:00:00Z");

  it("counts whole days past a due date", () => {
    expect(daysOverdue("2026-07-17T00:00:00Z", now)).toBe(13);
  });

  it("is negative for a future due date", () => {
    expect(daysOverdue("2026-08-10T00:00:00Z", now)).toBeLessThan(0);
  });

  it("returns null rather than NaN for missing or junk input", () => {
    expect(daysOverdue(null, now)).toBeNull();
    expect(daysOverdue("not-a-date", now)).toBeNull();
  });
});

describe("resolveEvidenceItem", () => {
  it("resolves a ref to its human name", () => {
    const out = resolveEvidenceItem(
      { kind: "counterparty", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM", resolvable: true },
      index,
    );
    expect(out.display).toBe("Midmarket Co");
    expect(out.label).toBe("Counterparty");
  });

  it("carries the amount as STRUCTURED data, never a formatted string", () => {
    // Pre-formatting here would hard-code USD and break the currency switcher.
    const out = resolveEvidenceItem({ kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB" }, index);
    expect(out.amount).toEqual({ value: "18600.00000000", currency: "USD" });
  });

  it("keeps the raw ref and reports display:null when nothing matches", () => {
    const out = resolveEvidenceItem({ kind: "counterparty", ref: "cp_ghost", resolvable: true }, index);
    expect(out.display).toBeNull();
    expect(out.ref).toBe("cp_ghost");
    expect(out.label).toBe("Counterparty");
  });

  it("resolves a wiki URI by its trailing ledger id", () => {
    // Live tenants cite the same entity both ways; bare-id-only lookup left more
    // than half the evidence on a real collections proposal unresolved.
    const out = resolveEvidenceItem(
      { kind: "wiki", ref: "wiki:/counterparties/cp_01KYSF0QJ0N18YGNS4JR9EZPHM", resolvable: true },
      index,
    );
    expect(out.display).toBe("Midmarket Co");
    // The caption comes from the resolved record, not the useless "wiki" kind.
    expect(out.label).toBe("Counterparty");
  });

  it("does not mistake a bare id containing no slash for a URI", () => {
    expect(resolveEvidenceItem({ kind: "counterparty", ref: "cp_ghost" }, index).display).toBeNull();
  });

  it("survives a malformed evidence triple", () => {
    const out = resolveEvidenceItem({} as Record<string, unknown>, index);
    expect(out).toMatchObject({ kind: "", ref: "", display: null, facts: [] });
  });
});

describe("enrichProposal", () => {
  const base = {
    id: "prop_01KYSG21QRBJCX4G4CEPGBYBVZ",
    type: "collections",
    narrative: "Chase the overdue invoice.",
    evidence: [
      { kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB", resolvable: true },
      { kind: "counterparty", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM", resolvable: true },
    ],
  };

  it("prefers the named party as the card subject", () => {
    // Even though the invoice is listed first, a human names this card by the party.
    expect(enrichProposal(base, index).subject).toEqual({ label: "Counterparty", display: "Midmarket Co" });
  });

  it("never names the card after a background wiki citation", () => {
    // Regression: a live collections proposal about StartupX also cites the whole
    // counterparty book as wiki context. Letting those win renamed the card
    // "Globex Corp" while the narrative talked about StartupX.
    const out = enrichProposal(
      {
        ...base,
        evidence: [
          { kind: "wiki", ref: "wiki:/counterparties/cp_01KYSF0QJ0N18YGNS4JR9EZPHM", resolvable: true },
          { kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB", resolvable: true },
        ],
      },
      index,
    );
    expect(out.subject).toEqual({ label: "Invoice", display: "Invoice #INV-1042" });
    // ...but it is still resolved, so the technical section shows a name.
    expect(out.evidence[0]).toMatchObject({ context: true, display: "Midmarket Co" });
  });

  it("marks specific citations as non-context", () => {
    const out = enrichProposal(base, index);
    expect(out.evidence.every((e) => e.context === false)).toBe(true);
  });

  it("falls back to the first resolved entity when no party resolved", () => {
    const out = enrichProposal({ ...base, evidence: [base.evidence[0]] }, index);
    expect(out.subject).toEqual({ label: "Invoice", display: "Invoice #INV-1042" });
  });

  it("reports subject:null when nothing resolved, rather than inventing one", () => {
    const out = enrichProposal({ ...base, evidence: [{ kind: "invoice", ref: "inv_ghost" }] }, index);
    expect(out.subject).toBeNull();
  });

  it("passes unrelated top-level fields through untouched", () => {
    const out = enrichProposal(base, index);
    expect(out.id).toBe(base.id);
    expect(out.narrative).toBe(base.narrative);
  });

  it("tolerates a proposal with no evidence array", () => {
    const out = enrichProposal({ id: "prop_x" }, index);
    expect(out.evidence).toEqual([]);
    expect(out.subject).toBeNull();
  });
});

describe("code propagation", () => {
  it("carries the invoice number through as `code` for the card headline", () => {
    const out = resolveEvidenceItem({ kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB" }, index);
    expect(out.code).toBe("INV-1042");
  });

  it("leaves `code` null for records that have no document number", () => {
    const out = resolveEvidenceItem({ kind: "counterparty", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" }, index);
    expect(out.code).toBeNull();
  });
});

describe("hydrateMissingRefs", () => {
  // A network call from any of these would reject the promise: the token is
  // nonsense and there is no fetch mock. Staying silent proves no call was made.
  const NO_TOKEN = "";

  it("makes no upstream call when every ref is already indexed", async () => {
    const before = new Map(index);
    await expect(
      hydrateMissingRefs(
        NO_TOKEN,
        [
          { ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM", kind: "counterparty" },
          { ref: "inv_01KYSG21MMMHAPE101816VTQNB", kind: "invoice" },
        ],
        index,
      ),
    ).resolves.toBeUndefined();
    expect(index.size).toBe(before.size);
  });

  it("skips refs whose collection cannot be named, rather than guessing from the id prefix", async () => {
    // `pd_`/`evt_` are not ledger entities and no wiki URI names their
    // collection, so there is no endpoint to try. Must not brute-force.
    const empty: EntityIndex = new Map();
    await expect(
      hydrateMissingRefs(
        NO_TOKEN,
        [
          { ref: "pd_01KYSF0QJ0N18YGNS4JR9EZPHM", kind: "policy_decision" },
          { ref: "evt_01KYSF0QJ0N18YGNS4JR9EZPHM", kind: "audit_event" },
          { ref: "wiki:/monthly-summaries/2026-07", kind: "wiki" },
        ],
        empty,
      ),
    ).resolves.toBeUndefined();
    expect(empty.size).toBe(0);
  });
});
