import { describe, expect, it } from "vitest";
import {
  accountResult,
  decisionResult,
  rankResults,
  vendorResult,
  MAX_RESULTS,
  type SearchResult,
} from "./globalSearch";

const decision = (id: string, title: string, detail?: string, extra?: string) =>
  decisionResult({ id, title, detail, extra });
const vendor = (id: string, name: string, category?: string) => vendorResult({ id, name, category });
const account = (id: string, name: string, institution?: string) =>
  accountResult({ id, name, institution });

describe("result builders", () => {
  it("routes each kind at a destination that already exists", () => {
    expect(decision("p1", "Confirm treasury transfer").href).toBe("/decisions?proposal=p1");
    expect(vendor("v1", "Quick Pay").href).toBe("/ledger?tab=counterparties&vendor=v1");
    expect(account("a1", "Operating").href).toBe("/ledger?tab=accounts&account=a1");
  });

  it("escapes ids rather than splicing them into a query string raw", () => {
    expect(vendor("a b&c=d", "X").href).toBe("/ledger?tab=counterparties&vendor=a%20b%26c%3Dd");
  });

  it("keys are unique across kinds so a shared id cannot collide", () => {
    expect(decision("1", "A").key).not.toBe(vendor("1", "A").key);
    expect(vendor("1", "A").key).not.toBe(account("1", "A").key);
  });

  it("matches on hidden text but does not display it", () => {
    const r = decision("p1", "Collections outreach", "Riverside Co", "Collections Agent");
    expect(r.search).toContain("collections agent");
    expect(r.detail).toBe("Riverside Co");
  });
});

describe("decision deep-link contract", () => {
  it("decision href uses ?proposal= so InboxPage's brain-proposal deep-link can pick it up", () => {
    const r = decision("brain-abc123", "Treasury sweep", "cash flow");
    expect(r.href).toBe("/decisions?proposal=brain-abc123");
    // The param name must match what InboxPage reads in its deep-link effects.
    const params = new URLSearchParams(r.href.split("?")[1]);
    expect(params.get("proposal")).toBe("brain-abc123");
  });

  it("InboxPage has a brain-proposal deep-link effect that reads liveProposals", () => {
    // Source guard: the effect must exist and depend on liveProposals so it
    // fires when async data arrives, not only when the URL changes.
    const { readFileSync } = require("fs");
    const src = readFileSync("client/src/pages/InboxPage.tsx", "utf8");
    expect(src).toContain("liveProposals.find((p) => p.id === proposalId)");
    expect(src).toContain("setSelectedProposal(brainTarget)");
    expect(src).toContain("}, [search, liveProposals]);");
  });
});

describe("rankResults", () => {
  const rows: SearchResult[] = [
    decision("p1", "Collections outreach for Riverside Co"),
    decision("p2", "Possible duplicate invoice from Quick Pay Solutions"),
    vendor("v1", "Quick Pay Solutions", "Payments"),
    vendor("v2", "Acme Supplies", "Office"),
    account("a1", "Operating account", "First Meridian Bank"),
    account("a2", "Reserve account", "First Meridian Bank"),
  ];

  it("returns nothing for an empty query rather than the first six records", () => {
    /* An unasked question has no answer. Showing arbitrary rows would imply a
       ranking that does not exist. */
    expect(rankResults(rows, "")).toEqual([]);
    expect(rankResults(rows, "   ")).toEqual([]);
  });

  it("ranks a label prefix above a mid-label match", () => {
    const out = rankResults(rows, "quick");
    expect(out[0].label).toBe("Quick Pay Solutions");
  });

  it("ranks a visible label match above a hidden-text-only match", () => {
    const hiddenOnly = decision("p3", "Unrelated title", null, "Riverside Co");
    const out = rankResults([hiddenOnly, ...rows], "riverside");
    expect(out[0].label).toBe("Collections outreach for Riverside Co");
    expect(out.map((r) => r.id)).toContain("p3");
  });

  it("narrows as terms are added, matching the Decisions page rule", () => {
    expect(rankResults(rows, "quick").length).toBeGreaterThan(1);
    const narrowed = rankResults(rows, "quick pay solutions");
    expect(narrowed.every((r) => r.search.includes("quick"))).toBe(true);
    expect(rankResults(rows, "quick zzzz")).toEqual([]);
  });

  it("matches across kinds, not just one source", () => {
    const kinds = new Set(rankResults(rows, "account").map((r) => r.kind));
    expect(kinds.has("account")).toBe(true);
  });

  it("breaks ties by kind order, then by the source's own order", () => {
    const tied: SearchResult[] = [
      account("a9", "Meridian"),
      vendor("v9", "Meridian"),
      decision("p9", "Meridian"),
    ];
    expect(rankResults(tied, "meridian").map((r) => r.kind)).toEqual([
      "decision",
      "vendor",
      "account",
    ]);
  });

  it("caps the list so a shortcut does not become a page", () => {
    const many = Array.from({ length: 40 }, (_, i) => vendor(`v${i}`, `Vendor ${i}`));
    expect(rankResults(many, "vendor")).toHaveLength(MAX_RESULTS);
    expect(rankResults(many, "vendor", 2)).toHaveLength(2);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(rankResults(rows, "  QUICK  ")[0].label).toBe("Quick Pay Solutions");
  });

  it("treats regex metacharacters as literal text", () => {
    /* score() builds a RegExp from the query; an unescaped "(" would throw and
       take the whole bar down as the user types. */
    const odd = [vendor("v1", "Acme (Holdings)")];
    expect(() => rankResults(odd, "(hold")).not.toThrow();
    expect(rankResults(odd, "(hold")).toHaveLength(1);
  });
});
