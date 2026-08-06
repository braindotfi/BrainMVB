/**
 * Structured ledger answers, and the guarantee that no model produces them.
 *
 * Two things are pinned here. First, the arithmetic and the filters: a total that
 * quietly includes a tax row, a receivable, or another vendor's bill is the whole
 * failure mode this path exists to remove. Second, the refusals — a truncated or
 * unreachable read must never render as a number, because a smaller-but-plausible
 * figure for money owed is worse than no figure at all.
 *
 * brain-core is mocked at `fetch` rather than by stubbing `./client`, so the real
 * request building, the real cursor walk and the real obligation normalization
 * (including the `type` → `kind` split that payroll filtering depends on) are all
 * exercised. Stubbing the client would have made the payroll test pass against a
 * field the server does not actually populate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withBrainBaseUrl } from "./baseUrl";
import { answerDeterministically, classify, resolveCounterparty } from "./deterministicAnswers";

const BASE = "https://api.brain.test/v1";
const TOKEN = "test-token";
const NOW = new Date("2026-08-05T12:00:00.000Z");

/** Every URL the code under test fetched, so "the model was never called" is checkable. */
let requested: string[] = [];

interface Fixture {
  counterparties?: unknown;
  /** Pages returned in order; the walk stops when a page has `next_cursor: null`. */
  obligationPages?: unknown[];
  invoicePages?: unknown[];
  /** Endpoints that should hard-fail, matched by substring. */
  failOn?: string[];
}

function install(fx: Fixture): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      requested.push(url);
      const path = url.split("?")[0];

      if (fx.failOn?.some((f) => url.includes(f))) {
        return new Response("upstream exploded", { status: 502 });
      }

      const body = (() => {
        if (path.endsWith("/ledger/counterparties")) {
          return { counterparties: fx.counterparties ?? [] };
        }
        if (path.endsWith("/ledger/obligations")) {
          return page(fx.obligationPages, url);
        }
        if (path.endsWith("/ledger/invoices")) {
          return page(fx.invoicePages, url);
        }
        return {};
      })();

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** Serve page N of a fixture, driven by the `cursor` the walker sent back. */
function page(pages: unknown[] | undefined, url: string): unknown {
  const list = pages ?? [];
  const cursor = new URL(url).searchParams.get("cursor");
  const idx = cursor ? Number(cursor.replace("p", "")) : 0;
  return list[idx] ?? { obligations: [], invoices: [], next_cursor: null };
}

/** A single complete page. */
function onePage(field: "obligations" | "invoices", rows: unknown[]): unknown {
  return { [field]: rows, next_cursor: null };
}

/** A page set whose cursor never advances — the walker must report an incomplete read. */
function stuckPages(field: "obligations" | "invoices", rows: unknown[]): unknown[] {
  return [
    { [field]: rows, next_cursor: "p0" },
    { [field]: rows, next_cursor: "p0" },
  ];
}

/**
 * A page with NO `next_cursor` field at all — how brain-core's invoice endpoint actually
 * answers today. Silence is not a promise that the page was the whole list.
 */
function undeclaredPage(field: "obligations" | "invoices", rows: unknown[]): unknown {
  return { [field]: rows };
}

const run = (q: string) => withBrainBaseUrl(BASE, () => answerDeterministically(TOKEN, q, NOW));

const CLOUDOPS = { id: "cp_cloudops", name: "CloudOps", type: "vendor" };
const ACME = { id: "cp_acme", name: "Acme Industrial", type: "vendor" };
/** Resolves by name exactly like a vendor, but sits on the other side of the ledger. */
const ENTERPRISE = { id: "cp_enterprise", name: "Enterprise Holdings", type: "customer" };

/** Obligation rows as brain-core sends them: kind on `type`, direction absent. */
const ob = (o: Record<string, unknown>) => ({
  id: "ob_1",
  type: "bill",
  counterparty_id: CLOUDOPS.id,
  amount_due: "1000.00",
  currency: "USD",
  due_date: "2026-07-01",
  status: "due",
  ...o,
});

const inv = (i: Record<string, unknown>) => ({
  id: "inv_1",
  invoice_number: "INV-100",
  counterparty_id: ACME.id,
  amount_due: "500.00",
  currency: "USD",
  due_date: "2026-07-01",
  status: "open",
  metadata: { scenario: "ar" },
  ...i,
});

beforeEach(() => {
  requested = [];
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── routing ─────────────────────────────────────────────────────────────── */

describe("classify", () => {
  it("routes payroll questions to the payroll path", () => {
    expect(classify("what is our total payroll obligation?")).toBe("payroll-total");
    expect(classify("how much payroll do we owe")).toBe("payroll-total");
  });

  it("routes overdue customer invoices to the AR path", () => {
    expect(classify("which customer invoices are overdue?")).toBe("overdue-ar");
    expect(classify("list overdue receivables")).toBe("overdue-ar");
  });

  it("payroll wins over the counterparty path, which would refuse it as an unknown vendor", () => {
    // "how much payroll do we owe" contains "owe"; order in classify() is what saves it.
    expect(classify("how much payroll do we owe")).not.toBe("payable-by-counterparty");
  });

  it("routes owe-questions to the counterparty path", () => {
    expect(classify("how much do we owe CloudOps?")).toBe("payable-by-counterparty");
  });

  it("leaves unrelated questions alone so the normal assistant answers them", () => {
    expect(classify("what is our runway?")).toBeNull();
    expect(classify("summarise last month")).toBeNull();
    expect(classify("")).toBeNull();
  });
});

describe("resolveCounterparty", () => {
  const all = [CLOUDOPS, ACME, { id: "cp_cloud", name: "Cloud" }];

  it("prefers the most specific name when one contains another", () => {
    const r = resolveCounterparty("how much do we owe CloudOps?", all);
    expect(r.kind).toBe("resolved");
    expect(r.kind === "resolved" && r.counterparty.id).toBe(CLOUDOPS.id);
  });

  it("reports ambiguity rather than picking one", () => {
    const r = resolveCounterparty("do we owe CloudOps or Acme Industrial more?", all);
    expect(r.kind).toBe("ambiguous");
  });

  it("reports a named vendor that does not exist", () => {
    const r = resolveCounterparty("how much do we owe Globex?", all);
    expect(r.kind).toBe("unresolved");
    expect(r.kind === "unresolved" && r.term).toBe("Globex");
  });

  it("treats a general question as not-ours rather than an unknown vendor", () => {
    expect(resolveCounterparty("how much do we owe in total?", all).kind).toBe("none");
    expect(resolveCounterparty("how much do we owe?", all).kind).toBe("none");
  });

  it("treats a category of spend as not-ours, not as a missing vendor", () => {
    // Refusing these with "no counterparty called taxes" would be a dead end for a
    // question the normal assistant can answer perfectly well.
    for (const q of ["do we owe taxes?", "how much do we owe in rent?", "do we owe interest?"]) {
      expect(resolveCounterparty(q, all).kind).toBe("none");
    }
  });

  it("requires a capitalised name before declaring a vendor missing", () => {
    // Lowercase common nouns fall through to the normal assistant instead of a refusal.
    expect(resolveCounterparty("how much do we owe the landlord?", all).kind).toBe("none");
    expect(resolveCounterparty("how much do we owe Globex?", all).kind).toBe("unresolved");
  });

  it("does not match a name against an empty counterparty list", () => {
    expect(resolveCounterparty("how much do we owe CloudOps?", []).kind).toBe("unresolved");
  });
});

/* ── payable by counterparty ─────────────────────────────────────────────── */

describe("payable by counterparty", () => {
  it("totals only that vendor's open payables", async () => {
    install({
      counterparties: [CLOUDOPS, ACME],
      obligationPages: [
        onePage("obligations", [
          ob({ id: "ob_a", amount_due: "1200.00", due_date: "2026-07-01" }),
          ob({ id: "ob_b", amount_due: "800.50", due_date: "2026-09-01" }),
          // Noise that must not be counted:
          ob({ id: "ob_other", counterparty_id: ACME.id, amount_due: "9999.00" }),
          ob({ id: "ob_paid", amount_due: "500.00", status: "paid" }),
          ob({ id: "ob_recv", amount_due: "700.00", type: "receivable" }),
          ob({ id: "ob_payroll", type: "payroll", counterparty_id: null, amount_due: "40000.00" }),
        ]),
      ],
    });

    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("USD 2,000.50");
    expect(out?.reply).toContain("2 outstanding obligations");
    expect(out?.reply).toContain("the earliest due 2026-07-01");
    // Nothing from the noise rows leaked into the figure or the breakdown.
    expect(out?.reply).not.toContain("9,999");
    expect(out?.reply).not.toContain("40,000");
    expect(out?.sources.map((s) => s.entityId)).toEqual(["ob_a", "ob_b"]);
  });

  it("says so plainly when the vendor is known but owed nothing", async () => {
    install({
      counterparties: [CLOUDOPS],
      obligationPages: [onePage("obligations", [ob({ status: "paid" })])],
    });
    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("nothing outstanding");
  });

  it("names the category instead of implying zero when the match is a customer", async () => {
    install({
      counterparties: [ENTERPRISE],
      obligationPages: [onePage("obligations", [])],
    });
    const out = await run("What do we owe Enterprise Holdings?");
    expect(out?.answered).toBe(true);
    /* The bug this pins: a customer carrying a large unpaid invoice was told
       "nothing outstanding", which reads as reassurance about the exact
       relationship the user asked about. The payables sweep genuinely finds
       nothing — the fault is presenting a category error as a settled account. */
    expect(out?.reply).not.toContain("nothing outstanding");
    expect(out?.reply).toContain("customer");
    expect(out?.reply).toContain("Receivables");
    /* This path never reads the invoice feed, so it must not quote or imply a figure. */
    expect(out?.reply).not.toMatch(/\d[\d,]*\.\d{2}/);
  });

  it("scopes the answer to payables when the counterparty type is unknown", async () => {
    install({
      counterparties: [{ id: "cp_x", name: "Mystery Co" }],
      obligationPages: [onePage("obligations", [])],
    });
    const out = await run("how much do we owe Mystery Co?");
    /* An absent type is an unknown side of the ledger, NOT evidence of a vendor.
       Falling back to the vendor sentence would reproduce the original bug for every
       customer whose payload omits a type: "nothing outstanding" is a claim about the
       relationship, and this path only ever read payables. The genuinely weaker claim
       is the one scoped to what was computed. */
    expect(out?.reply).not.toContain("nothing outstanding");
    expect(out?.reply).toContain("no unpaid payable obligations");
    expect(out?.reply).not.toContain("is recorded as a customer");
    /* No receivables steer for a party that may have no receivable meaning at all. */
    expect(out?.reply).not.toContain("Receivables");
  });

  it("keeps the relationship-level wording for a counterparty known to be a vendor", async () => {
    install({
      counterparties: [{ id: "cp_v", name: "Known Vendor Co", type: "vendor" }],
      obligationPages: [onePage("obligations", [])],
    });
    const out = await run("how much do we owe Known Vendor Co?");
    /* Confirmed to be somebody we pay, so a payables sweep does cover the whole
       relationship and is allowed to say so. */
    expect(out?.reply).toContain("nothing outstanding");
  });

  it("refuses rather than quoting a partial total when the read is truncated", async () => {
    install({
      counterparties: [CLOUDOPS],
      obligationPages: stuckPages("obligations", [ob({ amount_due: "1200.00" })]),
    });
    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).toContain("only able to read part of the ledger");
    // The critical assertion: no figure at all, not even the partial one it saw.
    expect(out?.reply).not.toMatch(/\d[\d,]*\.\d{2}/);
  });

  it("refuses when the ledger is unreachable instead of implying nothing is owed", async () => {
    install({ counterparties: [CLOUDOPS], failOn: ["/ledger/obligations"] });
    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).toContain("couldn't reach the ledger");
    expect(out?.reply).not.toContain("nothing");
  });

  it("names an unknown vendor instead of widening to every vendor", async () => {
    install({ counterparties: [CLOUDOPS], obligationPages: [onePage("obligations", [ob({})])] });
    const out = await run("how much do we owe Globex?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).toContain("Globex");
    expect(out?.reply).not.toMatch(/\d[\d,]*\.\d{2}/);
  });

  it("asks which one rather than guessing between two matches", async () => {
    install({
      counterparties: [CLOUDOPS, ACME],
      obligationPages: [onePage("obligations", [ob({})])],
    });
    const out = await run("do we owe CloudOps or Acme Industrial?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).toContain("CloudOps");
    expect(out?.reply).toContain("Acme Industrial");
  });

  it("falls through (null) on a general owe-question so the normal assistant handles it", async () => {
    install({ counterparties: [CLOUDOPS] });
    expect(await run("how much do we owe in total?")).toBeNull();
  });

  it("falls through on a category question rather than refusing it as a missing vendor", async () => {
    install({ counterparties: [CLOUDOPS] });
    expect(await run("do we owe taxes?")).toBeNull();
  });
});

/* ── payroll ─────────────────────────────────────────────────────────────── */

describe("payroll obligations", () => {
  it("sums only payroll-kind rows, not bills or tax", async () => {
    install({
      obligationPages: [
        onePage("obligations", [
          ob({ id: "p1", type: "payroll", counterparty_id: null, amount_due: "40000.00", due_date: "2026-08-15" }),
          ob({ id: "p2", type: "payroll", counterparty_id: null, amount_due: "27128.76", due_date: "2026-08-31" }),
          ob({ id: "b1", type: "bill", amount_due: "211200.00" }),
          ob({ id: "t1", type: "tax", counterparty_id: null, amount_due: "8895.00" }),
          ob({ id: "p_paid", type: "payroll", counterparty_id: null, amount_due: "5000.00", status: "paid" }),
        ]),
      ],
    });

    const out = await run("what is our total payroll obligation?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("USD 67,128.76");
    expect(out?.reply).toContain("2 records");
    expect(out?.reply).not.toContain("211,200");
    expect(out?.reply).not.toContain("8,895");
  });

  it("does not treat a direction word on `type` as a payroll kind", async () => {
    // brain-core sends the payable/receivable flag on `type` for some rows. If the
    // normalizer let that become a `kind`, this bill would be invisible here but a
    // row typed "payable" could later be miscounted as a kind. Pin the split.
    install({
      obligationPages: [
        onePage("obligations", [ob({ id: "x", type: "payable", amount_due: "1000.00" })]),
      ],
    });
    const out = await run("what is our total payroll obligation?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("no outstanding payroll");
  });

  it("refuses on a truncated read", async () => {
    install({
      obligationPages: stuckPages("obligations", [
        ob({ type: "payroll", counterparty_id: null, amount_due: "40000.00" }),
      ]),
    });
    const out = await run("what is our total payroll obligation?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).not.toMatch(/\d[\d,]*\.\d{2}/);
  });
});

/* ── overdue AR ──────────────────────────────────────────────────────────── */

describe("overdue customer invoices", () => {
  it("lists only unpaid AR invoices already past due", async () => {
    install({
      invoicePages: [
        onePage("invoices", [
          inv({ id: "i_od", invoice_number: "INV-1", amount_due: "5000.00", due_date: "2026-06-01" }),
          inv({ id: "i_od2", invoice_number: "INV-2", amount_due: "2000.00", amount_paid: "500.00", due_date: "2026-07-15" }),
          // Noise:
          inv({ id: "i_future", invoice_number: "INV-3", due_date: "2026-12-01" }),
          inv({ id: "i_paid", invoice_number: "INV-4", due_date: "2026-01-01", status: "paid" }),
          inv({ id: "i_ap", invoice_number: "INV-5", due_date: "2026-01-01", metadata: { scenario: "ap" } }),
          inv({ id: "i_nometa", invoice_number: "INV-6", due_date: "2026-01-01", metadata: null }),
        ]),
      ],
    });

    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(true);
    // 5000 + (2000 - 500) = 6500
    expect(out?.reply).toContain("USD 6,500.00");
    expect(out?.reply).toContain("2 customer invoices are overdue");
    expect(out?.reply).toContain("INV-1");
    expect(out?.reply).toContain("INV-2");
    for (const excluded of ["INV-3", "INV-4", "INV-5", "INV-6"]) {
      expect(out?.reply).not.toContain(excluded);
    }
  });

  it("states the date it judged against when nothing is overdue", async () => {
    install({ invoicePages: [onePage("invoices", [inv({ due_date: "2026-12-01" })])] });
    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("No customer invoices are overdue as of 2026-08-05");
  });

  it("refuses a short list rather than letting it read as good news", async () => {
    install({
      invoicePages: stuckPages("invoices", [inv({ due_date: "2026-01-01" })]),
    });
    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).toContain("would look like good news");
  });

  it("treats a response with no invoices array as a failure, not an empty ledger", async () => {
    install({ invoicePages: [{ unexpected: true, next_cursor: null }] });
    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).not.toContain("No customer invoices are overdue");
  });
});

/* ── proving a read was whole ────────────────────────────────────────────── */

describe("completeness of a read that declares no cursor", () => {
  /* brain-core's invoice endpoint returns no `next_cursor` at all and is known to cap
     silently at 20 rows with HTTP 200. These pin that silence is never read as proof. */

  it("refuses when an undeclared page comes back at the known cap", async () => {
    const rows = Array.from({ length: 20 }, (_, n) =>
      inv({ id: `i_${n}`, invoice_number: `INV-${n}`, due_date: "2026-01-01" }),
    );
    install({ invoicePages: [undeclaredPage("invoices", rows)] });

    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(false);
    // 20 genuinely-overdue invoices, and it still declines to total them.
    expect(out?.reply).not.toMatch(/\d[\d,]*\.\d{2}/);
  });

  it("accepts an undeclared page too small to have been capped", async () => {
    install({
      invoicePages: [
        undeclaredPage("invoices", [
          inv({ id: "i_a", invoice_number: "INV-A", amount_due: "300.00", due_date: "2026-01-01" }),
        ]),
      ],
    });
    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("USD 300.00");
  });

  it("an explicit next_cursor:null is proof, even on a large page", async () => {
    const rows = Array.from({ length: 25 }, (_, n) =>
      inv({ id: `i_${n}`, invoice_number: `INV-${n}`, amount_due: "100.00", due_date: "2026-01-01" }),
    );
    install({ invoicePages: [onePage("invoices", rows)] });
    const out = await run("which customer invoices are overdue?");
    expect(out?.answered).toBe(true);
    expect(out?.reply).toContain("USD 2,500.00");
  });

  it("an unparseable obligations payload is a failed read, not an empty ledger", async () => {
    install({
      counterparties: [CLOUDOPS],
      obligationPages: [{ unexpected: true, next_cursor: null }],
    });
    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(false);
    // The dangerous rendering would be a calm "you have nothing outstanding".
    expect(out?.reply).not.toContain("nothing outstanding");
  });

  it("an unparseable obligations payload does not read as zero payroll", async () => {
    install({ obligationPages: [{ garbage: true, next_cursor: null }] });
    const out = await run("what is our total payroll obligation?");
    expect(out?.answered).toBe(false);
    expect(out?.reply).not.toContain("no outstanding payroll");
  });
});

/* ── no model in the loop ────────────────────────────────────────────────── */

describe("no model is consulted on a structured path", () => {
  it("answers without contacting wiki/question or Anthropic", async () => {
    install({
      counterparties: [CLOUDOPS],
      obligationPages: [onePage("obligations", [ob({ amount_due: "1200.00" })])],
    });

    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(true);
    expect(out?.engine).toBe("deterministic");

    expect(requested.length).toBeGreaterThan(0); // the assertion below is not vacuous
    expect(requested.some((u) => u.includes("/wiki/question"))).toBe(false);
    expect(requested.some((u) => u.includes("anthropic"))).toBe(false);
  });

  it("does not consult a model even when it refuses", async () => {
    install({ counterparties: [CLOUDOPS], failOn: ["/ledger/obligations"] });
    const out = await run("how much do we owe CloudOps?");
    expect(out?.answered).toBe(false);
    expect(requested.some((u) => u.includes("/wiki/question"))).toBe(false);
    expect(requested.some((u) => u.includes("anthropic"))).toBe(false);
  });

  it("the assistant route runs the structured path before either model path", () => {
    /* A structural guard, not a behavioural one. The ordering is the whole guarantee —
       moving this block below wiki/question would leave every test above green while
       silently handing these questions back to a model — and mounting the full route
       here would cost a session, storage and an Anthropic client for one assertion. */
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "..", "routes.ts"), "utf8");
    const handler = src.slice(src.indexOf('app.post("/api/assistant/chat"'));
    expect(handler).not.toBe("");

    const deterministic = handler.indexOf("answerDeterministically(");
    const wiki = handler.indexOf("askWikiQuestion(");
    const llm = handler.indexOf("anthropic.messages.create(");

    expect(deterministic).toBeGreaterThan(-1);
    expect(wiki).toBeGreaterThan(-1);
    expect(llm).toBeGreaterThan(-1);
    expect(deterministic).toBeLessThan(wiki);
    expect(deterministic).toBeLessThan(llm);
  });
});
