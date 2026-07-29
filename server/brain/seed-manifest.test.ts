import { describe, it, expect, beforeEach } from "vitest";
import {
  SEED_MANIFEST,
  renderSeedDocuments,
  filenameFor,
  getSeedDocuments,
  resetSeedDocumentCache,
} from "./demo-seed/documents";
import { buildScenario, bucketFor, daysBetween, PERIOD_DAYS, type SeedScenario } from "./demo-seed/scenario";
import { CATEGORY_ORDER } from "@/lib/sourceCategories";

/**
 * Two classes of invariant live here.
 *
 * 1. MANIFEST: document categories are chosen server-side in exactly one place, and the
 *    Add Source badges group real documents by that field. When the two vocabularies
 *    drift, seeded documents silently stop showing up under their category.
 *
 * 2. DATE RELATIVITY: the seed used to be static files pinned to June 2026, which slid
 *    out of the trailing windows the UI queries as wall-clock time passed (by 2026-07-28
 *    a 30-day window caught 3 of 15 transactions; days later it would have caught none).
 *    The tests below pin the property that actually prevents that regression - the whole
 *    dataset sits inside a trailing 30-day window from the seeding date - rather than
 *    pinning bytes, which are not reproducible for generated PDF/XLSX.
 */

/** Far apart, and deliberately including month ends, leap day and year boundaries. */
const SEED_DATES = [
  "2026-07-28", // the date the static bundle was replaced
  "2026-07-31", // month end - the case that broke calendar-month anchoring
  "2026-08-01",
  "2026-12-31",
  "2027-01-01",
  "2028-02-29", // leap day
  "2030-06-15",
];

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("demo seed manifest", () => {
  it("uses only categories the Add Source picker knows", () => {
    for (const f of SEED_MANIFEST) {
      expect(CATEGORY_ORDER, `${f.key} has an unknown category "${f.category}"`).toContain(f.category);
    }
  });

  it("only uses source types brain-core recognises", () => {
    for (const f of SEED_MANIFEST) {
      expect(["pdf_upload", "csv_upload"]).toContain(f.sourceType);
    }
  });

  it("covers more than one source category so the demo has a broad footprint", () => {
    const categories = new Set(SEED_MANIFEST.map((f) => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  it("renders non-empty bytes for every manifest entry", async () => {
    const docs = await renderSeedDocuments(buildScenario(at("2026-07-28")));
    expect(docs.length).toBe(SEED_MANIFEST.length);
    for (const d of docs) {
      expect(d.bytes.length, `${d.filename} rendered empty`).toBeGreaterThan(0);
    }
  });

  it("keeps the filename prefixes stable so an upstream parser match cannot drift", () => {
    const names = SEED_MANIFEST.map((e) => filenameFor(e.key, buildScenario(at("2030-06-15"))));
    expect(names.some((n) => n.startsWith("ar_aging_"))).toBe(true);
    expect(names.some((n) => n.startsWith("payroll_register_"))).toBe(true);
    expect(names.some((n) => n.startsWith("crypto_wallet_"))).toBe(true);
    expect(names.some((n) => n.startsWith("form_1120_"))).toBe(true);
  });
});

describe("seed document cache", () => {
  beforeEach(() => resetSeedDocumentCache());

  it("renders once for concurrent callers on the same day", async () => {
    let renders = 0;
    const counting = (s: SeedScenario) => {
      renders++;
      return renderSeedDocuments(s);
    };
    const [a, b] = await Promise.all([
      getSeedDocuments(at("2026-08-01"), counting),
      getSeedDocuments(at("2026-08-01"), counting),
    ]);
    expect(renders).toBe(1);
    expect(a).toBe(b);
  });

  it("re-renders when the date rolls over", async () => {
    const a = await getSeedDocuments(at("2026-08-01"));
    const b = await getSeedDocuments(at("2026-08-02"));
    expect(a).not.toBe(b);
    expect(a[0].filename).not.toBe(b[0].filename);
  });

  it("does not memoise a failed render, so a transient error cannot poison the day", async () => {
    let attempts = 0;
    const failing = async () => {
      attempts++;
      throw new Error("render boom");
    };
    await expect(getSeedDocuments(at("2026-08-03"), failing)).rejects.toThrow("render boom");

    // The retry must actually re-render rather than replay the cached rejection -
    // otherwise one bad render fails every later tenant that day until a restart.
    const recovered = await getSeedDocuments(at("2026-08-03"));
    expect(recovered.length).toBe(SEED_MANIFEST.length);
    expect(attempts).toBe(1);
  });
});

describe("demo seed dates are relative to the seeding date", () => {
  it.each(SEED_DATES)("puts every transaction inside a trailing 30-day window (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    // This is the whole point of the change: cash_flows and friends ask for
    // [now - 30d, now], so nothing in the dataset may fall outside it.
    const windowStart = new Date(at(iso).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    for (const t of s.transactions) {
      expect(t.date >= windowStart, `${t.date} is older than the trailing window ${windowStart}`).toBe(true);
      expect(t.date <= iso, `${t.date} is in the future relative to ${iso}`).toBe(true);
    }
  });

  it.each(SEED_DATES)("spans exactly the statement period (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    expect(s.periodEnd).toBe(iso);
    expect(daysBetween(s.periodStart, s.periodEnd)).toBe(PERIOD_DAYS - 1);
  });

  it("produces a different period for a different seeding date", () => {
    const a = buildScenario(at("2026-07-28"));
    const b = buildScenario(at("2027-03-04"));
    expect(a.periodStart).not.toBe(b.periodStart);
    expect(a.transactions[0].date).not.toBe(b.transactions[0].date);
  });

  it("never files a tax return in the future, including just before the filing deadline", () => {
    for (const iso of [...SEED_DATES, "2027-01-02", "2027-03-14", "2027-03-15"]) {
      const s = buildScenario(at(iso));
      expect(s.tax.filedOn < iso, `FY${s.tax.fiscalYear} filed ${s.tax.filedOn}, after seeding on ${iso}`).toBe(true);
      // The return must also be for a year that is genuinely over.
      expect(s.tax.periodEnd < iso).toBe(true);
    }
  });
});

describe("demo seed documents reconcile with each other", () => {
  it.each(SEED_DATES)("payroll register nets to the bank payroll debits (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    const payrollDebits = s.transactions.filter((t) => t.description.startsWith("PAYROLL - GUSTO"));
    expect(payrollDebits.length).toBe(2);
    for (const d of payrollDebits) {
      expect(Math.abs(d.amount)).toBe(s.payrollNetPerRun);
    }
    // ...and the register's pay dates are the debit dates, not merely equal totals.
    expect(new Set(s.payroll.map((p) => p.payDate))).toEqual(new Set(payrollDebits.map((d) => d.date)));
  });

  it.each(SEED_DATES)("closing balance is opening plus every transaction (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    const net = s.transactions.reduce((a, t) => a + t.amount, 0);
    expect(s.closingBalance).toBeCloseTo(s.openingBalance + net, 2);
    // The per-line running balance must end where the statement says it does.
    expect(s.transactions[s.transactions.length - 1].balance).toBe(s.closingBalance);
  });

  it.each(SEED_DATES)("invoices settled on the bank statement are absent from the AR aging (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    // Per INVOICE, not per customer: a customer may well settle one invoice by bank
    // transfer and still have a later one outstanding (Northwind pays INV-1042 and
    // still owes INV-1048). What must never happen is the SAME invoice appearing as
    // both a settlement and an open receivable.
    const outstanding = new Set(s.invoices.map((i) => i.invoice));
    const settled = s.transactions
      .filter((t) => t.amount > 0)
      .flatMap((t) => t.description.match(/INV-\d+/g) ?? []);
    expect(settled.length, "the statement should show some invoice settlements").toBeGreaterThan(0);
    for (const inv of settled) {
      expect(outstanding.has(inv), `${inv} was paid on the statement but is still in the AR aging`).toBe(false);
    }
  });

  it.each(SEED_DATES)("every AR invoice sits in the bucket its own due date implies (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    for (const inv of s.invoices) {
      expect(inv.daysPastDue).toBe(daysBetween(inv.dueDate, s.periodEnd));
      expect(inv.bucket, `${inv.invoice} due ${inv.dueDate}`).toBe(bucketFor(inv.daysPastDue));
    }
    // The fixture is meant to demo aging, so it must not collapse into one column.
    expect(new Set(s.invoices.map((i) => i.bucket)).size).toBeGreaterThanOrEqual(4);
  });

  it.each(SEED_DATES)("the crypto wallet has no fiat on/off-ramp to contradict the bank (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    for (const r of s.wallet) {
      expect(["Receive", "Send", "Network fee", "Staking reward"]).toContain(r.type);
    }
    // Its two customers settled on-chain, so neither may appear in the AR aging.
    const onChainCustomers = s.wallet.map((r) => r.counterparty).filter(Boolean);
    const arCustomers = new Set(s.invoices.map((i) => i.customer));
    for (const c of onChainCustomers) {
      expect(arCustomers.has(c), `${c} settled on-chain but is also outstanding in AR`).toBe(false);
    }
  });

  it.each(SEED_DATES)("the tax return annualises the statement's own recurring lines (seeded %s)", (iso) => {
    const s = buildScenario(at(iso));
    const monthlyRent = Math.abs(
      s.transactions.find((t) => t.description.includes("OFFICE LEASE"))!.amount,
    );
    const rentDeduction = s.tax.deductions.find(([label]) => label === "Rents")![1];
    expect(rentDeduction).toBeCloseTo(monthlyRent * 12, 2);

    const quarterlyInsurance = Math.abs(
      s.transactions.find((t) => t.description.includes("ANTHOS INSURANCE"))!.amount,
    );
    const insuranceDeduction = s.tax.deductions.find(([label]) => label === "Insurance")![1];
    expect(insuranceDeduction).toBeCloseTo(quarterlyInsurance * 4, 2);
  });
});

describe("the shipped scenario still matches the hand-authored original", () => {
  /**
   * Seeding on 2026-06-30 reproduces the original June-2026 period exactly, which is what
   * makes this a date shift rather than a new dataset. These are the figures verified
   * end-to-end against a live tenant's ledger.
   */
  const s = buildScenario(at("2026-06-30"));

  it("reproduces the original period", () => {
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  it("reproduces the original balances and transaction count", () => {
    expect(s.transactions.length).toBe(15);
    expect(s.openingBalance).toBe(187450.23);
    expect(s.closingBalance).toBe(165087.55);
    const net = +s.transactions.reduce((a, t) => a + t.amount, 0).toFixed(2);
    expect(net).toBe(-22362.68);
  });

  it("reproduces the original payroll and AR totals", () => {
    expect(s.payrollNetPerRun).toBe(33564.38);
    expect(s.invoices.reduce((a, i) => a + i.amount, 0)).toBe(97800);
    expect(s.tax.fiscalYear).toBe(2025);
  });

  it("reproduces the original per-invoice aging buckets", () => {
    expect(s.invoices.map((i) => [i.invoice, i.bucket])).toEqual([
      ["INV-1048", "Current"],
      ["INV-1045", "Current"],
      ["INV-1041", "1-30 Days"],
      ["INV-1038", "31-60 Days"],
      ["INV-1049", "Current"],
      ["INV-1033", "61-90 Days"],
      ["INV-1027", "Over 90"],
    ]);
  });
});
