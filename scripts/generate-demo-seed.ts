/**
 * One-off generator for the bundled demo seed documents in server/assets/demo-seed/.
 * Run with: npx tsx scripts/generate-demo-seed.ts
 *
 * These three files are ingested ONCE into each newly created durable tenant
 * (server/brain/seed.ts) so a fresh workspace has a realistic June 2026 scenario:
 *   - bank_statement_2026-06.pdf      - operating account statement (PDF)
 *   - ar_aging_2026-06-30.xlsx        - accounts-receivable aging (XLSX)
 *   - payroll_register_2026-06.xlsx   - semi-monthly payroll register (XLSX)
 *
 * The numbers are internally consistent (payroll net total matches the two bank
 * statement payroll debits; AR customers appear as statement inflows).
 */
import { mkdirSync, createWriteStream } from "node:fs";
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

await bankStatement();
await arAging();
await payrollRegister();
