import { describe, it, expect } from "vitest";
import {
  parseBrainSources,
  isConnectedBrainSource,
  isDisconnectHidden,
  isProviderRemoveHidden,
  categoryForBrainSource,
  brainSourceLabel,
  brainSourceSubtitle,
  type BrainSource,
} from "./brainSources";

/**
 * These pin the two things that must not drift:
 *   1. the disconnect control is hidden ONLY when upstream metadata says so, so a real
 *      tenant's source (no metadata) always keeps its control;
 *   2. the parse survives whatever the BFF's verbatim GET passthrough relays.
 */

const src = (over: Partial<BrainSource> = {}): BrainSource => ({
  id: "src_1",
  type: "plaid",
  status: "connected",
  metadata: {},
  ...over,
});

describe("parseBrainSources", () => {
  it("reads the documented { data, next_cursor } envelope", () => {
    const out = parseBrainSources({
      data: [
        { id: "src_1", type: "plaid", status: "connected", metadata: { disconnect_hidden: true } },
        { id: "src_2", type: "STRIPE", status: "Connected" },
      ],
      next_cursor: null,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: "src_1",
      type: "plaid",
      status: "connected",
      metadata: { disconnect_hidden: true },
    });
    // type and status are normalised to lowercase so callers can match reliably.
    expect(out[1].type).toBe("stripe");
    expect(out[1].status).toBe("connected");
  });

  it("also accepts a bare array", () => {
    expect(parseBrainSources([{ id: "src_1", type: "finch" }])).toHaveLength(1);
  });

  it("returns [] for an error body, null, or any non-list shape", () => {
    expect(parseBrainSources(undefined)).toEqual([]);
    expect(parseBrainSources(null)).toEqual([]);
    expect(parseBrainSources({ error: "brain_unconfigured" })).toEqual([]);
    expect(parseBrainSources("nope")).toEqual([]);
    expect(parseBrainSources({ data: "nope" })).toEqual([]);
  });

  it("drops rows without a usable id and type rather than rendering an unactionable source", () => {
    const out = parseBrainSources({
      data: [{ id: "src_1", type: "plaid" }, { id: "src_2" }, { type: "stripe" }, { id: "", type: "x" }, 42],
    });
    expect(out.map((s) => s.id)).toEqual(["src_1"]);
  });

  it("treats an ARRAY metadata as absent - it would otherwise defeat every metadata check", () => {
    const [s] = parseBrainSources({ data: [{ id: "src_1", type: "plaid", metadata: [] }] });
    expect(s.metadata).toEqual({});
    expect(isDisconnectHidden(s)).toBe(false);
  });

  it("defaults a missing status to empty rather than inventing 'connected'", () => {
    const [s] = parseBrainSources({ data: [{ id: "src_1", type: "plaid" }] });
    expect(s.status).toBe("");
    expect(isConnectedBrainSource(s)).toBe(true);
  });
});

describe("isDisconnectHidden", () => {
  it("hides on disconnect_hidden: true", () => {
    expect(isDisconnectHidden(src({ metadata: { disconnect_hidden: true } }))).toBe(true);
  });

  it("hides on disconnectable: false", () => {
    expect(isDisconnectHidden(src({ metadata: { disconnectable: false } }))).toBe(true);
  });

  it("hides when the demo seed sets the whole trio", () => {
    const seeded = src({ metadata: { disconnectable: false, disconnect_hidden: true, sync_disabled: true } });
    expect(isDisconnectHidden(seeded)).toBe(true);
  });

  it("REAL tenants are unaffected: no metadata means the control shows", () => {
    expect(isDisconnectHidden(src())).toBe(false);
    expect(isDisconnectHidden(src({ metadata: { sync_disabled: true } }))).toBe(false);
    expect(isDisconnectHidden(src({ metadata: { disconnectable: true, disconnect_hidden: false } }))).toBe(false);
  });

  it("ignores truthy-but-not-true values so a stray string can't hide a real control", () => {
    expect(isDisconnectHidden(src({ metadata: { disconnect_hidden: "true" as unknown as boolean } }))).toBe(false);
    expect(isDisconnectHidden(src({ metadata: { disconnectable: 0 as unknown as boolean } }))).toBe(false);
  });
});

describe("isProviderRemoveHidden", () => {
  const local = (...ids: string[]) => new Set(ids);
  const restricted = (...types: string[]) => new Set(types);

  it("hides the affordance for a purely-upstream restricted connector", () => {
    expect(isProviderRemoveHidden("stripe", local(), restricted("stripe"))).toBe(true);
  });

  it("MIXED CASE: a real local connection stays removable even when upstream seeds a restricted row of the same type", () => {
    expect(isProviderRemoveHidden("stripe", local("stripe"), restricted("stripe"))).toBe(false);
  });

  it("leaves unrelated providers alone", () => {
    expect(isProviderRemoveHidden("quickbooks", local(), restricted("stripe"))).toBe(false);
    expect(isProviderRemoveHidden("quickbooks", local("quickbooks"), restricted("stripe"))).toBe(false);
  });

  it("shows the control when nothing is restricted at all (real tenant)", () => {
    expect(isProviderRemoveHidden("stripe", local("stripe"), restricted())).toBe(false);
  });
});

describe("isConnectedBrainSource", () => {
  it("keeps live and in-progress statuses", () => {
    for (const status of ["connected", "syncing", "error", ""]) {
      expect(isConnectedBrainSource(src({ status }))).toBe(true);
    }
  });

  it("drops severed statuses", () => {
    for (const status of ["disconnected", "revoked", "deleted"]) {
      expect(isConnectedBrainSource(src({ status }))).toBe(false);
    }
  });
});

describe("categoryForBrainSource", () => {
  it("maps the six seeded connector types onto their categories", () => {
    const expected: Record<string, string> = {
      plaid: "bank",
      alchemy: "crypto",
      merge: "accounting",
      finch: "payroll",
      stripe: "payments",
      email_inbound: "tax",
    };
    for (const [type, category] of Object.entries(expected)) {
      expect(categoryForBrainSource(src({ type }))).toBe(category);
    }
  });

  it("falls through to Documents for an unknown connector rather than dropping it", () => {
    expect(categoryForBrainSource(src({ type: "netsuite" }))).toBe("documents");
  });
});

describe("labels", () => {
  it("prefers upstream metadata over the per-type fallback", () => {
    expect(brainSourceLabel(src({ metadata: { display_name: "Chase Business" } }))).toBe("Chase Business");
    expect(brainSourceLabel(src({ metadata: { institution_name: "Mercury" } }))).toBe("Mercury");
  });

  it("falls back to a readable type name, then the raw type", () => {
    expect(brainSourceLabel(src({ type: "email_inbound" }))).toBe("Tax Return");
    expect(brainSourceLabel(src({ type: "netsuite" }))).toBe("netsuite");
  });

  it("appends a mask to the subtitle only when upstream sent one", () => {
    expect(brainSourceSubtitle(src())).toBe("Connected");
    expect(brainSourceSubtitle(src({ status: "" }))).toBe("Connected");
    expect(brainSourceSubtitle(src({ metadata: { account_mask: "4821" } }))).toBe("Connected · ····4821");
  });
});

/**
 * Regression guard pinned to a REAL seeded tenant's /v1/sources payload (captured
 * 2026-07-29, the first durable tenant created with demo_seed: true).
 *
 * The earlier unit tests were written against hand-made fixtures that used the SHORT
 * connector spellings ("merge", "alchemy"). Live rows are "merge_accounting" and
 * "alchemy_wallet", so those two silently fell through to Documents - wrong counts and
 * wrong badges - and no fixture caught it. Keep this table byte-faithful to upstream.
 */
describe("real seeded /v1/sources payload", () => {
  const LIVE_ROWS = [
    { type: "plaid", source_category: "banking_cash", display_name: "First Meridian Bank", category: "bank" },
    { type: "stripe", source_category: "payments_revenue", display_name: "Brightline Stripe", category: "payments" },
    { type: "finch", source_category: "payroll_hr", display_name: "Brightline Payroll", category: "payroll" },
    { type: "merge_accounting", source_category: "accounting_erp", display_name: "Brightline Accounting", category: "accounting" },
    { type: "alchemy_wallet", source_category: "digital_assets", display_name: "Brightline Treasury Wallet", category: "crypto" },
    { type: "email_inbound", source_category: "documents_email", display_name: "Brightline Tax Portal", category: "tax" },
  ] as const;

  const payload = {
    data: LIVE_ROWS.map((r, i) => ({
      id: `src_live_${i}`,
      tenantId: "tnt_live",
      type: r.type,
      status: "active",
      metadata: {
        display_name: r.display_name,
        source_category: r.source_category,
        provider_name: "Provider",
        demo_fake_connected: true,
        demo_seed_kind: "fake_connected_source",
        disconnectable: false,
        disconnect_hidden: true,
        sync_disabled: true,
      },
    })),
    next_cursor: null,
  };

  const parsed = parseBrainSources(payload);

  it("parses all six seeded rows", () => {
    expect(parsed).toHaveLength(6);
  });

  it("maps every live connector type to its category - no silent Documents fallback", () => {
    const got = parsed.map((s) => categoryForBrainSource(s));
    expect(got).toEqual(LIVE_ROWS.map((r) => r.category));
    // The bug this pins: merge_accounting/alchemy_wallet must NOT land in documents.
    expect(got.filter((c) => c === "documents")).toHaveLength(0);
  });

  it("hides the disconnect control on every seeded row", () => {
    for (const s of parsed) expect(isDisconnectHidden(s)).toBe(true);
  });

  it("prefers upstream display_name for the row label", () => {
    expect(parsed.map((s) => brainSourceLabel(s))).toEqual(LIVE_ROWS.map((r) => r.display_name));
  });

  it("falls back to upstream source_category for an unrecognised connector type", () => {
    const [unknown] = parseBrainSources([
      { id: "src_x", type: "some_future_connector", status: "active", metadata: { source_category: "banking_cash" } },
    ]);
    expect(categoryForBrainSource(unknown)).toBe("bank");
  });
});
