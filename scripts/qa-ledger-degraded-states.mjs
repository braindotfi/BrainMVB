/**
 * Ledger degraded-state QA.
 *
 * This codebase has a recurring defect shape: a react-query hook with
 * `retry: false` whose consumer reads `data?.x ?? []`, so a failed request
 * renders a calm empty state — "No connected accounts yet", "$0.00", no overdue
 * banner — that is indistinguishable from genuinely having nothing. The bug is
 * invisible in every happy-path test and in every screenshot, because the
 * broken state is the one that looks fine.
 *
 * The only way to catch it is to break the feeds on purpose and assert on what
 * renders. That is what this does: each of the Ledger's reads is forced to 503
 * in turn, and the script fails if the UI answers with a zero or an empty list
 * instead of saying it could not load.
 *
 * It drives a real browser against a running dev server rather than mounting
 * components, because the thing under test is the rendered sentence.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-ledger-degraded-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server; take
 * it from a browser session or a curl login jar. Never commit one.
 */

import { createQaSession } from "./qa-harness.mjs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";
const USER = process.env.QA_USER_ID;
const COOKIE = process.env.QA_COOKIE;
const CHROMIUM = process.env.CHROMIUM;
const PLAYWRIGHT = process.env.PLAYWRIGHT ?? "playwright";

if (!USER || !COOKIE) {
  console.error("QA_USER_ID and QA_COOKIE are required. See the header of this file.");
  process.exit(2);
}

/* One shared session for every QA script: signed in as the target tenant, with
   writes denied by default — an interception a script forgets to install turns
   into a failed check, not a live write. See scripts/qa-harness.mjs. */
const { ctx, page, api, check, permitWrite, stubWrite, finish } = await createQaSession();
const go = async (path, settle = 2400) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};
const count = (sel) => page.locator(sel).count();

const breakFeed = (glob) => ctx.route(glob, (r) => r.fulfill({ status: 503, body: "{}" }));
const healFeed = (glob) => ctx.unroute(glob);

const ACCOUNTS = "**/api/brain/ledger/accounts*";
const TRANSACTIONS = "**/api/brain/ledger/transactions*";
const INVOICES = "**/api/brain/ledger/invoices*";

/* Accounts: an unreachable ledger is not an empty one. */
await breakFeed(ACCOUNTS);
await go("/ledger?tab=accounts");
check("accounts 503 says it could not load", (await count('[data-testid="text-accounts-unavailable"]')) === 1);
check("accounts 503 does not claim 'no connected accounts'", (await count('[data-testid="text-accounts-empty"]')) === 0);
await healFeed(ACCOUNTS);

/* Cash Flow totals: em dash, never $0.00. */
await breakFeed(TRANSACTIONS);
await go("/ledger?tab=cash-flow");
const income = await page.locator('[data-testid="metric-cashflow-income"]').innerText();
check("transactions 503 renders an em dash, not $0.00", income.includes("—"), income.replace(/\n+/g, " | "));
check("transactions 503 raises an explicit notice", (await count('[data-testid="banner-cashflow-incomplete"]')) === 1);
check(
  "bills still render when only transactions failed",
  (await count('[data-testid^="row-cashflow-inv:"]')) > 0,
);
await healFeed(TRANSACTIONS);

/* The overdue warning must not disappear when its own source breaks. */
await breakFeed(INVOICES);
await go("/ledger?tab=cash-flow");
check(
  "invoices 503 keeps the overdue warning visible as 'unknown'",
  (await count('[data-testid="banner-overdue-unavailable"]')) === 1,
);
const liabilities = await page.locator('[data-testid="metric-cashflow-liabilities"]').innerText();
check("invoices 503 renders liabilities as an em dash", liabilities.includes("—"), liabilities.replace(/\n+/g, " | "));
await healFeed(INVOICES);

/* Both gone: the empty state must not read as "no money movement". */
await breakFeed(TRANSACTIONS);
await breakFeed(INVOICES);
await go("/ledger?tab=cash-flow");
const empty = await page.locator('[data-testid="text-cashflow-empty"]').innerText().catch(() => "");
check("total outage says nothing could be loaded", /could(n't| not)? be loaded/i.test(empty), empty);
await healFeed(TRANSACTIONS);
await healFeed(INVOICES);

/* Account drill-down: "no recent activity" must not be an outage. */
await breakFeed(TRANSACTIONS);
await go("/ledger?tab=accounts");
const firstAccount = page.locator('[data-testid="row-account-0"]');
if (await firstAccount.count()) {
  await firstAccount.click();
  await page.waitForTimeout(900);
  check(
    "transactions 503 does not render the account popup as 'no activity'",
    (await count('[data-testid="text-activity-unavailable"]')) === 1 &&
      (await count('[data-testid="text-activity-empty"]')) === 0,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}
await healFeed(TRANSACTIONS);

/* Vendor list feeding the rule builder. */
await breakFeed("**/api/brain/ledger/counterparties*");
await go("/ledger?tab=rules&rules=automations");
const chip = page.locator('[data-testid="chip-vendor"]');
if (await chip.count()) {
  await chip.click();
  await page.waitForTimeout(700);
  check(
    "counterparties 503 does not offer an empty 'no trusted vendors' list as fact",
    (await count('[data-testid="text-vendors-empty"]')) === 0,
  );
}
await healFeed("**/api/brain/ledger/counterparties*");

await finish();
