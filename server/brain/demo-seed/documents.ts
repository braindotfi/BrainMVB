/**
 * Renders a SeedScenario into the five demo documents, as BYTES.
 *
 * These used to be pre-committed static files under server/assets/demo-seed/. They are
 * now built on demand at seed time so their dates are always relative to when the tenant
 * was created - see the header of ./scenario.ts for why a fixed period cannot work.
 *
 * Nothing here touches the clock or the filesystem: callers pass `now`, and
 * scripts/generate-demo-seed.ts is the only thing that writes the output to disk (for
 * eyeballing the documents locally).
 */

import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import {
  AGING_BUCKETS,
  ETH_USD,
  WALLET_ADDRESS,
  buildScenario,
  toIsoDate,
  type SeedScenario,
} from "./scenario";

/** brain-core's own vocabulary: only these two exist, and "csv_upload" covers XLSX. */
export type SeedSourceType = "pdf_upload" | "csv_upload";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The static half of the manifest - everything that does NOT depend on the seeding date.
 *
 * `category` MUST be a CategoryId the Add Source picker knows
 * ("bank" | "crypto" | "accounting" | "payroll" | "tax" | "payments" | "documents"),
 * because the category badges group real documents by exactly that field. It is a
 * BFF-local label: brain-core only ever receives sourceType + mimeType + source_schema,
 * so there is no upstream category vocabulary to match.
 */
export interface SeedManifestEntry {
  /** Stable identity for a seed document across periods, unlike its dated filename. */
  key: "ar_aging" | "payroll_register" | "crypto_wallet" | "form_1120";
  category: string;
  sourceType: SeedSourceType;
  mimeType: string;
}

export const SEED_MANIFEST: SeedManifestEntry[] = [
  { key: "ar_aging", category: "accounting", sourceType: "csv_upload", mimeType: XLSX_MIME },
  { key: "payroll_register", category: "payroll", sourceType: "csv_upload", mimeType: XLSX_MIME },
  { key: "crypto_wallet", category: "crypto", sourceType: "csv_upload", mimeType: "text/csv" },
  { key: "form_1120", category: "tax", sourceType: "pdf_upload", mimeType: "application/pdf" },
];

export interface SeedDocument extends SeedManifestEntry {
  filename: string;
  bytes: Buffer;
}

/**
 * Filenames keep their original prefixes on purpose - only the date suffix moves. The
 * prefix is the one part of the name that could plausibly matter to an upstream
 * interpreter picking a parser, so it stays stable across periods.
 */
export function filenameFor(key: SeedManifestEntry["key"], s: SeedScenario): string {
  switch (key) {
    case "ar_aging":
      return `ar_aging_${s.periodEnd}.xlsx`;
    case "payroll_register":
      return `payroll_register_${s.periodEnd}.xlsx`;
    case "crypto_wallet":
      return `crypto_wallet_${s.periodEnd}.csv`;
    case "form_1120":
      return `form_1120_${s.tax.fiscalYear}.pdf`;
  }
}

// ── rendering helpers ───────────────────────────────────────────────────────

function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      build(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── AR aging (XLSX) ─────────────────────────────────────────────────────────

async function arAging(s: SeedScenario): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("AR Aging");
  ws.addRow([`${s.company} - Accounts Receivable Aging`]);
  ws.addRow([`As of: ${s.periodEnd}`]);
  ws.addRow([]);
  ws.addRow(["Customer", "Invoice", "Invoice Date", "Due Date", ...AGING_BUCKETS, "Total"]);

  const totals = new Map<string, number>(AGING_BUCKETS.map((b) => [b, 0]));
  for (const inv of s.invoices) {
    // Exactly one aging column is populated, chosen by the invoice's own due date.
    const cells = AGING_BUCKETS.map((b) => (b === inv.bucket ? inv.amount : 0));
    totals.set(inv.bucket, (totals.get(inv.bucket) ?? 0) + inv.amount);
    ws.addRow([inv.customer, inv.invoice, inv.invoiceDate, inv.dueDate, ...cells, inv.amount]);
  }

  const bucketTotals = AGING_BUCKETS.map((b) => totals.get(b) ?? 0);
  ws.addRow(["TOTAL", "", "", "", ...bucketTotals, bucketTotals.reduce((a, b) => a + b, 0)]);
  return workbookToBuffer(wb);
}

// ── payroll register (XLSX) ─────────────────────────────────────────────────

async function payrollRegister(s: SeedScenario): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payroll Register");
  ws.addRow([`${s.company} - Payroll Register - ${s.periodStart} to ${s.periodEnd} (semi-monthly)`]);
  ws.addRow([]);
  ws.addRow(["Employee", "Role", "Pay Date", "Gross Pay", "Federal Tax", "State Tax", "FICA", "Net Pay"]);
  for (const p of s.payroll) {
    ws.addRow([p.name, p.role, p.payDate, p.gross, p.federal, p.state, p.fica, p.net]);
  }
  ws.addRow([]);
  const netTotal = +s.payroll.reduce((a, p) => a + p.net, 0).toFixed(2);
  ws.addRow(["TOTAL NET (period)", "", "", "", "", "", "", netTotal]);
  return workbookToBuffer(wb);
}

// ── crypto treasury wallet export (CSV) ─────────────────────────────────────

function cryptoWallet(s: SeedScenario): Buffer {
  const openingValue = +(s.walletOpening.USDC + s.walletOpening.ETH * ETH_USD).toFixed(2);
  const last = s.wallet[s.wallet.length - 1];

  const lines: string[] = [
    `${s.company} - Treasury Wallet Export`,
    `Wallet address,${WALLET_ADDRESS}`,
    "Network,Ethereum mainnet",
    `Statement period,${s.periodStart} to ${s.periodEnd}`,
    `ETH/USD reference rate,${ETH_USD.toFixed(2)}`,
    "",
    "Date,Type,Asset,Quantity,USD Value,Counterparty,Memo,Tx Hash,USDC Balance,ETH Balance,Wallet Value USD",
    `${s.periodStart},Opening balance,,,,,Opening wallet balance,,${s.walletOpening.USDC.toFixed(2)},${s.walletOpening.ETH.toFixed(4)},${openingValue.toFixed(2)}`,
  ];

  for (const r of s.wallet) {
    lines.push(
      [
        r.date,
        r.type,
        r.asset,
        (r.qty ?? 0).toFixed(r.asset === "ETH" ? 4 : 2),
        (r.usdValue ?? 0).toFixed(2),
        r.counterparty,
        r.memo,
        r.hash,
        r.usdcBalance.toFixed(2),
        r.ethBalance.toFixed(4),
        r.walletValueUsd.toFixed(2),
      ].join(","),
    );
  }

  lines.push(
    `${s.periodEnd},Closing balance,,,,,Closing wallet balance,,${last.usdcBalance.toFixed(2)},${last.ethBalance.toFixed(4)},${last.walletValueUsd.toFixed(2)}`,
  );

  return Buffer.from(lines.join("\n") + "\n", "utf8");
}

// ── corporate tax return (PDF) ──────────────────────────────────────────────

function taxReturn(s: SeedScenario): Promise<Buffer> {
  const t = s.tax;
  return pdfToBuffer((doc) => {
    const line = (label: string, value: number, note = "", bold = false) => {
      const y = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
      doc.text(label, 54, y, { width: 250 });
      if (note) doc.font("Helvetica").fontSize(8).fillColor("#555555").text(note, 310, y + 1, { width: 150 });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor("#000000");
      doc.text(money(value), 466, y, { width: 92, align: "right" });
      doc.moveDown(0.35);
    };

    doc.fontSize(16).font("Helvetica-Bold").text("Form 1120");
    doc.fontSize(10).font("Helvetica").text("U.S. Corporation Income Tax Return");
    doc.moveDown(0.4);
    doc.fontSize(10);
    doc.text(`Taxpayer: ${s.company}`);
    doc.text(`EIN: 87-4193056   |   Tax year: ${t.periodStart} to ${t.periodEnd}   |   Filed: ${t.filedOn}`);
    doc.moveDown();

    doc.fontSize(11).font("Helvetica-Bold").text("Income");
    doc.moveDown(0.3);
    line("1a  Gross receipts or sales", t.grossReceipts);
    line("2   Cost of goods sold", t.cogs);
    line("3   Gross profit", t.grossProfit, "", true);
    doc.moveDown(0.6);

    doc.fontSize(11).font("Helvetica-Bold").text("Deductions");
    doc.moveDown(0.3);
    for (const [label, value, note] of t.deductions) line(label, value, note);
    line("Total deductions", t.totalDeductions, "", true);
    doc.moveDown(0.6);

    doc.fontSize(11).font("Helvetica-Bold").text("Tax and payments");
    doc.moveDown(0.3);
    line("Taxable income", t.taxableIncome, "", true);
    line("Total tax (21%)", t.tax);
    line(`${t.fiscalYear} estimated tax payments`, t.estimatedPayments);
    line(`Overpayment credited to ${t.fiscalYear + 1}`, t.overpayment, "", true);

    doc.moveDown();
    doc.font("Helvetica").fontSize(8).fillColor("#555555");
    doc.text(
      "Recurring deduction lines are stated at the same monthly amounts that appear on the operating account statement.",
      54,
      doc.y,
      { width: 504 },
    );
  });
}

// ── public API ──────────────────────────────────────────────────────────────

/** Render all four documents for a scenario, in manifest order. */
export async function renderSeedDocuments(s: SeedScenario): Promise<SeedDocument[]> {
  const bytesByKey: Record<SeedManifestEntry["key"], Buffer> = {
    ar_aging: await arAging(s),
    payroll_register: await payrollRegister(s),
    crypto_wallet: cryptoWallet(s),
    form_1120: await taxReturn(s),
  };
  return SEED_MANIFEST.map((entry) => ({
    ...entry,
    filename: filenameFor(entry.key, s),
    bytes: bytesByKey[entry.key],
  }));
}

/**
 * Memoised by period end, so a burst of signups on the same day renders once rather than
 * five PDFs/workbooks per tenant. Only the newest day is retained - the cache exists to
 * collapse same-day work, not to accumulate history.
 *
 * A FAILED render is never retained. Caching the rejected promise would turn one
 * transient render error into a poisoned cache that fails every later seed that day
 * until the process restarts or the date rolls over - a worse failure mode than the
 * disk read this replaced, which could at least be retried.
 */
type CacheEntry = { periodEnd: string; docs: Promise<SeedDocument[]> };
let cache: CacheEntry | null = null;

/** `render` is injectable so the cache's failure behaviour can be tested directly. */
export function getSeedDocuments(
  now: Date,
  render: (s: SeedScenario) => Promise<SeedDocument[]> = renderSeedDocuments,
): Promise<SeedDocument[]> {
  const periodEnd = toIsoDate(now);
  if (cache?.periodEnd !== periodEnd) {
    const entry: CacheEntry = { periodEnd, docs: render(buildScenario(now)) };
    // Evict on failure. Attached before the entry is published so it always runs ahead
    // of a caller's own rejection handler; callers still see the original rejection.
    entry.docs.catch(() => {
      if (cache === entry) cache = null;
    });
    cache = entry;
  }
  return cache.docs;
}

/** Test hook: drops the memo so a test can render a different date in the same process. */
export function resetSeedDocumentCache(): void {
  cache = null;
}
