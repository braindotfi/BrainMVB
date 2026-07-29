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
