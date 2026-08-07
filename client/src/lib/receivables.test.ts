import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  arReceivables,
  receivablesTotal,
  receivablesView,
  isArInvoice,
  type RawInvoice,
} from "./receivables";
import { fetchAllPages } from "./brainPagination";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

/**
 * Source with comments removed.
 *
 * Every source-level guard below reads this rather than the raw file. These modules
 * explain the traps they avoid IN PROSE — the AR doc block spells out the `!== "ap"`
 * negation it exists to prevent — so a raw-text guard both trips on its own
 * documentation and, worse, can be satisfied by a comment that merely mentions the
 * thing it is supposed to require.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const inv = (over: Partial<RawInvoice> & { scenario?: string | null }): RawInvoice => {
  const { scenario, ...rest } = over;
  return {
    id: "inv_1",
    invoice_number: "INV-1",
    counterparty_id: "cp_1",
    amount_due: "100.00000000",
    amount_paid: "0.00000000",
    currency: "USD",
    due_date: "2026-08-01T00:00:00.000Z",
    status: "sent",
    metadata: scenario === undefined ? { scenario: "ar" } : scenario === null ? null : { scenario },
    ...rest,
  };
};

describe("AR is selected by a positive marker, never by negation", () => {
  it("takes only scenario === 'ar'", () => {
    expect(isArInvoice(inv({ scenario: "ar" }))).toBe(true);
    expect(isArInvoice(inv({ scenario: "ap" }))).toBe(false);
    expect(isArInvoice(inv({ scenario: null }))).toBe(false);
    expect(isArInvoice({ ...inv({}), metadata: {} })).toBe(false);
    expect(isArInvoice({ ...inv({}), metadata: undefined })).toBe(false);
  });

  it("a scenario nobody has invented yet is NOT a receivable", () => {
    /* This is the whole reason the marker is positive. Under the old `!== "ap"`
       reading, every one of these would have been counted as money owed TO the
       tenant the day brain-core started emitting it. */
    for (const s of ["ar_draft", "intercompany", "credit_note", "AR", "", "unknown"]) {
      expect(isArInvoice(inv({ scenario: s })), `scenario "${s}" must not count as AR`).toBe(false);
    }
  });

  it("the module never reaches for a negation of 'ap'", () => {
    // A source-level check because a reintroduced negation would still pass the
    // behavioural tests above for as long as only ap/ar exist on the tenant.
    expect(code("./receivables.ts")).not.toMatch(/!==\s*["']ap["']/);
  });
});

describe("the running total cannot be quietly wrong", () => {
  const rows = [inv({ id: "a", amount_due: "100" }), inv({ id: "b", amount_due: "50" })];

  it("sums what is still outstanding, not what was billed", () => {
    const partPaid = [inv({ id: "a", amount_due: "100", amount_paid: "30" })];
    expect(receivablesTotal(partPaid, { complete: true })).toBe(70);
  });

  it("returns null when the cursor walk did not finish", () => {
    /* The point of the whole contract: a truncated read produces a real, plausible,
       SMALLER number. Refusing to return one is what stops the tab presenting it. */
    expect(receivablesTotal(rows, { complete: false })).toBeNull();
    expect(receivablesTotal(rows, { complete: true })).toBe(150);
  });

  it("returns null when there was nothing to read at all", () => {
    expect(receivablesTotal(null, { complete: true })).toBeNull();
    expect(receivablesTotal(undefined, { complete: true })).toBeNull();
  });

  it("an empty but COMPLETE read is a real zero, not an unknown", () => {
    expect(receivablesTotal([], { complete: true })).toBe(0);
  });

  it("no caller coerces an unreachable total into a zero", () => {
    const src = code("../components/ReceivablesTab.tsx");
    expect(src, "an unreachable total must stay null").not.toMatch(
      /receivablesTotal\([^;]*\)\s*(\?\?|\|\|)\s*0/,
    );
  });
});

describe("settled invoices drop out, unknown statuses do not", () => {
  it("excludes discharged statuses", () => {
    for (const s of ["paid", "void", "written_off", "cancelled"]) {
      expect(arReceivables([inv({ status: s })]), `${s} must not be outstanding`).toHaveLength(0);
    }
  });

  it("keeps a status it does not recognise", () => {
    // Over-reporting is visible and checkable; silently writing off money owed is not.
    expect(arReceivables([inv({ status: "in_dispute" })])).toHaveLength(1);
  });

  it("sorts by due date and puts undated rows last", () => {
    const out = arReceivables([
      inv({ id: "late", due_date: "2026-09-01T00:00:00.000Z" }),
      inv({ id: "none", due_date: null }),
      inv({ id: "early", due_date: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["early", "late", "none"]);
  });
});

describe("the AR feed reproduces the reference tenant", () => {
  /* The twelve AR rows measured on a live staging tenant: eight AR-aging fixture
     rows plus four seeded AR invoices. Pinned as a FIXTURE, not read live — the
     figure is here to catch a change in how the total is derived, and a live read
     would make this test a status report on someone else's data. */
  const AMOUNTS = [4300, 7450, 8000, 9800, 12600, 15200, 18500, 21150, 27300, 42000, 145000, 290000];
  const feed: RawInvoice[] = [
    ...AMOUNTS.map((a, i) => inv({ id: `ar_${i}`, amount_due: `${a}.00000000` })),
    // AP rows share the endpoint and must not be picked up.
    inv({ id: "ap_1", scenario: "ap", amount_due: "999999" }),
    inv({ id: "ap_2", scenario: "ap", amount_due: "999999" }),
    inv({ id: "ap_3", scenario: "ap", amount_due: "999999" }),
  ];

  it("selects the twelve AR rows and sums them", () => {
    expect(arReceivables(feed)).toHaveLength(12);
    expect(receivablesTotal(feed, { complete: true })).toBe(601300);
  });
});

describe("an internal record handle is not an invoice number", () => {
  it("suppresses a raw-document id echoed into invoice_number", () => {
    /* brain-core does this when extraction finds no number on an uploaded document.
       Printed verbatim it claims the customer's invoice is numbered raw_01KZ… */
    const [r] = arReceivables([inv({ invoice_number: "raw_01KZ7VPJ4R66HEQG66P6Z30NB2" })]);
    expect(r.invoice_number).toBeNull();
  });

  it("suppresses the other brain-core id prefixes too", () => {
    for (const id of ["inv_01KZ7VNZ9WTFMZ1DDV70BAJK2P", "doc_01KZ7VNZ9WTFMZ1DDV70BAJK2P"]) {
      expect(arReceivables([inv({ invoice_number: id })])[0].invoice_number).toBeNull();
    }
  });

  it("keeps every real invoice number, including ones that start with 'inv'", () => {
    // The match must be exact, or a legitimate number gets silently hidden.
    for (const n of ["INV-1049", "AR-STARTUPX-001", "inv-2026-004", "raw-materials-77", "0117"]) {
      expect(arReceivables([inv({ invoice_number: n })])[0].invoice_number, n).toBe(n);
    }
  });
});

describe("an incomplete read never renders as \"nobody owes you anything\"", () => {
  const ar = [inv({ id: "a", amount_due: "100" })];

  it("zero rows on an UNFINISHED read is unreadable, not empty", () => {
    /* The quiet failure this exists to stop: the walk was cut short before it reached
       any AR row, so the tab has seen part of the invoice history and knows nothing
       about the rest — but "empty" would state, calmly, that nothing is outstanding. */
    const v = receivablesView({ failed: false, read: { rows: [], complete: false }, ingesting: false });
    expect(v.kind).toBe("unreadable");
    expect(v.total).toBeNull();
  });

  it("zero rows on a FINISHED read is a real empty", () => {
    expect(receivablesView({ failed: false, read: { rows: [], complete: true }, ingesting: false }).kind).toBe("empty");
  });

  it("an AP-only first page that was cut short is still unreadable", () => {
    // Rows came back, just none of them AR. Row count alone cannot tell these apart.
    const v = receivablesView({
      failed: false,
      read: { rows: [inv({ scenario: "ap" }), inv({ scenario: "ap" })], complete: false },
      ingesting: false,
    });
    expect(v.kind).toBe("unreadable");
  });

  it("distinguishes failed from loading", () => {
    expect(receivablesView({ failed: true, read: null, ingesting: false }).kind).toBe("failed");
    expect(receivablesView({ failed: false, read: null, ingesting: false }).kind).toBe("loading");
    // A failure must not borrow a stale read to look answered.
    expect(receivablesView({ failed: true, read: { rows: ar, complete: true }, ingesting: false }).rows).toHaveLength(0);
  });

  it("shows rows from a truncated read but withholds the total", () => {
    const v = receivablesView({ failed: false, read: { rows: ar, complete: false }, ingesting: false });
    expect(v.kind).toBe("rows");
    expect(v.truncated).toBe(true);
    expect(v.total).toBeNull();
  });

  it("a complete read with rows is neither truncated nor total-less", () => {
    const v = receivablesView({ failed: false, read: { rows: ar, complete: true }, ingesting: false });
    expect(v).toMatchObject({ kind: "rows", truncated: false, total: 100 });
  });

  it("the tab does not decide the empty state on row count alone", () => {
    // The branch order lives in receivablesView precisely so it stays tested.
    expect(code("../components/ReceivablesTab.tsx")).not.toMatch(/rows\.length\s*===\s*0/);
  });
});

describe("Receivables reads the invoice feed, and only the invoice feed", () => {
  const tab = code("../components/ReceivablesTab.tsx");

  it("reads /ledger/invoices", () => {
    expect(tab).toContain("/api/brain/ledger/invoices");
  });

  it("never reads the obligations feed", () => {
    /* The trap this guards: `/ledger/obligations?direction=receivable` looks like
       the obvious source and returns real AR rows, but on the reference tenant it
       carries only a SUBSET of them — the AR-aging rows, which are also invoices.
       Reading it instead of invoices drops the largest rows; reading it as well
       double-counts the shared ones. Either way the total is wrong and looks fine. */
    expect(tab, "Receivables must not mix in the obligations feed").not.toContain(
      "/api/brain/ledger/obligations",
    );
  });

  it("walks the cursor instead of taking the first page", () => {
    expect(tab, "an unpaged read silently truncates the total").toContain("fetchAllPages");
  });
});

describe("the cursor walk reports whether it actually finished", () => {
  const page = (rows: unknown[], next: string | null) =>
    ({ ok: true, json: async () => ({ invoices: rows, next_cursor: next }) }) as unknown as Response;

  it("follows next_cursor to the end and concatenates", async () => {
    const pages = [page([1, 2], "c1"), page([3], null)];
    let n = 0;
    const out = await fetchAllPages<number>("/x", "invoices", { fetchImpl: async () => pages[n++] });
    expect(out).toEqual({ rows: [1, 2, 3], complete: true });
  });

  it("stops and reports incomplete when the cursor stops advancing", async () => {
    // A server that keeps returning the same cursor would otherwise loop forever.
    const out = await fetchAllPages<number>("/x", "invoices", {
      fetchImpl: async () => page([1], "same"),
    });
    expect(out.complete).toBe(false);
  });

  it("does not count the replayed page twice when the cursor stalls", async () => {
    /* The stalled page is the SAME page. Appending it before noticing the repeat
       would hand back a list with one page duplicated in it. */
    const out = await fetchAllPages<number>("/x", "invoices", {
      fetchImpl: async () => page([1, 2], "same"),
    });
    expect(out).toEqual({ rows: [1, 2], complete: false });
  });

  it("reports incomplete rather than looping past the page cap", async () => {
    let i = 0;
    const out = await fetchAllPages<number>("/x", "invoices", {
      maxPages: 3,
      fetchImpl: async () => page([1], `c${i++}`),
    });
    expect(out).toEqual({ rows: [1, 1, 1], complete: false });
  });

  it("reports incomplete on an undeclared page at the known page-cap size", async () => {
    /* No `next_cursor` field at all, at exactly the smallest cap brain-core is known to
       apply silently. Reading that silence as "done" is the defect this pins: a client
       walker that stopped here used to call a capped, cursorless page complete. */
    const rows = Array.from({ length: 20 }, (_, n) => n);
    const out = await fetchAllPages<number>("/x", "invoices", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ invoices: rows }) }) as unknown as Response,
    });
    expect(out.complete).toBe(false);
  });

  it("accepts an undeclared page too small to have been capped", async () => {
    const out = await fetchAllPages<number>("/x", "invoices", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ invoices: [1, 2, 3] }) }) as unknown as Response,
    });
    expect(out).toEqual({ rows: [1, 2, 3], complete: true });
  });

  it("an explicit next_cursor:null is proof, even on a large page", async () => {
    // Mirrors the server twin's identical case: an explicit null outranks the cap
    // heuristic, which exists only for endpoints that never declare a cursor at all.
    const rows = Array.from({ length: 25 }, (_, n) => n);
    const out = await fetchAllPages<number>("/x", "invoices", { fetchImpl: async () => page(rows, null) });
    expect(out).toEqual({ rows, complete: true });
  });

  it("throws on a 200 whose shape carries no rows array", async () => {
    /* Not an empty list — a response we do not understand. Returning [] here is how
       a shape change becomes "you are owed nothing". */
    await expect(
      fetchAllPages("/x", "invoices", {
        fetchImpl: async () => ({ ok: true, json: async () => ({}) }) as unknown as Response,
      }),
    ).rejects.toThrow(/no "invoices" array/);
  });

  it("throws on a failed request instead of returning a short list", async () => {
    await expect(
      fetchAllPages("/x", "invoices", {
        fetchImpl: async () =>
          ({ ok: false, status: 503, statusText: "no", text: async () => "down" }) as unknown as Response,
      }),
    ).rejects.toThrow(/503/);
  });
});

describe("the tab is reachable", () => {
  const page = code("../pages/FinancesPage.tsx");

  it("is registered in the tab bar next to Payables", () => {
    expect(page).toMatch(/LEDGER_TABS.*"Payables",\s*"Receivables"/);
  });

  it("resolves every slug that points at it", () => {
    // Wouter has no 404 for an unknown ?tab= value — it falls back to Accounts, so a
    // dropped alias lands the user on bank balances rather than erroring.
    for (const slug of ["receivables", "ar"]) {
      expect(page, `?tab=${slug} must resolve`).toMatch(new RegExp(`\\b${slug}:\\s*"Receivables"`));
    }
  });

  it("renders the tab body", () => {
    expect(page).toContain("<ReceivablesTab");
  });
});

/* ── rows that have not landed yet ────────────────────────────────────────────
   A complete read is not a finished one. brain-core projects each ingested document
   into the ledger asynchronously, so invoices appear in waves: every intermediate
   read is internally consistent, plausible, and short. Nothing in the response says
   so, which is why the view takes the ingest state from outside. */

describe("an unfinished import never renders as \"nobody owes you anything\"", () => {
  const ar = [inv({ id: "a", amount_due: "100" })];

  it("zero rows while documents are still being read is \"arriving\", not \"empty\"", () => {
    const v = receivablesView({ failed: false, read: { rows: [], complete: true }, ingesting: true });
    expect(v.kind).toBe("arriving");
  });

  it("a cut-short read outranks an unfinished import — the stronger caveat wins", () => {
    const v = receivablesView({ failed: false, read: { rows: [], complete: false }, ingesting: true });
    expect(v.kind).toBe("unreadable");
  });

  it("keeps showing the rows and total it has, marked as a floor", () => {
    /* Deliberately NOT blanked. The figure is true as of now, and blanking a real
       number every time a document is being read would be its own dishonesty — so it
       stays, and `mayGrow` makes the caption say it may rise. */
    const v = receivablesView({ failed: false, read: { rows: ar, complete: true }, ingesting: true });
    expect(v).toMatchObject({ kind: "rows", total: 100, mayGrow: true });
  });

  it("a settled read is not marked as growing", () => {
    expect(receivablesView({ failed: false, read: { rows: ar, complete: true }, ingesting: false }).mayGrow).toBe(false);
  });
});
