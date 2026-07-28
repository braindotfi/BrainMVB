/**
 * The demo scenario, expressed RELATIVE TO A SEEDING DATE.
 *
 * Everything in the bundled starter demo (Brightline Systems Inc.) is derived here from
 * a single `now`, so a tenant created at any point in time gets a dataset that sits
 * inside the trailing windows the UI queries. This module is pure: no I/O, no clock
 * access, no rendering. `documents.ts` turns a scenario into the five files.
 *
 * WHY A ROLLING 30-DAY PERIOD, NOT A CALENDAR MONTH
 * -------------------------------------------------
 * Surfaces like `ledger/cash_flows` ask for a trailing window: [now - 30d, now]. A
 * completed calendar month ends BEFORE now, so it slides out of that window as the
 * month progresses - full coverage on the 1st, half by the 15th, nothing by the 31st.
 * Anchoring to "the most recently completed calendar month" therefore reintroduces the
 * exact decay it was meant to fix, just on a monthly sawtooth. The period here ends on
 * the seeding date and runs 30 days back, so the whole dataset is always inside a
 * trailing-30-day window with a day of margin.
 *
 * RECONCILIATION RULES - every number must agree with every other number:
 *   - Payroll net per run matches the two bank-statement payroll debits (33,564.38).
 *   - AR aging lists only OUTSTANDING invoices, so customers who paid appear as bank
 *     inflows and are absent from the aging - and vice versa.
 *   - The crypto wallet is ON-CHAIN ONLY. It has no fiat on/off-ramp, because the bank
 *     statement has no crypto transfer line. Its customers (Vertex Robotics, Helios
 *     Data Co) settled in USDC, so they are correctly absent from the AR aging.
 *   - The tax return is a PRIOR, ALREADY-FILED fiscal year, so it cannot contradict
 *     current-period activity. Its recurring expense lines are derived from the bank
 *     statement's monthly amounts, so the two documents describe the same business.
 *
 * Day offsets below are counted from the period start and reproduce the original
 * hand-authored June-2026 fixture exactly when the period is 2026-06-01..2026-06-30.
 */

export const COMPANY = "Brightline Systems Inc.";

/** Inclusive length of the statement period. 30 days keeps the whole dataset inside a
 *  trailing-30-day window (offsets run 0..29, so the last txn lands on the period end). */
export const PERIOD_DAYS = 30;

export const OPENING_BALANCE = 187450.23;

/** One fixed reference rate for the period, so every USD figure in the wallet export is
 *  reproducible from its quantity. */
export const ETH_USD = 3200.0;

// ── date helpers (UTC-only; these are date-only values, never instants) ──────

/** YYYY-MM-DD for a Date, in UTC. Local time is never used: a server in UTC-5 would
 *  otherwise generate a different period than the same code running in UTC. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function monthIndex(iso: string): number {
  return Number(iso.slice(5, 7)) - 1;
}

/** "JUNE" - the month the charge itself falls in. */
function monthName(iso: string): string {
  return MONTHS[monthIndex(iso)];
}

/** "MAY" - processing fees are always billed a month in arrears. */
function previousMonthName(iso: string): string {
  return MONTHS[(monthIndex(iso) + 11) % 12];
}

/** "Q3" - insurance is paid during one quarter to cover the NEXT one. */
function nextQuarterLabel(iso: string): string {
  const q = Math.floor(monthIndex(iso) / 3); // 0-3
  return `Q${((q + 1) % 4) + 1}`;
}

/** "06/15" - how a payroll processor labels the run on a bank line. */
function monthDay(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

/** "JUNE" -> "June", for prose contexts (memos) rather than bank-line shouting. */
function titleCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

// ── bank statement ──────────────────────────────────────────────────────────

export interface BankTxn {
  date: string;
  description: string;
  amount: number;
  balance: number;
}

/**
 * Offsets from the period start. `desc` is a builder so month/quarter words follow the
 * dates instead of being frozen at "JUNE"/"Q3".
 *
 * The two payroll debits at +14 and +29 are what the payroll register must total to,
 * and the customer names on the CREDIT lines are the ones deliberately absent from the
 * AR aging (they paid).
 */
const BANK_TXNS: Array<{ offset: number; desc: (d: string) => string; amount: number }> = [
  { offset: 1, desc: () => "ACH CREDIT - NORTHWIND TRADERS INV-1042", amount: 18400.0 },
  { offset: 2, desc: (d) => `ACH DEBIT - CLOUDOPS HOSTING ${monthName(d)}`, amount: -2350.0 },
  { offset: 4, desc: () => "WIRE CREDIT - ACME ANALYTICS INV-1039", amount: 32750.0 },
  { offset: 7, desc: () => "ACH DEBIT - OFFICE LEASE - 400 MARKET ST", amount: -8900.0 },
  { offset: 9, desc: (d) => `ACH DEBIT - STRIPE FEES ${previousMonthName(d)}`, amount: -1284.55 },
  { offset: 11, desc: () => "ACH CREDIT - GLOBEX CORP INV-1044", amount: 12600.0 },
  { offset: 14, desc: (d) => `PAYROLL - GUSTO NET PAY ${monthDay(d)}`, amount: -33564.38 },
  { offset: 14, desc: () => "TAX PMT - EFTPS FEDERAL 941", amount: -14833.12 },
  { offset: 16, desc: (d) => `ACH DEBIT - ANTHOS INSURANCE ${nextQuarterLabel(d)}`, amount: -4120.0 },
  { offset: 18, desc: () => "ACH CREDIT - INITECH LLC INV-1046", amount: 9800.0 },
  { offset: 22, desc: (d) => `ACH DEBIT - DATAWAREHOUSE CO ${monthName(d)}`, amount: -3675.0 },
  { offset: 24, desc: () => "ACH CREDIT - UMBRELLA HEALTH INV-1047", amount: 21150.0 },
  { offset: 29, desc: (d) => `PAYROLL - GUSTO NET PAY ${monthDay(d)}`, amount: -33564.38 },
  { offset: 29, desc: () => "TAX PMT - EFTPS FEDERAL 941", amount: -14833.12 },
  { offset: 29, desc: () => "INTEREST CREDIT", amount: 61.87 },
];

/** Monthly recurring amounts, read straight off the statement lines above. The tax
 *  return annualises exactly these, which is what keeps the two documents consistent. */
export const RECURRING = {
  rent: 8900.0,
  hosting: 2350.0,
  dataWarehouse: 3675.0,
  processing: 1284.55,
  quarterlyInsurance: 4120.0,
} as const;

// ── AR aging ────────────────────────────────────────────────────────────────

export type AgingBucket = "Current" | "1-30 Days" | "31-60 Days" | "61-90 Days" | "Over 90";

export const AGING_BUCKETS: AgingBucket[] = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90"];

export interface ArInvoice {
  customer: string;
  invoice: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  bucket: AgingBucket;
  daysPastDue: number;
}

/**
 * Offsets from the period END (the "as of" date), with net-30 terms throughout.
 * Buckets are DERIVED from the dates below rather than hardcoded, so an invoice can
 * never sit in a column its own due date contradicts.
 */
const AR_INVOICES: Array<{ customer: string; invoice: string; invoicedAt: number; amount: number }> = [
  { customer: "Northwind Traders", invoice: "INV-1048", invoicedAt: -10, amount: 15200 },
  { customer: "Acme Analytics", invoice: "INV-1045", invoicedAt: -25, amount: 27300 },
  { customer: "Globex Corp", invoice: "INV-1041", invoicedAt: -43, amount: 12600 },
  { customer: "Initech LLC", invoice: "INV-1038", invoicedAt: -63, amount: 9800 },
  { customer: "Umbrella Health", invoice: "INV-1049", invoicedAt: -4, amount: 21150 },
  { customer: "Stark Industries", invoice: "INV-1033", invoicedAt: -92, amount: 7450 },
  { customer: "Wayne Enterprises", invoice: "INV-1027", invoicedAt: -138, amount: 4300 },
];

const NET_TERMS_DAYS = 30;

export function bucketFor(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1-30 Days";
  if (daysPastDue <= 60) return "31-60 Days";
  if (daysPastDue <= 90) return "61-90 Days";
  return "Over 90";
}

// ── payroll ─────────────────────────────────────────────────────────────────

export interface PayrollLine {
  name: string;
  role: string;
  payDate: string;
  gross: number;
  federal: number;
  state: number;
  fica: number;
  net: number;
}

const EMPLOYEES: Array<[name: string, role: string, gross: number]> = [
  ["Ava Chen", "CEO", 9166.67],
  ["Marcus Webb", "CTO", 8750.0],
  ["Priya Natarajan", "Senior Engineer", 7291.67],
  ["Diego Ramos", "Senior Engineer", 7291.67],
  ["Hannah Lee", "Product Designer", 5833.33],
  ["Tom Okafor", "Account Executive", 5416.67],
  ["Sofia Marino", "Ops Manager", 5000.0],
];

const FEDERAL_RATE = 0.18;
const STATE_RATE = 0.055;
const FICA_RATE = 0.0765;

/** The two bank payroll debits, by offset from period start - the register is built to
 *  land on exactly these dates and total exactly these amounts. */
const PAYROLL_OFFSETS = [14, 29];

// ── crypto wallet ───────────────────────────────────────────────────────────

export interface WalletRow {
  date: string;
  type: string;
  asset: "USDC" | "ETH" | "";
  qty: number | null;
  usdValue: number | null;
  counterparty: string;
  memo: string;
  hash: string;
  usdcBalance: number;
  ethBalance: number;
  walletValueUsd: number;
}

const WALLET_OPENING = { USDC: 45000.0, ETH: 12.5 };

const WALLET_ACTIVITY: Array<{
  offset: number;
  type: string;
  asset: "USDC" | "ETH";
  qty: number;
  counterparty: string;
  /** Builder, so period words track the dates instead of freezing at "June"/"Q3". */
  memo: (date: string) => string;
  hash: string;
}> = [
  { offset: 3, type: "Receive", asset: "USDC", qty: 18500.0, counterparty: "Vertex Robotics", memo: () => "INV-1043 settled in USDC", hash: "0x7a1c4e02b98d5f3610ac77d2e4b5091f83cc6ad4" },
  { offset: 10, type: "Network fee", asset: "ETH", qty: -0.0142, counterparty: "", memo: () => "Gas - USDC transfer", hash: "0x2f9b60d71ee34c8a05f1b7ca9d3820e64af17c55" },
  { offset: 17, type: "Receive", asset: "USDC", qty: 9250.0, counterparty: "Helios Data Co", memo: () => "INV-1050 settled in USDC", hash: "0xc4e83a5719b06d2fa87c1e40db95f37206ae8b13" },
  { offset: 21, type: "Staking reward", asset: "ETH", qty: 0.3125, counterparty: "Lido stETH", memo: (d) => `Validator rewards - ${titleCase(monthName(d))}`, hash: "0x91d27fb4630ae85c07f2ab63d418e5920cc7d6fa" },
  { offset: 25, type: "Send", asset: "USDC", qty: -6400.0, counterparty: "Halcyon Security", memo: (d) => `${nextQuarterLabel(d)} audit retainer`, hash: "0x5b30ce8241f79ad06e3b1c95f7d240a86ef31b70" },
  { offset: 28, type: "Network fee", asset: "ETH", qty: -0.0098, counterparty: "", memo: () => "Gas - USDC transfer", hash: "0xe07f92a315c48b6017da39e2fc84b5106d3a92c8" },
];

export const WALLET_ADDRESS = "0x8Fd2a41c7B90e5D316aC4f0b27e93Cd5A16b7F42";

// ── tax return ──────────────────────────────────────────────────────────────

/**
 * The corporate return has to be for a year that is genuinely OVER and genuinely FILED,
 * or the demo shows a return filed in the future. Calendar-year filers are due 15 April
 * (15 March for S-corps); we use 15 March as the conservative cutoff and file a few days
 * before it. So a tenant seeded in Jan/Feb 2027 still shows FY2025, not an unfiled FY2026.
 */
export function fiscalYearFor(periodEnd: string): number {
  const year = Number(periodEnd.slice(0, 4));
  const filingCutoff = `${year}-03-15`;
  return periodEnd >= filingCutoff ? year - 1 : year - 2;
}

const GROSS_RECEIPTS = 1520000.0;
const COGS = 236800.0;
const ESTIMATED_PAYMENTS = 9200.0;
const CORPORATE_RATE = 0.21;

export interface TaxReturn {
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  filedOn: string;
  grossReceipts: number;
  cogs: number;
  grossProfit: number;
  deductions: Array<[label: string, value: number, note: string]>;
  totalDeductions: number;
  taxableIncome: number;
  tax: number;
  estimatedPayments: number;
  overpayment: number;
}

// ── the scenario ────────────────────────────────────────────────────────────

export interface SeedScenario {
  company: string;
  /** First day of the statement period (period end - 29 days). */
  periodStart: string;
  /** Last day of the statement period == the date seeding happened. */
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  transactions: BankTxn[];
  invoices: ArInvoice[];
  payroll: PayrollLine[];
  payrollNetPerRun: number;
  payrollDates: string[];
  wallet: WalletRow[];
  walletOpening: typeof WALLET_OPENING;
  tax: TaxReturn;
}

/**
 * Build the whole internally-consistent scenario for a given seeding instant.
 * Pure and total: same `now` always yields the same scenario.
 */
export function buildScenario(now: Date): SeedScenario {
  const periodEnd = toIsoDate(now);
  const periodStart = addDays(periodEnd, -(PERIOD_DAYS - 1));

  // Bank statement, with the running balance carried forward line by line.
  let balance = OPENING_BALANCE;
  const transactions: BankTxn[] = BANK_TXNS.map(({ offset, desc, amount }) => {
    const date = addDays(periodStart, offset);
    balance = +(balance + amount).toFixed(2);
    return { date, description: desc(date), amount, balance };
  });

  // AR aging, bucketed from the dates rather than by hand.
  const invoices: ArInvoice[] = AR_INVOICES.map((inv) => {
    const invoiceDate = addDays(periodEnd, inv.invoicedAt);
    const dueDate = addDays(invoiceDate, NET_TERMS_DAYS);
    const daysPastDue = daysBetween(dueDate, periodEnd);
    return {
      customer: inv.customer,
      invoice: inv.invoice,
      invoiceDate,
      dueDate,
      amount: inv.amount,
      daysPastDue,
      bucket: bucketFor(daysPastDue),
    };
  });

  // Payroll register - two runs landing on the statement's payroll debit dates.
  const payrollDates = PAYROLL_OFFSETS.map((o) => addDays(periodStart, o));
  const payroll: PayrollLine[] = [];
  for (const payDate of payrollDates) {
    for (const [name, role, gross] of EMPLOYEES) {
      const federal = +(gross * FEDERAL_RATE).toFixed(2);
      const state = +(gross * STATE_RATE).toFixed(2);
      const fica = +(gross * FICA_RATE).toFixed(2);
      const net = +(gross - federal - state - fica).toFixed(2);
      payroll.push({ name, role, payDate, gross, federal, state, fica, net });
    }
  }
  const payrollNetPerRun = +payroll
    .filter((p) => p.payDate === payrollDates[0])
    .reduce((a, p) => a + p.net, 0)
    .toFixed(2);

  // Crypto wallet, balances carried forward.
  let usdc = WALLET_OPENING.USDC;
  let eth = WALLET_OPENING.ETH;
  const walletValue = () => +(usdc + eth * ETH_USD).toFixed(2);
  const wallet: WalletRow[] = WALLET_ACTIVITY.map((r) => {
    const date = addDays(periodStart, r.offset);
    if (r.asset === "USDC") usdc = +(usdc + r.qty).toFixed(2);
    else eth = +(eth + r.qty).toFixed(4);
    return {
      date,
      type: r.type,
      asset: r.asset,
      qty: r.qty,
      usdValue: +(r.asset === "ETH" ? r.qty * ETH_USD : r.qty).toFixed(2),
      counterparty: r.counterparty,
      memo: r.memo(date),
      hash: r.hash,
      usdcBalance: usdc,
      ethBalance: eth,
      walletValueUsd: walletValue(),
    };
  });

  // Prior-year corporate return, annualised off the statement's own monthly amounts.
  const fiscalYear = fiscalYearFor(periodEnd);
  const grossProfit = GROSS_RECEIPTS - COGS;
  const deductions: TaxReturn["deductions"] = [
    ["Compensation of officers", 205000.0, ""],
    ["Salaries and wages (less officers)", 690000.0, ""],
    ["Rents", RECURRING.rent * 12, `${RECURRING.rent.toFixed(2)}/mo - 400 Market St`],
    ["Taxes and licenses", 74900.0, "employer payroll taxes, FUTA/SUTA"],
    ["Insurance", RECURRING.quarterlyInsurance * 4, `${RECURRING.quarterlyInsurance.toFixed(2)}/qtr - Anthos Insurance`],
    ["Software and hosting", (RECURRING.hosting + RECURRING.dataWarehouse) * 12, "CloudOps + DataWarehouse Co"],
    ["Payment processing fees", RECURRING.processing * 12, `${RECURRING.processing.toFixed(2)}/mo - Stripe`],
    ["Depreciation", 18750.0, ""],
    ["Other deductions", 41200.0, ""],
  ];
  const totalDeductions = +deductions.reduce((a, [, v]) => a + v, 0).toFixed(2);
  const taxableIncome = +(grossProfit - totalDeductions).toFixed(2);
  const tax = +(taxableIncome * CORPORATE_RATE).toFixed(2);

  return {
    company: COMPANY,
    periodStart,
    periodEnd,
    openingBalance: OPENING_BALANCE,
    closingBalance: balance,
    transactions,
    invoices,
    payroll,
    payrollNetPerRun,
    payrollDates,
    wallet,
    walletOpening: WALLET_OPENING,
    tax: {
      fiscalYear,
      periodStart: `${fiscalYear}-01-01`,
      periodEnd: `${fiscalYear}-12-31`,
      filedOn: `${fiscalYear + 1}-03-12`,
      grossReceipts: GROSS_RECEIPTS,
      cogs: COGS,
      grossProfit,
      deductions,
      totalDeductions,
      taxableIncome,
      tax,
      estimatedPayments: ESTIMATED_PAYMENTS,
      overpayment: +(ESTIMATED_PAYMENTS - tax).toFixed(2),
    },
  };
}
