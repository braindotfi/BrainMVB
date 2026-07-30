import { describe, it, expect, afterEach, vi } from "vitest";
import {
  normalizeObligation,
  isReceivable,
  fetchObligations,
  type RawObligation,
} from "./brainObligations";

/** A well-formed record as brain-core is *supposed* to send it. */
const base: RawObligation = {
  id: "obl_1",
  direction: "payable",
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

describe("normalizeObligation - direction", () => {
  it("keeps an explicit direction", () => {
    expect(normalizeObligation({ ...base, direction: "receivable" }).direction).toBe("receivable");
  });

  it("falls back to brain-core's `type` field", () => {
    expect(normalizeObligation({ ...base, direction: undefined, type: "receivable" }).direction).toBe(
      "receivable",
    );
  });

  it("prefers direction over type when both are present", () => {
    expect(normalizeObligation({ ...base, direction: "payable", type: "receivable" }).direction).toBe(
      "payable",
    );
  });

  it("defaults to payable when the flag is missing, null or blank", () => {
    expect(normalizeObligation({ ...base, direction: undefined }).direction).toBe("payable");
    expect(normalizeObligation({ ...base, direction: null, type: null }).direction).toBe("payable");
    expect(normalizeObligation({ ...base, direction: "   " }).direction).toBe("payable");
  });
});

describe("normalizeObligation - every other field", () => {
  it("passes a well-formed record through unchanged", () => {
    expect(normalizeObligation(base)).toEqual({
      id: "obl_1",
      direction: "payable",
      counterparty_id: "cp_1",
      amount_due: "100.00",
      currency: "USD",
      due_date: "2026-08-01",
      status: "upcoming",
      provenance: null,
      confidence: 0.4,
    });
  });

  // ConfidencePill guards with `confidence !== null`, so an *undefined* confidence sailed
  // through and rendered "NaN% · needs confirmation".
  it("coerces a missing or non-numeric confidence to null, never NaN", () => {
    for (const c of [undefined, null, "0.4", NaN, Infinity]) {
      const o = normalizeObligation({ ...base, confidence: c });
      expect(o.confidence).toBeNull();
    }
    expect(normalizeObligation({ ...base, confidence: 0 }).confidence).toBe(0);
  });

  it("defaults amount and currency so money never renders as 'undefined'", () => {
    const o = normalizeObligation({ ...base, amount_due: undefined, currency: undefined });
    expect(o.amount_due).toBe("0");
    expect(o.currency).toBe("USD");
  });

  it("defaults status and nulls the optional string fields", () => {
    const o = normalizeObligation({
      ...base,
      status: undefined,
      due_date: undefined,
      counterparty_id: undefined,
      provenance: undefined,
    });
    expect(o.status).toBe("upcoming");
    expect(o.due_date).toBeNull();
    expect(o.counterparty_id).toBeNull();
    expect(o.provenance).toBeNull();
  });

  it("synthesizes a STABLE id when one is missing, so React keys survive a refetch", () => {
    const raw = { ...base, id: undefined };
    const first = normalizeObligation(raw).id;
    const second = normalizeObligation({ ...raw }).id;
    expect(first).toBe(second);
    expect(first).toContain("synthetic:");
  });

  it("gives two different records different synthesized ids", () => {
    const a = normalizeObligation({ ...base, id: undefined, amount_due: "10.00" });
    const b = normalizeObligation({ ...base, id: undefined, amount_due: "20.00" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("isReceivable", () => {
  it("matches receivable regardless of case or plurality", () => {
    for (const d of ["receivable", "RECEIVABLE", "Receivables", "receiv"]) {
      expect(isReceivable({ ...base, direction: d } as never)).toBe(true);
    }
  });

  it("treats payable and unknown values as not receivable", () => {
    for (const d of ["payable", "PAYABLE", "something_else"]) {
      expect(isReceivable({ ...base, direction: d } as never)).toBe(false);
    }
  });

  // The regression: a record with no direction at all must not throw during render.
  it("does not throw on a record that arrived with no direction", () => {
    const o = normalizeObligation({ ...base, direction: undefined });
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
    stubFetch(200, { obligations: [{ ...base, direction: undefined, type: "receivable" }], next_cursor: null });
    const [o] = await fetchObligations();
    expect(o.direction).toBe("receivable");
  });

  it("accepts a bare array", async () => {
    stubFetch(200, [base]);
    expect(await fetchObligations()).toHaveLength(1);
  });

  it("survives a payload with no obligations key", async () => {
    stubFetch(200, {});
    await expect(fetchObligations()).resolves.toEqual([]);
  });

  it("drops null entries instead of dereferencing them", async () => {
    stubFetch(200, { obligations: [null, { ...base, direction: undefined }], next_cursor: null });
    const out = await fetchObligations();
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("payable");
  });

  // End-to-end guard on the crash: an undirected record must come back renderable.
  it("normalizes every record so isReceivable is always safe", async () => {
    stubFetch(200, {
      obligations: [
        { ...base, id: "a", direction: undefined },
        { ...base, id: "b", direction: undefined, type: "receivable" },
      ],
      next_cursor: null,
    });
    const out = await fetchObligations();
    expect(() => out.filter(isReceivable)).not.toThrow();
    expect(out.filter(isReceivable).map((o) => o.id)).toEqual(["b"]);
  });

  // A totally empty object is the worst realistic payload; it must still render.
  it("turns a completely empty record into something renderable", async () => {
    stubFetch(200, { obligations: [{}], next_cursor: null });
    const [o] = await fetchObligations();
    expect(o.direction).toBe("payable");
    expect(o.amount_due).toBe("0");
    expect(o.currency).toBe("USD");
    expect(o.confidence).toBeNull();
    expect(o.id).toBeTruthy();
  });

  it("throws on a genuine server error so it is not silently swallowed", async () => {
    stubFetch(500, { error: "boom" });
    await expect(fetchObligations()).rejects.toThrow(/500/);
  });
});
