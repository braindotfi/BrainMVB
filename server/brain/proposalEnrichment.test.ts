import { describe, it, expect, afterEach } from "vitest";
import {
  labelForKind,
  daysOverdue,
  resolveEvidenceItem,
  enrichProposal,
  enrichProposals,
  hydrateMissingRefs,
  keyFactRefs,
  resolveKeyFacts,
  textRefs,
  resolveTextRefs,
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

  it("adapts brain-core source_refs into the shared evidence and amount model", () => {
    const out = enrichProposal(
      {
        id: "prop_compliance_source_refs",
        type: "compliance",
        source_refs: {
          source_action_id: "act_blocked_1042",
          source_proposal_id: "prop_source_1042",
          payment_intent_id: "pi_1042",
          source_entity_refs: [
            { kind: "counterparty", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" },
            { kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB" },
          ],
          amount: { value: "18600.00", currency: "USD" },
        },
      },
      index,
    );

    expect(out.subject).toEqual({ label: "Counterparty", display: "Midmarket Co" });
    expect(out.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "counterparty", display: "Midmarket Co" }),
        expect.objectContaining({ kind: "invoice", code: "INV-1042" }),
        expect.objectContaining({
          kind: "source_amount",
          amount: { value: "18600.00", currency: "USD" },
        }),
      ]),
    );
    expect(out.source_refs).toEqual({
      source_action_id: "act_blocked_1042",
      source_proposal_id: "prop_source_1042",
      payment_intent_id: "pi_1042",
      source_entity_refs: [
        { kind: "counterparty", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" },
        { kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB" },
      ],
      amount: { value: "18600.00", currency: "USD" },
    });
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

describe("enrichment time budget", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("answers with raw refs instead of hanging when an upstream read never returns", async () => {
    // The review queue is blocked on enrichment, so a dead upstream socket must
    // not hold the response open. Abort budget applies; the card degrades.
    globalThis.fetch = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;

    const started = Date.now();
    const out = await enrichProposals("token", [
      {
        id: "prop_1",
        type: "collections",
        evidence: [{ kind: "invoice", ref: "inv_01KYSG21MMMHAPE101816VTQNB" }],
      },
    ]);
    const elapsed = Date.now() - started;

    expect(out).toHaveLength(1);
    expect(out[0].subject).toBeNull();
    expect(out[0].evidence[0].ref).toBe("inv_01KYSG21MMMHAPE101816VTQNB");
    expect(out[0].evidence[0].display).toBeNull();
    // Well inside ENRICHMENT_BUDGET_MS: the per-call abort fires first.
    expect(elapsed).toBeLessThan(7_000);
  }, 15_000);
});

describe("choosing the by-id endpoint", () => {
  it("prefers the collection the wiki URI names over the kind guess for the same id", async () => {
    // Same ledger id cited twice: bare with a kind that maps to counterparties,
    // and as a wiki URI naming invoices. The URI is authoritative.
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((url: unknown) => {
      calls.push(String(url));
      return Promise.resolve(new Response("{}", { status: 404 }));
    }) as unknown as typeof fetch;

    const empty: EntityIndex = new Map();
    await hydrateMissingRefs(
      "token",
      [
        { ref: "inv_01KYSG21MMMHAPE101816VTQNB", kind: "counterparty" },
        { ref: "wiki:/invoices/inv_01KYSG21MMMHAPE101816VTQNB", kind: "wiki" },
      ],
      empty,
    );
    globalThis.fetch = realFetch;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/ledger/invoices/");
  });
});

/* ── presentation.key_facts resolution ─────────────────────────────────────────
   brain-core writes bare ledger ids into the card's own fact table. These are
   trimmed copies of live rows from the reference tenant. */

describe("keyFactRefs", () => {
  it("collects the ids a record cites ONLY in its fact table", () => {
    // Live subscription row: the merchant appears nowhere in `evidence`.
    const refs = keyFactRefs({
      presentation: {
        key_facts: [
          { label: "Merchant", value: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" },
          { label: "Recurring Amount", value: "8200.00" },
        ],
      },
    });
    expect(refs.map((r) => r.ref)).toEqual(["cp_01KYSF0QJ0N18YGNS4JR9EZPHM"]);
  });

  it("returns nothing for a record with no presentation block", () => {
    expect(keyFactRefs({})).toEqual([]);
    expect(keyFactRefs({ presentation: {} })).toEqual([]);
  });
});

describe("resolveKeyFacts", () => {
  it("swaps a cited id for the entity's name and drops the now-wrong Id caption", () => {
    const facts = resolveKeyFacts(
      { presentation: { key_facts: [{ label: "Counterparty Id", value: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" }] } },
      index,
    );
    expect(facts).toEqual([
      { label: "Counterparty", value: "Midmarket Co", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" },
    ]);
  });

  it("marks an unresolvable id technical instead of putting it on the card face", () => {
    // Live compliance row: pd_/evt_ refs resolve against nothing.
    const facts = resolveKeyFacts(
      { presentation: { key_facts: [{ label: "Policy Decision Id", value: "pd_01KYS8SGWK6D66Z3T7QYQBBNK8" }] } },
      index,
    );
    expect(facts).toEqual([
      {
        label: "Policy Decision Id",
        value: "pd_01KYS8SGWK6D66Z3T7QYQBBNK8",
        technical: true,
        ref: "pd_01KYS8SGWK6D66Z3T7QYQBBNK8",
      },
    ]);
  });

  it("passes ordinary facts through untouched and skips empty ones", () => {
    const facts = resolveKeyFacts(
      {
        presentation: {
          key_facts: [
            { label: "Severity", value: "high" },
            { label: "Anomaly Score", value: 0.7 },
            { label: "Nothing", value: "" },
          ],
        },
      },
      index,
    );
    expect(facts).toEqual([
      { label: "Severity", value: "high", technical: undefined },
      { label: "Anomaly Score", value: "0.7", technical: undefined },
    ]);
  });

  it("is absent, not empty, when the record carries no key facts", () => {
    expect(resolveKeyFacts({}, index)).toBeUndefined();
  });
});

describe("enrichProposal — rich card fields", () => {
  it("attaches resolved key facts and passes every new field through untouched", () => {
    const enriched = enrichProposal(
      {
        id: "prop_1",
        type: "subscription",
        stored_action_type: "flag_subscription",
        details: { recurring_amount: "8200.00" },
        policy: { decision: "confirm", policy_id: null, matched_rule_id: null },
        available_decisions: [{ id: "approve", label: "Approve" }],
        presentation: {
          headline: "Recurring charge detected",
          key_facts: [{ label: "Merchant", value: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" }],
          technical_detail: { "1_ingest": { source: "plaid" } },
        },
        evidence: [],
      },
      index,
    );
    expect(enriched.key_facts).toEqual([
      { label: "Merchant", value: "Midmarket Co", ref: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM" },
    ]);
    // The additive contract survives enrichment byte-for-byte.
    expect(enriched.stored_action_type).toBe("flag_subscription");
    expect(enriched.details).toEqual({ recurring_amount: "8200.00" });
    expect(enriched.policy).toEqual({ decision: "confirm", policy_id: null, matched_rule_id: null });
    expect(enriched.available_decisions).toEqual([{ id: "approve", label: "Approve" }]);
    expect((enriched.presentation as Record<string, unknown>).technical_detail).toEqual({ "1_ingest": { source: "plaid" } });
  });

  it("adds no key_facts key at all to a record that has none", () => {
    const enriched = enrichProposal({ id: "prop_2", evidence: [] }, index);
    expect("key_facts" in enriched).toBe(false);
  });
});

describe("textRefs / resolveTextRefs", () => {
  const raw = {
    // Verbatim live compliance narrative + fraud headline shapes.
    narrative: "Compliance review for inv_01KYSG21MMMHAPE101816VTQNB found policy_violation with high severity.",
    presentation: { headline: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM fraud anomaly risk is elevated." },
  };

  it("finds the ids buried in narrative and headline prose", () => {
    expect(textRefs(raw).map((r) => r.ref).sort()).toEqual([
      "cp_01KYSF0QJ0N18YGNS4JR9EZPHM",
      "inv_01KYSG21MMMHAPE101816VTQNB",
    ]);
  });

  it("ignores ordinary words and punctuation", () => {
    expect(textRefs({ narrative: "Review the rejected policy decision, then keep it blocked." })).toEqual([]);
    expect(textRefs({})).toEqual([]);
  });

  it("names only the ids the index knows, so the client can drop the rest", () => {
    const resolved = resolveTextRefs(
      { narrative: "cp_01KYSF0QJ0N18YGNS4JR9EZPHM and pd_01KYS8SGWK6D66Z3T7QYQBBNK8 were cited." },
      index,
    );
    expect(resolved).toEqual({ cp_01KYSF0QJ0N18YGNS4JR9EZPHM: "Midmarket Co" });
  });

  it("is absent when the prose cites nothing resolvable", () => {
    expect(resolveTextRefs({ narrative: "No ids here." }, index)).toBeUndefined();
  });
});
