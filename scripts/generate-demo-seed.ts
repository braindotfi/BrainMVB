/**
 * One-off generator for the bundled demo seed documents in server/assets/demo-seed/.
 * Run with: npx tsx scripts/generate-demo-seed.ts
 *
 * These files are ingested ONCE into each newly created durable tenant
 * (server/brain/seed.ts) so a fresh workspace has a realistic June 2026 scenario:
 *   - bank_statement_2026-06.pdf      - operating account statement (PDF)      [bank]
 *   - ar_aging_2026-06-30.xlsx        - accounts-receivable aging (XLSX)       [accounting]
 *   - payroll_register_2026-06.xlsx   - semi-monthly payroll register (XLSX)   [payroll]
 *   - crypto_wallet_2026-06.csv       - treasury wallet export (CSV)           [crypto]
 *   - form_1120_2025.pdf              - FY2025 corporate tax return (PDF)      [tax]
 *
 * RECONCILIATION RULES - every number here must agree with every other number:
 *   - Payroll net total matches the two bank-statement payroll debits (33,564.38 each).
 *   - AR aging lists only OUTSTANDING invoices, so customers who paid appear as bank
 *     inflows and are absent from the aging - and vice versa.
 *   - The crypto wallet is ON-CHAIN ONLY. It has no fiat on/off-ramp, because the bank
 *     statement has no crypto transfer lines. Its customers (Vertex Robotics, Helios
 *     Data Co) settled in USDC, so they are correctly absent from the AR aging.
 *   - The tax return is PRIOR YEAR (FY2025), so it cannot contradict June-2026 activity.
 *     Its recurring expense lines are derived from the bank statement's monthly amounts
 *     (rent x12, insurance x4 quarterly, hosting x12, processing fees x12) so the two
 *     documents tell the same story about the business.
 */
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const OUT = join(process.cwd(), "server", "assets", "demo-seed");
mkdirSync(OUT, { recursive: true });

// ── Bank statement (PDF) ────────────────────────────────────────────────────
const TXNS: Array<[string, string, number]> = [
  ["2026-06-01", "Beginning balance", 0],
  ["2026-06-02", "ACH CREDIT - NORTHWIND TRADERS INV-1042", 18400.0],
  ["2026-06-03", "ACH DEBIT - CLOUDOPS HOSTING JUNE", -2350.0],
  ["2026-06-05", "WIRE CREDIT - ACME ANALYTICS INV-1039", 32750.0],
  ["2026-06-08", "ACH DEBIT - OFFICE LEASE - 400 MARKET ST", -8900.0],
  ["2026-06-10", "ACH DEBIT - STRIPE FEES MAY", -1284.55],
  ["2026-06-12", "ACH CREDIT - GLOBEX CORP INV-1044", 12600.0],
  ["2026-06-15", "PAYROLL - GUSTO NET PAY 06/15", -33564.38],
  ["2026-06-15", "TAX PMT - EFTPS FEDERAL 941", -14833.12],
  ["2026-06-17", "ACH DEBIT - ANTHOS INSURANCE Q3", -4120.0],
  ["2026-06-19", "ACH CREDIT - INITECH LLC INV-1046", 9800.0],
  ["2026-06-23", "ACH DEBIT - DATAWAREHOUSE CO JUNE", -3675.0],
  ["2026-06-25", "ACH CREDIT - UMBRELLA HEALTH INV-1047", 21150.0],
  ["2026-06-30", "PAYROLL - GUSTO NET PAY 06/30", -33564.38],
  ["2026-06-30", "TAX PMT - EFTPS FEDERAL 941", -14833.12],
  ["2026-06-30", "INTEREST CREDIT", 61.87],
];
const OPENING = 187450.23;

async function bankStatement() {
  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const path = join(OUT, "bank_statement_2026-06.pdf");
  const stream = createWriteStream(path);
  doc.pipe(stream);

  doc.fontSize(16).font("Helvetica-Bold").text("First Meridian Bank");
  doc.fontSize(9).font("Helvetica").text("PO Box 4410, Wilmington, DE 19801");
  doc.moveDown();
  doc.fontSize(12).font("Helvetica-Bold").text("Business Checking Statement");
  doc.fontSize(10).font("Helvetica");
  doc.text("Account holder: Brightline Systems Inc.");
  doc.text("Account number: ****7302   |   Statement period: 2026-06-01 to 2026-06-30");
  doc.moveDown();

  let balance = OPENING;
  doc.font("Helvetica-Bold").text(`Opening balance (2026-06-01): $${OPENING.toFixed(2)}`);
  doc.moveDown(0.5);

  const col = { date: 54, desc: 130, amt: 420, bal: 500 };
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Date", col.date, doc.y, { continued: false });
  const headerY = doc.y - 11;
  doc.text("Description", col.desc, headerY);
  doc.text("Amount", col.amt, headerY, { width: 70, align: "right" });
  doc.text("Balance", col.bal, headerY, { width: 60, align: "right" });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9);

  for (const [date, desc, amt] of TXNS) {
    if (desc === "Beginning balance") continue;
    balance += amt;
    const y = doc.y;
    doc.text(date, col.date, y);
    doc.text(desc, col.desc, y, { width: 280 });
    doc.text(amt < 0 ? `-$${Math.abs(amt).toFixed(2)}` : `$${amt.toFixed(2)}`, col.amt, y, { width: 70, align: "right" });
    doc.text(`$${balance.toFixed(2)}`, col.bal, y, { width: 60, align: "right" });
    doc.moveDown(0.2);
  }

  doc.moveDown();
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`Closing balance (2026-06-30): $${balance.toFixed(2)}`, 54);
  doc.end();
  await new Promise((r) => stream.on("finish", r));
  console.log("wrote", path, "closing balance", balance.toFixed(2));
}

// ── AR aging (XLSX) ─────────────────────────────────────────────────────────
async function arAging() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("AR Aging");
  ws.addRow(["Brightline Systems Inc. - Accounts Receivable Aging"]);
  ws.addRow(["As of: 2026-06-30"]);
  ws.addRow([]);
  ws.addRow(["Customer", "Invoice", "Invoice Date", "Due Date", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90", "Total"]);
  const rows: Array<[string, string, string, string, number, number, number, number, number]> = [
    ["Northwind Traders", "INV-1048", "2026-06-20", "2026-07-20", 15200, 0, 0, 0, 0],
    ["Acme Analytics", "INV-1045", "2026-06-05", "2026-07-05", 27300, 0, 0, 0, 0],
    ["Globex Corp", "INV-1041", "2026-05-18", "2026-06-17", 0, 12600, 0, 0, 0],
    ["Initech LLC", "INV-1038", "2026-04-28", "2026-05-28", 0, 0, 9800, 0, 0],
    ["Umbrella Health", "INV-1049", "2026-06-26", "2026-07-26", 21150, 0, 0, 0, 0],
    ["Stark Industries", "INV-1033", "2026-03-30", "2026-04-29", 0, 0, 0, 7450, 0],
    ["Wayne Enterprises", "INV-1027", "2026-02-12", "2026-03-14", 0, 0, 0, 0, 4300],
  ];
  for (const r of rows) {
    const total = r[4] + r[5] + r[6] + r[7] + r[8];
    ws.addRow([...r, total]);
  }
  const totals = rows.reduce(
    (a, r) => [a[0] + r[4], a[1] + r[5], a[2] + r[6], a[3] + r[7], a[4] + r[8]],
    [0, 0, 0, 0, 0],
  );
  ws.addRow(["TOTAL", "", "", "", ...totals, totals.reduce((a, b) => a + b, 0)]);
  const path = join(OUT, "ar_aging_2026-06-30.xlsx");
  await wb.xlsx.writeFile(path);
  console.log("wrote", path);
}

// ── Payroll register (XLSX) ─────────────────────────────────────────────────
async function payrollRegister() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payroll Register");
  ws.addRow(["Brightline Systems Inc. - Payroll Register - June 2026 (semi-monthly)"]);
  ws.addRow([]);
  ws.addRow(["Employee", "Role", "Pay Date", "Gross Pay", "Federal Tax", "State Tax", "FICA", "Net Pay"]);
  const employees: Array<[string, string, number]> = [
    ["Ava Chen", "CEO", 9166.67],
    ["Marcus Webb", "CTO", 8750.0],
    ["Priya Natarajan", "Senior Engineer", 7291.67],
    ["Diego Ramos", "Senior Engineer", 7291.67],
    ["Hannah Lee", "Product Designer", 5833.33],
    ["Tom Okafor", "Account Executive", 5416.67],
    ["Sofia Marino", "Ops Manager", 5000.0],
  ];
  let netTotal = 0;
  for (const payDate of ["2026-06-15", "2026-06-30"]) {
    for (const [name, role, gross] of employees) {
      const fed = +(gross * 0.18).toFixed(2);
      const state = +(gross * 0.055).toFixed(2);
      const fica = +(gross * 0.0765).toFixed(2);
      const net = +(gross - fed - state - fica).toFixed(2);
      netTotal += net;
      ws.addRow([name, role, payDate, gross, fed, state, fica, net]);
    }
  }
  ws.addRow([]);
  ws.addRow(["TOTAL NET (June)", "", "", "", "", "", "", +netTotal.toFixed(2)]);
  const path = join(OUT, "payroll_register_2026-06.xlsx");
  await wb.xlsx.writeFile(path);
  console.log("wrote", path, "net total", netTotal.toFixed(2));
}

// ── Crypto treasury wallet export (CSV) ─────────────────────────────────────
/**
 * ON-CHAIN ONLY on purpose: the June bank statement contains no crypto on/off-ramp
 * line, so this wallet must never show a fiat transfer or the two documents would
 * contradict each other. Its two customers settled their invoices in USDC, which is
 * exactly why they don't appear on the AR aging (that sheet lists only what's still
 * outstanding). ETH is valued at one fixed reference rate for the month so every USD
 * figure in the file is reproducible from its quantity.
 */
const ETH_USD = 3200.0;

async function cryptoWallet() {
  type Row = { date: string; type: string; asset: "USDC" | "ETH"; qty: number; counterparty: string; memo: string; hash: string };
  const opening = { USDC: 45000.0, ETH: 12.5 };
  const rows: Row[] = [
    { date: "2026-06-04", type: "Receive",        asset: "USDC", qty: 18500.0,  counterparty: "Vertex Robotics",  memo: "INV-1043 settled in USDC", hash: "0x7a1c4e02b98d5f3610ac77d2e4b5091f83cc6ad4" },
    { date: "2026-06-11", type: "Network fee",    asset: "ETH",  qty: -0.0142,  counterparty: "",                 memo: "Gas - USDC transfer",       hash: "0x2f9b60d71ee34c8a05f1b7ca9d3820e64af17c55" },
    { date: "2026-06-18", type: "Receive",        asset: "USDC", qty: 9250.0,   counterparty: "Helios Data Co",   memo: "INV-1050 settled in USDC",  hash: "0xc4e83a5719b06d2fa87c1e40db95f37206ae8b13" },
    { date: "2026-06-22", type: "Staking reward", asset: "ETH",  qty: 0.3125,   counterparty: "Lido stETH",       memo: "Validator rewards - June",  hash: "0x91d27fb4630ae85c07f2ab63d418e5920cc7d6fa" },
    { date: "2026-06-26", type: "Send",           asset: "USDC", qty: -6400.0,  counterparty: "Halcyon Security", memo: "Q3 audit retainer",         hash: "0x5b30ce8241f79ad06e3b1c95f7d240a86ef31b70" },
    { date: "2026-06-29", type: "Network fee",    asset: "ETH",  qty: -0.0098,  counterparty: "",                 memo: "Gas - USDC transfer",       hash: "0xe07f92a315c48b6017da39e2fc84b5106d3a92c8" },
  ];

  const usd = (asset: "USDC" | "ETH", qty: number) => (asset === "ETH" ? qty * ETH_USD : qty);
  const lines: string[] = [
    "Brightline Systems Inc. - Treasury Wallet Export",
    "Wallet address,0x8Fd2a41c7B90e5D316aC4f0b27e93Cd5A16b7F42",
    "Network,Ethereum mainnet",
    "Statement period,2026-06-01 to 2026-06-30",
    `ETH/USD reference rate,${ETH_USD.toFixed(2)}`,
    "",
    "Date,Type,Asset,Quantity,USD Value,Counterparty,Memo,Tx Hash,USDC Balance,ETH Balance,Wallet Value USD",
  ];

  let usdc = opening.USDC;
  let eth = opening.ETH;
  const walletValue = () => usdc + eth * ETH_USD;
  lines.push(
    `2026-06-01,Opening balance,,,,,Opening wallet balance,,${usdc.toFixed(2)},${eth.toFixed(4)},${walletValue().toFixed(2)}`,
  );
  for (const r of rows) {
    if (r.asset === "USDC") usdc += r.qty;
    else eth += r.qty;
    const v = usd(r.asset, r.qty);
    lines.push(
      [
        r.date,
        r.type,
        r.asset,
        r.qty.toFixed(r.asset === "ETH" ? 4 : 2),
        v.toFixed(2),
        r.counterparty,
        r.memo,
        r.hash,
        usdc.toFixed(2),
        eth.toFixed(4),
        walletValue().toFixed(2),
      ].join(","),
    );
  }
  lines.push(
    `2026-06-30,Closing balance,,,,,Closing wallet balance,,${usdc.toFixed(2)},${eth.toFixed(4)},${walletValue().toFixed(2)}`,
  );

  const path = join(OUT, "crypto_wallet_2026-06.csv");
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
  console.log("wrote", path, "closing wallet value", walletValue().toFixed(2));
}

// ── Corporate tax return (PDF) ──────────────────────────────────────────────
/**
 * FY2025 Form 1120. Prior year on purpose - a 2026 return would have to invent
 * estimated-payment debits that the June bank statement doesn't contain. The
 * recurring deduction lines are derived from the bank statement's own monthly
 * amounts, so the tax return and the operating account describe the same business.
 */
async function taxReturn() {
  const monthly = { rent: 8900.0, hosting: 2350.0, dataWarehouse: 3675.0, processing: 1284.55 };
  const quarterlyInsurance = 4120.0;

  const grossReceipts = 1520000.0;
  const cogs = 236800.0;
  const grossProfit = grossReceipts - cogs;

  const deductions: Array<[string, number, string]> = [
    ["Compensation of officers", 205000.0, ""],
    ["Salaries and wages (less officers)", 690000.0, ""],
    ["Rents", monthly.rent * 12, "8,900.00/mo - 400 Market St"],
    ["Taxes and licenses", 74900.0, "employer payroll taxes, FUTA/SUTA"],
    ["Insurance", quarterlyInsurance * 4, "4,120.00/qtr - Anthos Insurance"],
    ["Software and hosting", (monthly.hosting + monthly.dataWarehouse) * 12, "CloudOps + DataWarehouse Co"],
    ["Payment processing fees", monthly.processing * 12, "1,284.55/mo - Stripe"],
    ["Depreciation", 18750.0, ""],
    ["Other deductions", 41200.0, ""],
  ];
  const totalDeductions = deductions.reduce((a, [, v]) => a + v, 0);
  const taxableIncome = grossProfit - totalDeductions;
  const tax = +(taxableIncome * 0.21).toFixed(2);
  const estimatedPayments = 9200.0;
  const overpayment = +(estimatedPayments - tax).toFixed(2);

  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const path = join(OUT, "form_1120_2025.pdf");
  const stream = createWriteStream(path);
  doc.pipe(stream);

  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  doc.text("Taxpayer: Brightline Systems Inc.");
  doc.text("EIN: 87-4193056   |   Tax year: 2025-01-01 to 2025-12-31   |   Filed: 2026-03-12");
  doc.moveDown();

  doc.fontSize(11).font("Helvetica-Bold").text("Income");
  doc.moveDown(0.3);
  line("1a  Gross receipts or sales", grossReceipts);
  line("2   Cost of goods sold", cogs);
  line("3   Gross profit", grossProfit, "", true);
  doc.moveDown(0.6);

  doc.fontSize(11).font("Helvetica-Bold").text("Deductions");
  doc.moveDown(0.3);
  for (const [label, value, note] of deductions) line(label, value, note);
  line("Total deductions", totalDeductions, "", true);
  doc.moveDown(0.6);

  doc.fontSize(11).font("Helvetica-Bold").text("Tax and payments");
  doc.moveDown(0.3);
  line("Taxable income", taxableIncome, "", true);
  line("Total tax (21%)", tax);
  line("2025 estimated tax payments", estimatedPayments);
  line("Overpayment credited to 2026", overpayment, "", true);

  doc.moveDown();
  doc.font("Helvetica").fontSize(8).fillColor("#555555");
  doc.text(
    "Recurring deduction lines are stated at the same monthly amounts that appear on the operating account statement.",
    54,
    doc.y,
    { width: 504 },
  );
  doc.end();
  await new Promise((r) => stream.on("finish", r));
  console.log("wrote", path, "taxable income", taxableIncome.toFixed(2), "tax", tax.toFixed(2));
}

await bankStatement();
await arAging();
await payrollRegister();
await cryptoWallet();
await taxReturn();
