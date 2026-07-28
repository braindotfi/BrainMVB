import { describe, it, expect, afterEach, vi } from "vitest";
import {
  normalizeObligation,
  isReceivable,
  fetchObligations,
  type RawObligation,
} from "./brainObligations";

const base: Omit<RawObligation, "direction" | "type"> = {
  id: "obl_1",
  counterparty_id: "cp_1",
  amount_due: "100.00",
  currency: "USD",
  due_date: "2026-08-01",
  status: "upcoming",
  provenance: null,
  confidence: 0.4,
};

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      json: async () => body,
      text: async () => JSON.stringify(body),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeObligation", () => {
  it("keeps an explicit direction", () => {
    expect(normalizeObligation({ ...base, direction: "receivable" }).direction).toBe("receivable");
  });

  it("falls back to brain-core's `type` field", () => {
    expect(normalizeObligation({ ...base, type: "receivable" }).direction).toBe("receivable");
  });

  it("prefers direction over type when both are present", () => {
    const o = normalizeObligation({ ...base, direction: "payable", type: "receivable" });
    expect(o.direction).toBe("payable");
  });

  it("defaults to payable when the flag is missing, null or blank", () => {
    expect(normalizeObligation({ ...base }).direction).toBe("payable");
    expect(normalizeObligation({ ...base, direction: null, type: null }).direction).toBe("payable");
    expect(normalizeObligation({ ...base, direction: "   " }).direction).toBe("payable");
  });

  it("leaves every other field untouched", () => {
    const o = normalizeObligation({ ...base, type: "receivable" });
    expect(o.id).toBe("obl_1");
    expect(o.amount_due).toBe("100.00");
    expect(o.confidence).toBe(0.4);
  });
});

describe("isReceivable", () => {
  it("matches receivable regardless of case or plurality", () => {
    for (const d of ["receivable", "RECEIVABLE", "Receivables", "receiv"]) {
      expect(isReceivable({ ...base, direction: d })).toBe(true);
    }
  });

  it("treats payable and unknown values as not receivable", () => {
    for (const d of ["payable", "PAYABLE", "something_else"]) {
      expect(isReceivable({ ...base, direction: d })).toBe(false);
    }
  });

  // The regression: a record with no direction at all must not throw during render.
  it("does not throw on a record that arrived with no direction", () => {
    const o = normalizeObligation({ ...base } as RawObligation);
    expect(() => isReceivable(o)).not.toThrow();
    expect(isReceivable(o)).toBe(false);
  });
});

describe("fetchObligations", () => {
  it("returns [] on 404 rather than throwing", async () => {
    stubFetch(404, null);
    await expect(fetchObligations()).resolves.toEqual([]);
  });

  it("unwraps the { obligations } envelope", async () => {
    stubFetch(200, { obligations: [{ ...base, type: "receivable" }], next_cursor: null });
    const [o] = await fetchObligations();
    expect(o.direction).toBe("receivable");
  });

  it("accepts a bare array", async () => {
    stubFetch(200, [{ ...base, direction: "payable" }]);
    expect(await fetchObligations()).toHaveLength(1);
  });

  it("survives a payload with no obligations key", async () => {
    stubFetch(200, {});
    await expect(fetchObligations()).resolves.toEqual([]);
  });

  it("drops null entries instead of dereferencing them", async () => {
    stubFetch(200, { obligations: [null, { ...base }], next_cursor: null });
    const out = await fetchObligations();
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("payable");
  });

  // End-to-end guard on the crash: an undirected record must come back renderable.
  it("normalizes every record so isReceivable is always safe", async () => {
    stubFetch(200, {
      obligations: [{ ...base, id: "a" }, { ...base, id: "b", type: "receivable" }],
      next_cursor: null,
    });
    const out = await fetchObligations();
    expect(() => out.filter(isReceivable)).not.toThrow();
    expect(out.filter(isReceivable).map((o) => o.id)).toEqual(["b"]);
  });

  it("throws on a genuine server error so it is not silently swallowed", async () => {
    stubFetch(500, { error: "boom" });
    await expect(fetchObligations()).rejects.toThrow(/500/);
  });
});
