import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import ExcelJS from "exceljs";

/**
 * Seed/fixture drift guard.
 *
 * The bank statement we seed is brain-core's committed interpreter fixture
 * (services/raw/src/interpreters/__fixtures__/bank_statement_2026-06.pdf), vendored
 * byte-for-byte. It was once replaced by a locally generated statement describing a
 * different company, and every durable tenant silently got the wrong document until
 * the transaction counts were compared by hand. The exact-hash assertion below is what
 * makes that impossible to repeat.
 *
 * The other four documents are GENERATED (scripts/generate-demo-seed.ts) and are not
 * byte-reproducible - PDFKit writes a random /ID and ExcelJS stamps zip entries with
 * wall-clock time - so hashing them would only produce a manifest nobody can keep
 * green. They are guarded on the thing that actually matters instead: whether they
 * still reconcile against the bank statement. The Form 1120 is not re-parsed here;
 * its figures are asserted inside the generator at write time.
 */

const SEED_DIR = join(process.cwd(), "server", "assets", "demo-seed");
const read = (f: string) => readFileSync(join(SEED_DIR, f));
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Facts stated on the face of the vendored bank statement. */
const BANK = {
  sha256: "2233136fa9cab039a69733401ec8a7e70b9d64754045886d456509966900af97",
  company: "Northlight Manufacturing Inc.",
  txCount: 19,
  payrollNetPerRun: 29612.42,
  payrollTaxPerRun: 14902.36,
  /** Invoices the statement shows as SETTLED in June - they must not sit on the aging. */
  settledInvoices: ["NL-2431"],
  /** Explicitly a PARTIAL payment, so its remainder must still be on the aging. */
  partial: { invoice: "NL-2417", paid: 25000.0, total: 61500.0 },
};

describe("bank statement is brain-core's fixture", () => {
  it("matches the committed fixture hash exactly", () => {
    expect(
      sha256(read("bank_statement_2026-06.pdf")),
      "bank_statement_2026-06.pdf no longer matches brain-core's interpreter fixture. " +
        "Do not regenerate or re-encode it - restore the fixture from " +
        "services/raw/src/interpreters/__fixtures__/bank_statement_2026-06.pdf.",
    ).toBe(BANK.sha256);
  });

  it("is a PDF and not an accidentally truncated copy", () => {
    const bytes = read("bank_statement_2026-06.pdf");
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
  });
});

describe("payroll register reconciles to the statement's PAYCORE debits", () => {
  let rows: any[][];
  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(SEED_DIR, "payroll_register_2026-06.xlsx"));
    rows = [];
    wb.worksheets[0].eachRow((r) => rows.push((r.values as any[]).slice(1)));
  });

  const num = (v: any) => (typeof v === "number" ? v : Number(v));

  it("nets to the PAYROLL NET RUN debit on both runs", () => {
    const totals = rows.filter((r) => String(r[3] ?? "").endsWith("TOTAL"));
    expect(totals, "expected one TOTAL row per pay run").toHaveLength(2);
    for (const t of totals) {
      expect(num(t[8]), `run ${t[3]} net pay`).toBeCloseTo(BANK.payrollNetPerRun, 2);
    }
  });

  it("per-employee net always equals gross less the three withholdings", () => {
    // Detail rows carry a bare run id ("2026-06A"); TOTAL and the reconciliation
    // block below the register do not.
    const detail = rows.filter((r) => /^2026-06[AB]$/.test(String(r[3] ?? "")));
    expect(detail.length).toBeGreaterThan(0);
    for (const r of detail) {
      expect(num(r[8]), `${r[0]} net`).toBeCloseTo(num(r[4]) - num(r[5]) - num(r[6]) - num(r[7]), 2);
    }
  });

  it("remits exactly the TAX REMITTANCE debit: fed + employee FICA + employer FICA + state", () => {
    const find = (label: string) => {
      const row = rows.find((r) => String(r[0] ?? "").startsWith(label));
      expect(row, `missing reconciliation row "${label}"`).toBeTruthy();
      return num(row![4]);
    };
    const sum =
      find("Federal income tax withheld") +
      find("FICA - employee") +
      find("FICA - employer") +
      find("Delaware income tax withheld") +
      find("FUTA / SUTA");
    expect(sum).toBeCloseTo(BANK.payrollTaxPerRun, 2);
    expect(find("TOTAL REMITTED PER RUN")).toBeCloseTo(BANK.payrollTaxPerRun, 2);
  });
});

describe("AR aging reconciles to the statement's June collections", () => {
  let rows: any[][];
  const AS_OF = Date.UTC(2026, 5, 30);
  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(SEED_DIR, "ar_aging_2026-06-30.xlsx"));
    const all: any[][] = [];
    wb.worksheets[0].eachRow((r) => all.push((r.values as any[]).slice(1)));
    // Detail rows carry an NL- invoice number; the header and TOTAL row do not.
    rows = all.filter((r) => /^NL-\d+$/.test(String(r[1] ?? "")));
  });

  it("has detail rows", () => expect(rows.length).toBeGreaterThan(0));

  it("omits invoices the bank statement shows as settled", () => {
    for (const inv of BANK.settledInvoices) {
      expect(rows.map((r) => String(r[1])), `${inv} was paid in June and must not be outstanding`).not.toContain(inv);
    }
  });

  it("keeps the unpaid remainder of the partially-paid invoice", () => {
    const row = rows.find((r) => String(r[1]) === BANK.partial.invoice);
    expect(row, `${BANK.partial.invoice} was only partly paid and must still be on the aging`).toBeTruthy();
    expect(Number(row![9])).toBeCloseTo(BANK.partial.total - BANK.partial.paid, 2);
    expect(String(row![10]), "the partial payment should be explained in the notes").toMatch(/partial payment/i);
  });

  it("puts every invoice in the bucket its due date implies", () => {
    const BUCKETS = [4, 5, 6, 7, 8]; // Current, 1-30, 31-60, 61-90, Over 90
    for (const r of rows) {
      const due = Date.parse(String(r[3]) + "T00:00:00Z");
      const daysLate = Math.round((AS_OF - due) / 86400000);
      const expected = daysLate <= 0 ? 0 : daysLate <= 30 ? 1 : daysLate <= 60 ? 2 : daysLate <= 90 ? 3 : 4;
      const filled = BUCKETS.map((c, i) => [i, Number(r[c] ?? 0)]).filter(([, v]) => v > 0);
      expect(filled, `${r[1]} should sit in exactly one aging bucket`).toHaveLength(1);
      expect(filled[0][0], `${r[1]} is ${daysLate} days past due (${r[3]}) and is in the wrong bucket`).toBe(expected);
    }
  });

  it("foots: each row's total equals its buckets", () => {
    for (const r of rows) {
      const buckets = [4, 5, 6, 7, 8].reduce((a, c) => a + Number(r[c] ?? 0), 0);
      expect(Number(r[9]), `${r[1]} total`).toBeCloseTo(buckets, 2);
    }
  });
});

describe("Form 1120 still foots and still derives from the statement", () => {
  /**
   * No PDF text extractor is available (pdfkit only writes), so the generator mirrors the
   * printed figures into the PDF's /Keywords info string. Reading it here checks the
   * COMMITTED bytes - substituting a different 1120 changes these numbers - rather than
   * trusting a sidecar that would drift in lockstep with the document it describes.
   */
  const facts = (() => {
    const bytes = read("form_1120_2025.pdf").toString("latin1");
    const ref = /\/Keywords (\d+) 0 R/.exec(bytes);
    expect(ref, "form_1120_2025.pdf has no /Keywords reconciliation metadata - regenerate it").toBeTruthy();
    const obj = new RegExp(`\\n${ref![1]} 0 obj\\s*\\(([^)]*)\\)`).exec(bytes);
    expect(obj, "could not read the /Keywords object").toBeTruthy();
    return Object.fromEntries(obj![1].split(";").map((p) => { const [k, v] = p.split("="); return [k, Number(v)]; }));
  })();

  it("exposes every figure the guard needs", () => {
    for (const k of ["gross_receipts", "cogs", "total_deductions", "taxable_income", "total_tax"]) {
      expect(Number.isFinite(facts[k]), `missing or non-numeric ${k}`).toBe(true);
    }
  });

  it("foots: receipts less COGS less deductions equals taxable income", () => {
    expect(facts.gross_receipts - facts.cogs - facts.total_deductions).toBe(facts.taxable_income);
  });

  it("applies the 21% corporate rate", () => {
    expect(facts.total_tax).toBe(Math.round(facts.taxable_income * 0.21));
  });

  it("stays profitable, so the return is a plausible filing", () => {
    expect(facts.taxable_income).toBeGreaterThan(0);
  });

  it("is the Northlight return, not some other company's", () => {
    // Pinned so replacing the 1120 with an unrelated document fails loudly.
    expect(facts.gross_receipts).toBe(2280000);
    expect(facts.taxable_income).toBe(103736);
  });
});

describe("crypto wallet stays on-chain only", () => {
  const csv = read("crypto_wallet_2026-06.csv").toString("utf8");
  const lines = csv.trim().split("\n");
  const header = lines.findIndex((l) => l.startsWith("Date,Type,Asset"));
  const body = lines.slice(header + 1).map((l) => l.split(","));

  it("names the same company as the bank statement", () => {
    expect(lines[0]).toContain(BANK.company);
  });

  it("has no fiat on/off-ramp, because the bank statement has no crypto transfer line", () => {
    for (const row of body) {
      const text = row.join(" ").toLowerCase();
      for (const term of ["wire", "ach", "bank transfer", "deposit from", "withdraw to", "off-ramp", "on-ramp"]) {
        expect(text, `"${term}" implies a fiat ramp that the bank statement does not corroborate`).not.toContain(term);
      }
    }
  });

  it("settles its customers on-chain, so they are absent from the AR aging", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(SEED_DIR, "ar_aging_2026-06-30.xlsx"));
    const customers = new Set<string>();
    wb.worksheets[0].eachRow((r) => {
      const v = (r.values as any[]).slice(1);
      if (/^NL-\d+$/.test(String(v[1] ?? ""))) customers.add(String(v[0]));
    });
    const receipts = body.filter((r) => r[1] === "Receive" && r[5]);
    expect(receipts.length).toBeGreaterThan(0);
    for (const r of receipts) {
      expect(customers, `${r[5]} settled in USDC and must not also be an open receivable`).not.toContain(r[5]);
    }
  });
});
