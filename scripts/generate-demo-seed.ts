/**
 * Generator for the bundled demo seed documents in server/assets/demo-seed/.
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
 * THE BANK STATEMENT IS NOT GENERATED HERE. It is brain-core's committed interpreter
 * fixture (services/raw/src/interpreters/__fixtures__/bank_statement_2026-06.pdf),
 * vendored byte-for-byte so the document we seed is the exact artifact their
 * interpreter is verified against. This script only VERIFIES its hash and derives
 * the other four documents from it. Never regenerate or re-encode that PDF - a new
 * hash means demo tenants stop matching brain-core's verified fixture.
 *
 * RECONCILIATION RULES - every number here must agree with the bank statement:
 *   - Payroll net per run matches the two PAYCORE PAYROLL debits (29,612.42 each) and
 *     the register's tax total matches the two PAYCORE TAX REMITTANCE debits
 *     (14,902.36 each). Both are asserted at generation time, not just intended.
 *   - AR aging lists only OUTSTANDING invoices, so customers who paid in June appear
 *     as bank inflows and are absent - except Helios Retail Group, whose June payment
 *     was explicitly a PARTIAL payment, so its remainder is still on the aging.
 *   - The crypto wallet is ON-CHAIN ONLY. It has no fiat on/off-ramp, because the bank
 *     statement has no crypto transfer lines. Its customers settled in USDC, so they
 *     are correctly absent from the AR aging.
 *   - The tax return is PRIOR YEAR (FY2025), so it cannot contradict June-2026 activity.
 *     Its recurring expense lines are derived from the bank statement's own monthly
 *     amounts, so the two documents describe the same business.
 *
 * The four GENERATED files are deliberately not byte-reproducible, and the drift guard
 * does not pretend otherwise: PDFKit stamps every document with a random /ID and ExcelJS
 * writes wall-clock timestamps into the zip entries, so regenerating an unchanged
 * document still yields a new hash. Creation dates are pinned to EPOCH below to remove
 * the drift we CAN remove, and server/brain/seed-assets.test.ts guards these four on
 * their reconciliation content instead of their bytes. Only the vendored bank statement
 * is pinned by exact SHA-256 - it is never regenerated, so its hash is stable and is the
 * one that actually has to match brain-core.
 */
import { mkdirSync, createWriteStream, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const OUT = join(process.cwd(), "server", "assets", "demo-seed");
mkdirSync(OUT, { recursive: true });

/** Fixed timestamp for every generated document. This removes the timestamp drift we can
 *  remove; it does NOT make output byte-reproducible (see the file header). */
const EPOCH = new Date(Date.UTC(2026, 5, 30, 0, 0, 0));

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function assertEq(actual: number, expected: number, what: string) {
  if (r2(actual) !== r2(expected)) {
    throw new Error(`${what}: generated ${r2(actual).toFixed(2)} but the bank statement says ${expected.toFixed(2)}`);
  }
}

// ── The anchor: brain-core's committed bank-statement fixture ───────────────
/**
 * Facts transcribed from the vendored fixture. Everything else in this file is
 * derived from these, so if the fixture is ever replaced these are the only
 * numbers that need re-reading.
 */
const BANK = {
  sha256: "2233136fa9cab039a69733401ec8a7e70b9d64754045886d456509966900af97",
  company: "Northlight Manufacturing Inc.",
  address: "2200 Foundry Road, Suite 400, Newark, DE 19713",
  bank: "First Commerce Bank, N.A.",
  account: "****4821",
  period: "2026-06-01 to 2026-06-30",
  opening: 412806.22,
  closing: 398220.2,
  credits: 150705.99,
  debits: 165292.01,
  txCount: 19,
  // Recurring monthly/quarterly amounts the other documents must reuse verbatim.
  monthly: {
    rent: 14500.0, // ACH DEBIT - HARBORVIEW PROPERTIES JUNE RENT
    hosting: 2490.0, // ACH DEBIT - CLOUDSTACK HOSTING SVCS
    utilities: 3214.55, // ACH DEBIT - CITY POWER AND WATER UTILITY
    freight: 9860.0, // ACH DEBIT - MERIDIAN LOGISTICS INC
    processing: 1238.9, // ACH DEBIT - CARDSERV MERCHANT PROCESSING FEES
    serviceFee: 85.0, // MONTHLY SERVICE FEE
  },
  quarterlyInsurance: 4120.0, // ACH DEBIT - GRANITE SHIELD INSURANCE Q3 PREMIUM
  materialsJune: 18450.0 + 22304.0, // VERTEX INDUSTRIAL SUPPLY + APEX COMPONENTS CORP
  payrollNetPerRun: 29612.42, // ACH DEBIT - PAYCORE PAYROLL NET RUN 2026-06A / 06B
  payrollTaxPerRun: 14902.36, // ACH DEBIT - PAYCORE TAX REMITTANCE 2026-06A / 06B
  payDates: ["2026-06-12", "2026-06-26"],
} as const;

function verifyBankStatement() {
  const path = join(OUT, "bank_statement_2026-06.pdf");
  if (!existsSync(path)) {
    throw new Error(
      `missing ${path}\nThe bank statement is brain-core's committed fixture, not a generated file. ` +
        `Copy it from services/raw/src/interpreters/__fixtures__/bank_statement_2026-06.pdf.`,
    );
  }
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== BANK.sha256) {
    throw new Error(
      `bank_statement_2026-06.pdf has drifted from brain-core's fixture\n` +
        `  expected ${BANK.sha256}\n  actual   ${actual}\n` +
        `Restore the fixture; do not re-encode it.`,
    );
  }
  // The fixture states its own control totals - confirm our transcription of them.
  assertEq(BANK.opening + BANK.credits - BANK.debits, BANK.closing, "bank statement closing balance");
  console.log("verified bank_statement_2026-06.pdf against brain-core fixture", BANK.sha256.slice(0, 12));
}

// ── AR aging (XLSX) ─────────────────────────────────────────────────────────
/**
 * Outstanding invoices only, as of 2026-06-30. The June bank inflows tell us who is
 * NOT here: BluePeak settled NL-2431 (18,750.00) and a wire on 06/02, so only their
 * newest invoice is open. Helios Retail Group is the deliberate exception - their
 * 06/15 wire is described on the statement as a PARTIAL payment against NL-2417, so
 * the remaining balance is still receivable and must appear.
 */
const HELIOS_INVOICE_TOTAL = 61500.0;
const HELIOS_PARTIAL_PAID = 25000.0; // INCOMING WIRE - HELIOS RETAIL GROUP PARTIAL PMT INV NL-2417

async function arAging() {
  const wb = new ExcelJS.Workbook();
  wb.creator = BANK.company;
  wb.lastModifiedBy = BANK.company;
  wb.created = EPOCH;
  wb.modified = EPOCH;
  const ws = wb.addWorksheet("AR Aging");
  ws.addRow([`${BANK.company} - Accounts Receivable Aging`]);
  ws.addRow(["As of: 2026-06-30"]);
  ws.addRow([]);
  ws.addRow(["Customer", "Invoice", "Invoice Date", "Due Date", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90", "Total", "Notes"]);

  const heliosOpen = r2(HELIOS_INVOICE_TOTAL - HELIOS_PARTIAL_PAID);
  const rows: Array<[string, string, string, string, number, number, number, number, number, string]> = [
    ["BluePeak Distributors LLC", "NL-2438", "2026-06-26", "2026-07-26", 22400.0, 0, 0, 0, 0, ""],
    ["Northgate Assembly LLC", "NL-2441", "2026-06-30", "2026-07-30", 18600.0, 0, 0, 0, 0, ""],
    ["Helios Retail Group", "NL-2417", "2026-05-12", "2026-06-11", 0, heliosOpen, 0, 0, 0,
      `partial payment ${money(HELIOS_PARTIAL_PAID)} received 2026-06-15 against ${money(HELIOS_INVOICE_TOTAL)}`],
    ["Ironwood Fabrication Co", "NL-2422", "2026-05-28", "2026-06-27", 0, 14780.0, 0, 0, 0, ""],
    ["Cascade Equipment Partners", "NL-2405", "2026-04-20", "2026-05-20", 0, 0, 9340.0, 0, 0, ""],
    ["Sable Ridge Industrial", "NL-2388", "2026-03-15", "2026-04-14", 0, 0, 0, 6120.0, 0, ""],
    ["Fairmont Tool & Die", "NL-2361", "2026-01-30", "2026-03-01", 0, 0, 0, 0, 3875.0, ""],
  ];

  for (const r of rows) {
    const total = r2(r[4] + r[5] + r[6] + r[7] + r[8]);
    ws.addRow([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], total, r[9]]);
  }
  const totals = rows.reduce(
    (a, r) => [a[0] + r[4], a[1] + r[5], a[2] + r[6], a[3] + r[7], a[4] + r[8]],
    [0, 0, 0, 0, 0],
  ).map(r2);
  const grand = r2(totals.reduce((a, b) => a + b, 0));
  ws.addRow(["TOTAL", "", "", "", ...totals, grand, ""]);

  const path = join(OUT, "ar_aging_2026-06-30.xlsx");
  await wb.xlsx.writeFile(path);
  console.log("wrote", path, "total receivable", grand.toFixed(2));
}

// ── Payroll register (XLSX) ─────────────────────────────────────────────────
/**
 * Semi-monthly, paid 06/12 and 06/26 - the two PAYCORE dates on the statement.
 *
 * Two hard constraints, both asserted below:
 *   net per run                                  = 29,612.42  (PAYROLL NET RUN debit)
 *   fedWH + employee FICA + employer FICA + state = 14,902.36  (TAX REMITTANCE debit)
 *
 * FUTA/SUTA is zero by June: the federal 7,000 and Delaware 10,500 wage bases are
 * exhausted for every employee in the first months of the year, which is why the
 * remittance is exactly the four components above and nothing else.
 *
 * Federal withholding is graduated by band; the top earner absorbs the rounding
 * residual so the run total lands on the statement's figure to the cent.
 */
const FICA_RATE = 0.0765;
const STATE_RATE = 0.0507;

const ROSTER: Array<{ name: string; role: string; gross: number; fedRate: number; production: boolean; officer: boolean }> = [
  { name: "Dale Whitaker",   role: "President & CEO",       gross: 7291.67, fedRate: 0.205, production: false, officer: true },
  { name: "Rosa Delgado",    role: "VP Operations",         gross: 5416.67, fedRate: 0.19,  production: false, officer: true },
  { name: "Ken Ishikawa",    role: "Controller",            gross: 4583.33, fedRate: 0.175, production: false, officer: false },
  { name: "Marta Kovacs",    role: "Plant Manager",         gross: 4166.67, fedRate: 0.17,  production: true,  officer: false },
  { name: "Terrence Boyd",   role: "Production Supervisor", gross: 3333.33, fedRate: 0.155, production: true,  officer: false },
  { name: "Alicia Ferreira", role: "Quality Manager",       gross: 3125.0,  fedRate: 0.15,  production: true,  officer: false },
  { name: "Sam Njoroge",     role: "CNC Machinist",         gross: 2708.33, fedRate: 0.14,  production: true,  officer: false },
  { name: "Grace Lin",       role: "Buyer / Planner",       gross: 2416.67, fedRate: 0.135, production: false, officer: false },
  { name: "Omar Haddad",     role: "Shipping Lead",         gross: 2208.33, fedRate: 0.13,  production: true,  officer: false },
  { name: "Chloe Bannon",    role: "Office Administrator",  gross: 1875.0,  fedRate: 0.12,  production: false, officer: false },
  { name: "Nadia Petrov",    role: "Assembler (hourly)",    gross: 2332.0,  fedRate: 0.135, production: true,  officer: false },
  { name: "Jamal Rivers",    role: "Assembler (hourly)",    gross: 1894.39, fedRate: 0.12,  production: true,  officer: false },
];

type PayLine = { name: string; role: string; gross: number; fed: number; state: number; fica: number; net: number };

function computeRun(): { lines: PayLine[]; gross: number; fed: number; state: number; fica: number; net: number } {
  const gross = r2(ROSTER.reduce((a, e) => a + e.gross, 0));
  const fica = r2(ROSTER.reduce((a, e) => a + r2(e.gross * FICA_RATE), 0));
  const state = r2(ROSTER.reduce((a, e) => a + r2(e.gross * STATE_RATE), 0));
  // Employer FICA matches employee FICA, so the remittance fixes total federal withholding.
  const fedTotal = r2(BANK.payrollTaxPerRun - 2 * fica - state);

  const feds = ROSTER.map((e) => r2(e.gross * e.fedRate));
  feds[0] = r2(feds[0] + (fedTotal - r2(feds.reduce((a, b) => a + b, 0))));

  const lines = ROSTER.map((e, i) => {
    const f = r2(e.gross * FICA_RATE);
    const s = r2(e.gross * STATE_RATE);
    return { name: e.name, role: e.role, gross: e.gross, fed: feds[i], state: s, fica: f, net: r2(e.gross - feds[i] - s - f) };
  });
  const net = r2(lines.reduce((a, l) => a + l.net, 0));

  // This one genuinely constrains the roster: net only lands on the statement's
  // PAYROLL NET debit if the gross figures satisfy gross + fica - taxPerRun == net.
  assertEq(net, BANK.payrollNetPerRun, "payroll net per run");

  // NOT asserted: fedTotal + 2*fica + state == payrollTaxPerRun. fedTotal is DEFINED as
  // payrollTaxPerRun - 2*fica - state, so that check restates its own definition and can
  // never fail. What is worth guarding is that the derivation stayed physically sane -
  // the banded per-employee rates must roughly explain the remittance on their own, and
  // the top earner who absorbs the leftover must still have a believable withholding.
  const naturalFed = r2(ROSTER.reduce((a, e) => a + r2(e.gross * e.fedRate), 0));
  const residual = r2(fedTotal - naturalFed);
  if (Math.abs(residual) > 500) {
    throw new Error(
      `federal withholding residual ${residual} exceeds 500: the roster's fedRate bands no longer ` +
        `explain the statement's ${money(BANK.payrollTaxPerRun)} remittance, so the top earner is ` +
        `absorbing an implausible plug. Re-band the rates instead of widening this check.`,
    );
  }
  for (const l of lines) {
    const rate = l.fed / l.gross;
    if (l.fed < 0 || rate < 0.05 || rate > 0.35) {
      throw new Error(`${l.name}: federal withholding ${money(l.fed)} on gross ${money(l.gross)} is ${(rate * 100).toFixed(1)}% - outside 5-35%`);
    }
  }
  return { lines, gross, fed: fedTotal, state, fica, net };
}

async function payrollRegister() {
  const run = computeRun();
  const wb = new ExcelJS.Workbook();
  wb.creator = BANK.company;
  wb.lastModifiedBy = BANK.company;
  wb.created = EPOCH;
  wb.modified = EPOCH;
  const ws = wb.addWorksheet("Payroll Register");
  ws.addRow([`${BANK.company} - Payroll Register - June 2026 (semi-monthly)`]);
  ws.addRow(["Provider: Paycore   |   Runs: 2026-06A (paid 2026-06-12), 2026-06B (paid 2026-06-26)"]);
  ws.addRow([]);
  ws.addRow(["Employee", "Role", "Pay Date", "Run", "Gross Pay", "Federal Tax", "State Tax", "FICA", "Net Pay"]);

  for (const [i, payDate] of BANK.payDates.entries()) {
    const runId = i === 0 ? "2026-06A" : "2026-06B";
    for (const l of run.lines) {
      ws.addRow([l.name, l.role, payDate, runId, l.gross, l.fed, l.state, l.fica, l.net]);
    }
    ws.addRow(["", "", payDate, `${runId} TOTAL`, run.gross, run.fed, run.state, run.fica, run.net]);
    ws.addRow([]);
  }

  ws.addRow(["JUNE TOTALS", "", "", "", r2(run.gross * 2), r2(run.fed * 2), r2(run.state * 2), r2(run.fica * 2), r2(run.net * 2)]);
  ws.addRow([]);
  ws.addRow(["Tax remittance reconciliation (per run)"]);
  ws.addRow(["Federal income tax withheld", "", "", "", run.fed]);
  ws.addRow(["FICA - employee", "", "", "", run.fica]);
  ws.addRow(["FICA - employer", "", "", "", run.fica]);
  ws.addRow(["Delaware income tax withheld", "", "", "", run.state]);
  ws.addRow(["FUTA / SUTA", "", "", "", 0, "", "", "", "wage bases exhausted"]);
  ws.addRow(["TOTAL REMITTED PER RUN", "", "", "", BANK.payrollTaxPerRun]);
  ws.addRow([]);
  ws.addRow([`Net per run ${money(run.net)} and remittance ${money(BANK.payrollTaxPerRun)} match the PAYCORE debits on the June operating statement.`]);

  const path = join(OUT, "payroll_register_2026-06.xlsx");
  await wb.xlsx.writeFile(path);
  console.log("wrote", path, "net/run", run.net.toFixed(2), "remit/run", BANK.payrollTaxPerRun.toFixed(2));
}

// ── Crypto treasury wallet export (CSV) ─────────────────────────────────────
/**
 * ON-CHAIN ONLY on purpose: the June bank statement contains no crypto on/off-ramp
 * line, so this wallet must never show a fiat transfer or the two documents would
 * contradict each other. Its two customers settled their invoices in USDC, which is
 * exactly why they don't appear on the AR aging (that sheet lists only what's still
 * outstanding) and why no matching bank deposit exists. ETH is valued at one fixed
 * reference rate for the month so every USD figure is reproducible from its quantity.
 */
const ETH_USD = 3200.0;

async function cryptoWallet() {
  type Row = { date: string; type: string; asset: "USDC" | "ETH"; qty: number; counterparty: string; memo: string; hash: string };
  const opening = { USDC: 38000.0, ETH: 9.75 };
  const rows: Row[] = [
    { date: "2026-06-05", type: "Receive",        asset: "USDC", qty: 16200.0, counterparty: "Torrey Additive Labs",  memo: "INV NL-2429 settled in USDC", hash: "0x3d71c05a9e2b48f610ac77d2e4b5091f83cc6ad4" },
    { date: "2026-06-09", type: "Network fee",    asset: "ETH",  qty: -0.0131, counterparty: "",                      memo: "Gas - USDC transfer",         hash: "0x2f9b60d71ee34c8a05f1b7ca9d3820e64af17c55" },
    { date: "2026-06-17", type: "Receive",        asset: "USDC", qty: 11450.0, counterparty: "Kestrel Robotics",      memo: "INV NL-2434 settled in USDC", hash: "0xc4e83a5719b06d2fa87c1e40db95f37206ae8b13" },
    { date: "2026-06-21", type: "Staking reward", asset: "ETH",  qty: 0.248,   counterparty: "Lido stETH",            memo: "Validator rewards - June",    hash: "0x91d27fb4630ae85c07f2ab63d418e5920cc7d6fa" },
    { date: "2026-06-25", type: "Send",           asset: "USDC", qty: -5800.0, counterparty: "Ferrous Analytics LLC", memo: "Materials testing retainer",  hash: "0x5b30ce8241f79ad06e3b1c95f7d240a86ef31b70" },
    { date: "2026-06-28", type: "Network fee",    asset: "ETH",  qty: -0.0106, counterparty: "",                      memo: "Gas - USDC transfer",         hash: "0xe07f92a315c48b6017da39e2fc84b5106d3a92c8" },
  ];

  const usd = (asset: "USDC" | "ETH", qty: number) => (asset === "ETH" ? qty * ETH_USD : qty);
  const lines: string[] = [
    `${BANK.company} - Treasury Wallet Export`,
    "Wallet address,0x6Ac1b53E9d7F204aB8e35c1907Dd42f8B0341eC7",
    "Network,Ethereum mainnet",
    `Statement period,${BANK.period}`,
    `ETH/USD reference rate,${ETH_USD.toFixed(2)}`,
    "",
    "Date,Type,Asset,Quantity,USD Value,Counterparty,Memo,Tx Hash,USDC Balance,ETH Balance,Wallet Value USD",
  ];

  let usdc = opening.USDC;
  let eth = opening.ETH;
  const walletValue = () => r2(usdc + eth * ETH_USD);
  lines.push(`2026-06-01,Opening balance,,,,,Opening wallet balance,,${usdc.toFixed(2)},${eth.toFixed(4)},${walletValue().toFixed(2)}`);
  for (const r of rows) {
    if (r.asset === "USDC") usdc = r2(usdc + r.qty);
    else eth = r2(eth + r.qty);
    lines.push(
      [r.date, r.type, r.asset, r.qty.toFixed(r.asset === "ETH" ? 4 : 2), usd(r.asset, r.qty).toFixed(2),
       r.counterparty, r.memo, r.hash, usdc.toFixed(2), eth.toFixed(4), walletValue().toFixed(2)].join(","),
    );
  }
  lines.push(`2026-06-30,Closing balance,,,,,Closing wallet balance,,${usdc.toFixed(2)},${eth.toFixed(4)},${walletValue().toFixed(2)}`);

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
 *
 * Plant labour sits in COGS, not in "Salaries and wages" - that is where a
 * manufacturer's direct labour belongs, and it is why the deduction line is much
 * smaller than the payroll register's total.
 */
async function taxReturn() {
  const run = computeRun();
  // Form 1120 is filed in whole dollars, so every figure is rounded once here and all
  // totals are footed from the rounded values - the return has to add up as printed.
  const w = (n: number) => Math.round(n);
  const annual = (pred: (e: (typeof ROSTER)[number]) => boolean) =>
    w(ROSTER.filter(pred).reduce((a, e) => a + e.gross, 0) * 24);

  const officers = annual((e) => e.officer);
  const plantLabor = annual((e) => e.production);
  const adminSalaries = annual((e) => !e.production && !e.officer);

  const materials = w(BANK.materialsJune * 12);
  const factoryOverhead = 96000;
  const cogs = materials + plantLabor + factoryOverhead;

  const grossReceipts = 2280000;
  const grossProfit = grossReceipts - cogs;

  const m = BANK.monthly;
  const deductions: Array<[string, number, string]> = [
    ["Compensation of officers", officers, ""],
    ["Salaries and wages (less officers)", adminSalaries, "admin and finance; plant labor in COGS"],
    ["Rents", w(m.rent * 12), `${money(m.rent)}/mo - Harborview Properties`],
    ["Taxes and licenses", w(run.gross * 24 * FICA_RATE + 4820.0), "employer FICA + FUTA/SUTA"],
    ["Insurance", w(BANK.quarterlyInsurance * 4), `${money(BANK.quarterlyInsurance)}/qtr - Granite Shield`],
    ["Software and hosting", w(m.hosting * 12), `${money(m.hosting)}/mo - CloudStack`],
    ["Freight and logistics", w(m.freight * 12), `${money(m.freight)}/mo - Meridian Logistics`],
    ["Utilities", w(m.utilities * 12), `${money(m.utilities)}/mo - City Power and Water`],
    ["Payment processing fees", w(m.processing * 12), `${money(m.processing)}/mo - CardServ`],
    ["Bank service charges", w(m.serviceFee * 12), `${money(m.serviceFee)}/mo`],
    ["Depreciation", 86500, "plant and machinery"],
    ["Other deductions", 38400, ""],
  ];
  const totalDeductions = deductions.reduce((a, [, v]) => a + v, 0);
  const taxableIncome = grossProfit - totalDeductions;
  const tax = w(taxableIncome * 0.21);
  const estimatedPayments = 24000;
  const overpayment = estimatedPayments - tax;

  if (taxableIncome <= 0) throw new Error(`FY2025 taxable income is ${taxableIncome} - raise gross receipts`);

  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  doc.info.CreationDate = EPOCH;
  doc.info.Title = "Form 1120 - FY2025";
  doc.info.Author = BANK.company;
  // Machine-readable copy of the figures printed below, so the drift guard can verify the
  // COMMITTED bytes without a PDF text extractor (none is available - pdfkit only writes).
  // Swapping in a different 1120 changes these, which is exactly the drift we need to catch.
  doc.info.Keywords = [
    `gross_receipts=${grossReceipts}`,
    `cogs=${cogs}`,
    `total_deductions=${totalDeductions}`,
    `taxable_income=${taxableIncome}`,
    `total_tax=${tax}`,
  ].join(";");
  const path = join(OUT, "form_1120_2025.pdf");
  const stream = createWriteStream(path);
  doc.pipe(stream);

  // Whole dollars, as filed.
  const dollars = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const line = (label: string, value: number, note = "", bold = false) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
    doc.text(label, 54, y, { width: 250 });
    if (note) doc.font("Helvetica").fontSize(8).fillColor("#555555").text(note, 310, y + 1, { width: 150 });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor("#000000");
    doc.text(dollars(value), 466, y, { width: 92, align: "right" });
    doc.moveDown(0.35);
    doc.x = 54; // line() parks the cursor at the amount column; section headers start at the margin
  };
  /** Section heading - always from the left margin, never from wherever line() left doc.x. */
  const heading = (label: string) => {
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(label, 54, doc.y);
    doc.moveDown(0.3);
  };

  doc.fontSize(16).font("Helvetica-Bold").text("Form 1120");
  doc.fontSize(10).font("Helvetica").text("U.S. Corporation Income Tax Return");
  doc.moveDown(0.4);
  doc.fontSize(10);
  doc.text(`Taxpayer: ${BANK.company}`);
  doc.text(BANK.address);
  doc.text("EIN: 51-0427718   |   Tax year: 2025-01-01 to 2025-12-31   |   Filed: 2026-03-16");
  doc.moveDown();

  heading("Income");
  line("1a  Gross receipts or sales", grossReceipts);
  line("2   Cost of goods sold", cogs, "materials, plant labor, overhead");
  line("3   Gross profit", grossProfit, "", true);
  doc.moveDown(0.6);

  heading("Deductions");
  for (const [label, value, note] of deductions) line(label, value, note);
  line("Total deductions", totalDeductions, "", true);
  doc.moveDown(0.6);

  heading("Tax and payments");
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

verifyBankStatement();
await arAging();
await payrollRegister();
await cryptoWallet();
await taxReturn();
