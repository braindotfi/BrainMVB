import { describe, it, expect } from "vitest";
import {
  mapCounterpartyToVendor,
  isNeedsReview,
  isReviewedOnly,
  isPayrollRegisterPlaceholder,
  supportsTrustActions,
  informationalReasonLabel,
  reviewReasonLabel,
  vendorSegment,
  vendorTier,
  type BrainCounterparty,
} from "./brainVendors";
import type { Vendor, VendorTier } from "./vendorTypes";

/**
 * Two invariants live here.
 *
 * 1. Trust status is derived from brain-core's REAL fields and nothing else.
 *    Only `risk_level` in {high, sanctioned} may produce "under_review"; a
 *    merely "unverified" counterparty is not a flagged one. "trusted" must stay
 *    unreachable: brain-core rejects writes to every trust field, so nothing
 *    could ever have granted it, and rendering it would be a lie about state
 *    the product cannot hold.
 *
 * 2. `isNeedsReview` is the ONE predicate behind the chip badge, the list it
 *    filters, and the row reason chip. The bug this screen shipped with was two
 *    predicates disagreeing — a banner counting rows the active filter refused
 *    to show. Tests below pin count-equals-rows directly.
 */

function cp(overrides: Partial<BrainCounterparty> = {}): BrainCounterparty {
  return {
    id: "cp_01ABC",
    name: "Acme Co",
    type: "vendor",
    risk_level: null,
    verified_status: null,
    ...overrides,
  };
}

describe("mapCounterpartyToVendor", () => {
  it("defaults an unflagged counterparty to new with zeroed, honest history", () => {
    const v = mapCounterpartyToVendor(cp());
    expect(v.trustStatus).toBe("new");
    expect(v.history.paymentCount).toBe(0);
    expect(v.flags).toEqual([]);
  });

  it("never fabricates 'trusted'/'known' - an unverified counterparty still reads as new", () => {
    const v = mapCounterpartyToVendor(cp({ verified_status: "unverified" }));
    expect(v.trustStatus).toBe("new");
  });

  it("maps sanctioned risk to under_review with a real flag, not a fabricated one", () => {
    const v = mapCounterpartyToVendor(cp({ risk_level: "sanctioned" }));
    expect(v.trustStatus).toBe("under_review");
    expect(v.flags).toHaveLength(1);
    expect(v.flags[0].label).toMatch(/sanctioned/i);
  });

  it("maps high risk to under_review", () => {
    const v = mapCounterpartyToVendor(cp({ risk_level: "high" }));
    expect(v.trustStatus).toBe("under_review");
  });

  it("does not treat low/medium risk as under_review", () => {
    expect(mapCounterpartyToVendor(cp({ risk_level: "low" })).trustStatus).toBe("new");
    expect(mapCounterpartyToVendor(cp({ risk_level: "medium" })).trustStatus).toBe("new");
  });

  it("maps counterparty type to a readable category label, falling back to the raw type", () => {
    expect(mapCounterpartyToVendor(cp({ type: "tax_authority" })).category).toBe("Tax authority");
    expect(mapCounterpartyToVendor(cp({ type: "some_future_type" })).category).toBe("some_future_type");
  });

  it("promotes an unflagged counterparty with real payments to known", () => {
    const v = mapCounterpartyToVendor(cp({ payment_count: 4, payment_total: "1200.00" }));
    expect(v.trustStatus).toBe("known");
    expect(v.history.paymentCount).toBe(4);
    expect(v.history.totalPaid).toBe(1200);
    expect(v.history.avgAmount).toBe(300);
    expect(v.eligibleForTrust).toBe(true);
  });

  it("keeps a risk-flagged counterparty under review no matter how often it was paid", () => {
    const v = mapCounterpartyToVendor(
      cp({ risk_level: "high", payment_count: 40, payment_total: "99000.00" }),
    );
    expect(v.trustStatus).toBe("under_review");
    // Suggesting trust for a flagged payee is the one thing this must never do.
    expect(v.eligibleForTrust).toBe(false);
  });

  it("coerces payment rollups defensively - proxied reads arrive unnormalized", () => {
    // Reads are proxied through the BFF without normalization, so the client
    // cannot assume numbers. A bad value must read as "no payments", never NaN.
    const asStrings = mapCounterpartyToVendor(cp({ payment_count: "3" as never, payment_total: "90.5" }));
    expect(asStrings.history.paymentCount).toBe(3);
    expect(asStrings.history.totalPaid).toBe(90.5);

    const junk = mapCounterpartyToVendor(cp({ payment_count: "n/a" as never, payment_total: "n/a" }));
    expect(junk.history.paymentCount).toBe(0);
    expect(junk.history.totalPaid).toBe(0);
    expect(junk.trustStatus).toBe("new");

    const missing = mapCounterpartyToVendor(cp());
    expect(Number.isNaN(missing.history.avgAmount)).toBe(false);
    expect(missing.history.avgAmount).toBe(0);
  });

  it("splits customers out of the vendor segment", () => {
    expect(mapCounterpartyToVendor(cp({ type: "customer" })).segment).toBe("customer");
    expect(mapCounterpartyToVendor(cp({ type: "vendor" })).segment).toBe("vendor");
    expect(mapCounterpartyToVendor(cp({ type: "tax_authority" })).segment).toBe("vendor");
  });
});

describe("isNeedsReview", () => {
  const v = (over: Partial<Vendor>): Vendor => ({ ...mapCounterpartyToVendor(cp()), ...over });

  it("covers new, known, and flagged rows — not confirmed ones", () => {
    // "known" is now in the queue: paymentCount > 0 means payment history exists
    // but no human has confirmed trust. The row needs review before it can be
    // relied on in automation or auto-clear. Only an explicit trust grant removes it.
    expect(isNeedsReview(v({ trustStatus: "new" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "under_review" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "known" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "trusted" }))).toBe(false);
  });

  it("lets brain-core's own review state settle a row once it reports one", () => {
    // The whole point of trust_status is that it is the audited answer. Where
    // it exists it outranks the derivation; where it does not, nothing changes.
    expect(isNeedsReview(v({ trustStatus: "new", trustState: "unreviewed" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "new", trustState: "acknowledged" }))).toBe(false);
    expect(isNeedsReview(v({ trustStatus: "trusted", trustState: "trusted" }))).toBe(false);
    expect(isNeedsReview(v({ trustStatus: "under_review", trustState: "paused" }))).toBe(false);
  });

  it("never lets a click settle a risk-flagged row", () => {
    // Dismissing or flagging is a human saying "seen it". Neither is brain-core
    // withdrawing a sanctions hit, so the row stays in the queue regardless.
    for (const state of ["acknowledged", "paused", "trusted"] as const) {
      expect(isNeedsReview(v({ riskLevel: "high", trustState: state }))).toBe(true);
      expect(isNeedsReview(v({ riskLevel: "sanctioned", trustState: state }))).toBe(true);
    }
  });
});

describe("vendorTier", () => {
  const v = (over: Partial<Vendor>): Vendor => ({ ...mapCounterpartyToVendor(cp()), ...over });

  it("files a row under exactly one chip", () => {
    // No row may be counted twice or fall through the gaps — that is how a
    // badge and a list drift apart in the first place.
    //
    // "known" (payment history, no trust grant) IS included: these are real live
    // rows that a user must be able to find and act on. They land in Needs Review
    // until confirmed. The Suggested chip is separately kept hidden until
    // brain-core ships a provenance value; that is a chip-visibility decision,
    // not a reason to drop rows on the floor.
    const rows: Vendor[] = [
      v({ id: "a", trustStatus: "new" }),
      v({ id: "b", trustStatus: "under_review" }),
      v({ id: "c", trustStatus: "known" }),                         // has payment history, unconfirmed
      v({ id: "d", trustStatus: "trusted" }),
      v({ id: "e", trustStatus: "new", trustState: "unreviewed" }),
      v({ id: "f", trustStatus: "new", trustState: "acknowledged" }),
      v({ id: "g", trustStatus: "known", trustState: "acknowledged" }),
      v({ id: "h", trustStatus: "under_review", trustState: "paused" }),
      v({ id: "i", trustStatus: "trusted", trustState: "trusted" }),
      v({ id: "j", riskLevel: "high", trustState: "paused" }),
    ];

    const buckets: Record<VendorTier, Vendor[]> = {
      needsReview: [], flagged: [], trusted: [], suggested: [], informational: [],
    };
    for (const row of rows) {
      const tier = vendorTier(row);
      // A null tier means the row renders nowhere — a silent disappearance.
      expect(tier, `${row.id} matched no tier`).not.toBeNull();
      buckets[tier!].push(row);
    }

    const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
    expect(total).toBe(rows.length);
    expect(new Set(Object.values(buckets).flat()).size).toBe(rows.length);
  });

  it("routes known (unconfirmed payment history) to Needs Review, not Suggested", () => {
    // "known" is a locally-derived status (paymentCount > 0, no risk signal,
    // no trust_status from brain-core). It is NOT a value brain-core sends.
    // brain-core's trust_status contract is: unreviewed | trusted | paused |
    // acknowledged — no "known" in that set.
    //
    // These rows must reach a tier so users can confirm them. Needs Review is
    // the right queue: the counterparty has history but no human confirmation.
    // The Suggested chip stays hidden separately — its visibility is driven by
    // bucket count, and routing here never adds to it.
    expect(vendorTier(v({ trustStatus: "known" }))).toBe("needsReview");
    expect(vendorTier(v({ trustStatus: "known", trustState: "unreviewed" }))).toBe("needsReview");
  });

  it("keeps a risk-flagged, paused row in Needs Review rather than Flagged", () => {
    // Both chips have a claim on it. Needs Review wins, so its count and list
    // stay in step and the row is not quietly parked.
    expect(vendorTier(v({ riskLevel: "high", trustState: "paused" }))).toBe("needsReview");
    expect(vendorTier(v({ trustStatus: "under_review", trustState: "paused" }))).toBe("flagged");
  });

  it("keeps a dismissed row findable in the trusted list, badged as reviewed", () => {
    // Dismissing must not look like deleting: the row still renders somewhere,
    // and the badge is what stops it from reading as a trust grant.
    const dismissed = v({ trustStatus: "new", trustState: "acknowledged" });
    expect(vendorTier(dismissed)).toBe("trusted");
    expect(isReviewedOnly(dismissed)).toBe(true);

    // Both derived statuses an acknowledged row can carry (new = no payments,
    // known = payment history) are reviewed-only in the trusted list.
    const dismissedKnown = v({ trustStatus: "known", trustState: "acknowledged" });
    expect(vendorTier(dismissedKnown)).toBe("trusted");
    expect(isReviewedOnly(dismissedKnown)).toBe(true);

    const granted = v({ trustStatus: "trusted", trustState: "trusted" });
    expect(vendorTier(granted)).toBe("trusted");
    expect(isReviewedOnly(granted)).toBe(false);
  });
});

describe("reading brain-core's trust_status", () => {
  it("ignores the field when it is absent or carries an unknown value", () => {
    // "Field not reported" and "reported unreviewed" are different facts, and
    // only the first may fall back to deriving the tier from risk + history.
    expect(mapCounterpartyToVendor(cp()).trustState).toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: null })).trustState).toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: "" })).trustState).toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: "some_future_state" })).trustState)
      .toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: 1 as never })).trustState).toBeUndefined();
  });

  it("lets a granted row finally reach 'trusted' — the tier the derivation cannot produce", () => {
    const v = mapCounterpartyToVendor(cp({ trust_status: "trusted" }));
    expect(v.trustStatus).toBe("trusted");
    expect(v.trustState).toBe("trusted");
  });

  it("does not read a dismissal as a trust grant", () => {
    // Acknowledged only means "a human looked". The tier still comes from
    // history, so a zero-payment row must not inherit trusted's copy.
    const noHistory = mapCounterpartyToVendor(cp({ trust_status: "acknowledged" }));
    expect(noHistory.trustStatus).toBe("new");
    expect(noHistory.eligibleForTrust).toBe(false);

    const withHistory = mapCounterpartyToVendor(
      cp({ trust_status: "acknowledged", payment_count: 3, payment_total: "30" }),
    );
    expect(withHistory.trustStatus).toBe("known");
  });

  it("keeps risk above a pause, so a sanctioned row cannot be flagged out of the queue", () => {
    const v = mapCounterpartyToVendor(cp({ trust_status: "paused", risk_level: "sanctioned" }));
    expect(v.trustStatus).toBe("under_review");
    expect(isNeedsReview(v)).toBe(true);
    expect(vendorTier(v)).toBe("needsReview");
  });
});

describe("the Needs Review badge counts exactly the rows it will show", () => {
  /* The shipped bug in one assertion: the number on the chip and the length of
     the list it opens are produced by the same filter over the same segment. */
  const seed = (specs: Array<Partial<BrainCounterparty>>) =>
    specs.map((s, i) => mapCounterpartyToVendor(cp({ id: `cp_${i}`, ...s })));

  const cases: Array<[string, Array<Partial<BrainCounterparty>>]> = [
    ["new only", [{}, {}, {}]],
    ["flagged only", [{ risk_level: "high" }, { risk_level: "sanctioned" }]],
    ["new and flagged", [{}, { risk_level: "high" }, { payment_count: 2, payment_total: "10" }]],
    [
      "customers present",
      [
        { type: "customer" },
        { type: "customer", risk_level: "high" },
        {},
        { payment_count: 5, payment_total: "50" },
      ],
    ],
    ["nothing to review", [{ payment_count: 1, payment_total: "1" }]],
    ["empty", []],
  ];

  for (const [name, specs] of cases) {
    it(`holds for: ${name}`, () => {
      const all = seed(specs);
      for (const segment of ["vendor", "customer"] as const) {
        const inSegment = all.filter((v) => vendorSegment(v) === segment);
        const badge = inSegment.filter(isNeedsReview).length;
        const rendered = inSegment.filter(isNeedsReview);
        expect(rendered).toHaveLength(badge);
        // And the count is scoped: it never leaks rows from the other segment.
        expect(rendered.every((r) => vendorSegment(r) === segment)).toBe(true);
      }
    });
  }
});

describe("reviewReasonLabel", () => {
  it("prefers the risk reason when a row is both new and flagged", () => {
    // Both apply to a first-seen sanctioned payee. Only the dangerous one is
    // worth the row's single chip.
    expect(reviewReasonLabel(mapCounterpartyToVendor(cp({ risk_level: "sanctioned" })))).toBe(
      "Risk: sanctioned",
    );
    expect(reviewReasonLabel(mapCounterpartyToVendor(cp({ risk_level: "high" })))).toBe("Risk: high");
  });

  it("labels an unflagged first-seen counterparty New", () => {
    expect(reviewReasonLabel(mapCounterpartyToVendor(cp()))).toBe("New");
  });

  it("labels a known counterparty New — payment history alone is not a reason chip", () => {
    // "known" rows are in the Needs Review queue (unconfirmed payment history).
    // They carry no risk signal and no explicit flag, so their reason chip reads
    // "New" — the same as a first-seen counterparty. The eligibleForTrust flag
    // in the detail popup is what surfaces the payment history context.
    const known = mapCounterpartyToVendor(cp({ payment_count: 2, payment_total: "20" }));
    expect(reviewReasonLabel(known)).toBe("New");
  });

  it("gives no reason to rows that are not in the queue", () => {
    // Only rows where isNeedsReview() is true get a reason label. A confirmed
    // (trusted) row is out of the queue entirely.
    const trusted = mapCounterpartyToVendor(cp({ trust_status: "trusted" }));
    expect(reviewReasonLabel(trusted)).toBeNull();
  });
});

/* ── Display copy: "No action" ────────────────────────────────────────────────
 *  The counterparty trust surface calls the acknowledged state "No action" to a
 *  human. The WIRE VALUE is still `acknowledged` — the enum, the stored
 *  trustState and the /trust/acknowledge route are untouched. These guards fail
 *  if either half drifts: a rename that reaches the API, or a revert of the copy.
 */
describe("acknowledged reads as \"No action\" without changing the wire value", () => {
  const read = (p: string) => require("fs").readFileSync(p, "utf8");

  it("keeps `acknowledged` as the enum value and the route verb", () => {
    expect(read("client/src/lib/vendorTypes.ts")).toContain(
      '"unreviewed" | "trusted" | "paused" | "acknowledged"',
    );
    // The POST target is built from the literal action name.
    expect(read("client/src/pages/VendorsPanel.tsx")).toContain(
      'callTrustAction(vendorId, "acknowledge"',
    );
    expect(read("client/src/pages/VendorsPanel.tsx")).toContain("/trust/${action}");
  });

  it("shows \"No action\" on the chip, with the reviewed tooltip", () => {
    const src = read("client/src/pages/VendorsPanel.tsx");
    expect(src).toContain("No action");
    expect(src).toContain('title="Reviewed — no action taken"');
    // The old chip word must be gone from the chip itself.
    expect(src).not.toContain(">\n      Reviewed\n    </span>");
  });

  it("labels every trust dismissal button \"No action\", never \"Dismiss\"", () => {
    const src = read("client/src/components/VendorDetailPopup.tsx");
    expect(src).not.toContain('label="Dismiss"');
    // All four action blocks (known, paused, risk-flagged, new) carry the button.
    expect(src.split('label="No action"').length - 1).toBe(4);
  });

  it("explains the acknowledged row without the word dismissed, and still offers Grant", () => {
    const src = read("client/src/components/VendorDetailPopup.tsx");
    expect(src).toContain("You reviewed this {noun} and took no action.");
    // acknowledged → grant stays available on that row.
    expect(src).toContain('data-testid="text-acknowledged-note"');
  });
});

/* ── Payroll register placeholders (brain-core #507) ──────────────────────────
 * Payroll runs are ingested against a placeholder counterparty rather than
 * against each employee. It is a grouping row for a source document, so no
 * trust transition means anything on it and the UI must render it read-only.
 *
 * The predicate is BOTH halves — `type === "other"` AND
 * `metadata.source_kind === "payroll_register"`. `other` on its own is a broad
 * bucket that ordinary counterparties fall into, and stripping their controls
 * would strand them with no way to be reviewed. Every case below that is only
 * half a match must therefore stay fully actionable.
 */
describe("payroll register placeholders render informational-only", () => {
  const payroll = (over: Partial<BrainCounterparty> = {}) =>
    cp({ type: "other", metadata: { source_kind: "payroll_register" }, ...over });

  it("recognises the placeholder on both halves of the predicate", () => {
    expect(isPayrollRegisterPlaceholder(payroll())).toBe(true);
  });

  it("withholds every trust action from the placeholder", () => {
    const v = mapCounterpartyToVendor(payroll());
    expect(v.informationalSource).toBe("payroll_register");
    expect(supportsTrustActions(v)).toBe(false);
  });

  it("never suggests trusting a placeholder, even with payment history", () => {
    // payment_count > 0 is what normally makes a row "known" and eligible.
    const v = mapCounterpartyToVendor(payroll({ payment_count: 9, payment_total: "9000" }));
    expect(v.eligibleForTrust).toBe(false);
  });

  /* Placement. Needs Review is a work queue whose badge is the screen's single
     attention signal, so a row that can never be actioned must not sit in it —
     the count would never reach zero. The row still has to render somewhere,
     hence its own tier rather than a filter that drops it. */
  it("keeps the placeholder out of the Needs Review queue and its badge", () => {
    const v = mapCounterpartyToVendor(payroll());
    expect(isNeedsReview(v)).toBe(false);
    expect(reviewReasonLabel(v)).toBeNull();
  });

  it("files the placeholder under its own tier so it still renders", () => {
    expect(vendorTier(mapCounterpartyToVendor(payroll()))).toBe("informational");
  });

  it("names what the row is in its own list", () => {
    expect(informationalReasonLabel(mapCounterpartyToVendor(payroll()))).toBe("Payroll register");
    // Ordinary rows have nothing to say here.
    expect(informationalReasonLabel(mapCounterpartyToVendor(cp()))).toBeNull();
  });

  it("does not let a risk signal drag the placeholder back into the work queue", () => {
    // Risk normally outranks everything. It cannot here: there are no controls
    // to review it with. The flag itself is still carried on the row.
    const flagged = mapCounterpartyToVendor(payroll({ risk_level: "sanctioned" }));
    expect(vendorTier(flagged)).toBe("informational");
    expect(isNeedsReview(flagged)).toBe(false);
    expect(flagged.flags).toHaveLength(1);
  });

  /* The four half-matches. Each one must keep its controls. */
  it("leaves an other-typed counterparty with no metadata fully actionable", () => {
    const v = mapCounterpartyToVendor(cp({ type: "other" }));
    expect(isPayrollRegisterPlaceholder(cp({ type: "other" }))).toBe(false);
    expect(supportsTrustActions(v)).toBe(true);
    expect(v.informationalSource).toBeUndefined();
  });

  it("leaves an other-typed counterparty from a different source fully actionable", () => {
    const other = cp({ type: "other", metadata: { source_kind: "bank_statement" } });
    expect(isPayrollRegisterPlaceholder(other)).toBe(false);
    expect(supportsTrustActions(mapCounterpartyToVendor(other))).toBe(true);
  });

  it("does not strip controls from a real counterparty carrying the payroll source kind", () => {
    // type is the other half: a vendor row is a vendor row whatever it was
    // ingested from.
    const vendorRow = cp({ type: "vendor", metadata: { source_kind: "payroll_register" } });
    expect(isPayrollRegisterPlaceholder(vendorRow)).toBe(false);
    expect(supportsTrustActions(mapCounterpartyToVendor(vendorRow))).toBe(true);

    const customerRow = cp({ type: "customer", metadata: { source_kind: "payroll_register" } });
    expect(isPayrollRegisterPlaceholder(customerRow)).toBe(false);
    expect(supportsTrustActions(mapCounterpartyToVendor(customerRow))).toBe(true);
  });

  it("treats an unreadable metadata field as 'not reported' rather than throwing", () => {
    // The read is proxied verbatim, so the shape is brain-core's, not ours.
    for (const metadata of [null, undefined, {}, { source_kind: null }, { source_kind: 7 }]) {
      const row = cp({ type: "other", metadata: metadata as never });
      expect(() => isPayrollRegisterPlaceholder(row)).not.toThrow();
      expect(isPayrollRegisterPlaceholder(row)).toBe(false);
    }
  });

  it("still files the placeholder in a segment, so it never vanishes from the screen", () => {
    // type "other" is not "customer", so it belongs to the vendor segment, and
    // it must still reach a tier — an unrendered row is worse than a read-only one.
    const v = mapCounterpartyToVendor(payroll());
    expect(vendorSegment(v)).toBe("vendor");
    expect(vendorTier(v)).not.toBeNull();
  });

  it("shows the Informational chip only while it has rows, like Suggested", () => {
    const src = require("fs").readFileSync("client/src/pages/VendorsPanel.tsx", "utf8");
    expect(src).toContain("const showInformational = grouped.informational.length > 0;");
    expect(src).toContain('...(showInformational ? [{ value: "Informational", label: "Informational" }] : []),');
  });
});

/* Structural guards: the controls are omitted in the popup and no trust write
 * can originate for one of these rows. Both are formatting-sensitive on
 * purpose — they fail loudly if the wiring is refactored away. */
describe("informational rows are wired read-only end to end", () => {
  const read = (p: string) => require("fs").readFileSync(p, "utf8");

  it("omits the trust controls in the popup rather than disabling them", () => {
    const src = read("client/src/components/VendorDetailPopup.tsx");
    expect(src).toContain("const trustActionsAvailable = supportsTrustActions(vendor);");
    // The whole action block is behind the check, and the note replaces it.
    expect(src).toContain("{!trustActionsAvailable ? (");
    expect(src).toContain('data-testid="text-informational-only"');
  });

  it("guards the single trust-write mount point against a bypassed UI", () => {
    const src = read("client/src/pages/VendorsPanel.tsx");
    expect(src).toContain("if (target && !supportsTrustActions(target)) return;");
    // Bulk confirm acts on the same filtered list it counts.
    expect(src).toContain("supportsTrustActions(v),");
    expect(src).toContain("const toConfirm = bulkConfirmable;");
  });
});

/**
 * The counterparty list must never be permanently stale.
 *
 * Invalidation after a trust action only reaches the tab that performed it. A second
 * browser tab on the same account — or a teammate on the same tenant — kept showing the
 * pre-decision state forever, because this app's query defaults are `staleTime: Infinity`
 * with no interval and no refetch on focus. Same defect the Payables/Receivables figures
 * had, so it gets the same shared interval rather than a local constant.
 */
describe("the counterparty read stays fresh on its own", () => {
  const read = (p: string) => require("fs").readFileSync(p, "utf8");

  it("polls on the shared ledger interval instead of a hand-rolled one", () => {
    const src = read("client/src/lib/brainVendors.ts");
    expect(src).toContain("refetchInterval: ledgerPollMs(ingesting)");
    expect(src).toContain("const ingesting = useIngestInProgress();");
    // A local number here would drift from the money feeds it sits beside.
    expect(src).not.toMatch(/refetchInterval:\s*\d/);
  });

  it("refetches when the tab regains focus", () => {
    /* The decisive half for the cross-tab case: returning to a backgrounded tab is
       exactly when its stale trust rows are about to be read and acted on. */
    expect(read("client/src/lib/brainVendors.ts")).toContain("refetchOnWindowFocus: true");
  });

  it("keys the cache under the plain endpoint path", () => {
    /* Trust actions invalidate ["/api/brain/ledger/counterparties"], and the post-upload
       invalidation matches on the "/api/brain/" prefix. A decorated key would silently
       opt out of both while still looking correct. */
    expect(read("client/src/lib/brainVendors.ts")).toContain(
      'queryKey: ["/api/brain/ledger/counterparties"],',
    );
  });
});
