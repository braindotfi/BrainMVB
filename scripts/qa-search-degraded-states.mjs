/**
 * Global search degraded-state QA.
 *
 * Search has a sharper version of this codebase's recurring defect: "No matches"
 * is a claim about the user's data. If one of the three feeds behind the bar is
 * unreachable and the bar still says "No matches", it has not failed to find
 * something — it has asserted that the thing does not exist. An operator who
 * searches for a vendor, is told there are no matches, and concludes the vendor
 * was never onboarded has been actively misled by a working-looking UI.
 *
 * So the distinction under test is not "does it handle errors" but "does it
 * distinguish, in words, between these three states":
 *
 *   1. searched everything, found nothing        → "No matches in …"
 *   2. searched some sources, others unreachable → "No matches in <the ones asked>"
 *                                                  + a notice naming the ones that failed
 *   3. nothing reachable at all                  → "Search is unavailable", never "no matches"
 *
 * State 2 is the one that matters most and the one no happy-path test can see:
 * results render, the list looks normal, and the absence is silent unless the
 * bar says so out loud.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-search-degraded-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server. Never
 * commit one.
 */

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";
const USER = process.env.QA_USER_ID;
const COOKIE = process.env.QA_COOKIE;
const CHROMIUM = process.env.CHROMIUM;
const PLAYWRIGHT = process.env.PLAYWRIGHT ?? "playwright";

if (!USER || !COOKIE) {
  console.error("QA_USER_ID and QA_COOKIE are required. See the header of this file.");
  process.exit(2);
}

const { chromium } = await import(PLAYWRIGHT);

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([
  { name: "brain.sid", value: COOKIE, domain: new URL(BASE).hostname, path: "/" },
]);
await ctx.addInitScript((u) => {
  localStorage.setItem(`brain_onboarding_complete_${u}`, "true");
}, USER);

const page = await ctx.newPage();
const failures = [];
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures.push(label);
};

const INPUT = '[data-testid="input-global-search"]';
const RESULT = '[data-testid^="search-result-"]';
const NO_MATCHES = '[data-testid="text-search-no-matches"]';
const PARTIAL = '[data-testid="text-search-partial"]';
const UNAVAILABLE = '[data-testid="text-search-unavailable"]';

const FEEDS = {
  decisions: "**/api/brain/proposals*",
  vendors: "**/api/brain/ledger/counterparties*",
  accounts: "**/api/brain/ledger/accounts*",
};
const broken = new Map();
const breakFeed = async (name) => {
  const handler = (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"forced by qa"}' });
  broken.set(name, handler);
  await page.route(FEEDS[name], handler);
};
/* A feed that is merely slow is the nastiest version of this bug: the wrong
   sentence is on screen for a second and then corrects itself, so it never
   survives to a screenshot and no happy-path test is patient enough to miss it. */
const slowFeed = async (name, ms) => {
  const handler = async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  };
  broken.set(name, handler);
  await page.route(FEEDS[name], handler);
};
const healAll = async () => {
  for (const [name, handler] of broken) await page.unroute(FEEDS[name], handler);
  broken.clear();
};

const go = async (path = "/ledger", settle = 2600) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};
const search = async (q, settle = 900) => {
  await page.fill(INPUT, "");
  await page.fill(INPUT, q);
  await page.waitForTimeout(settle);
};
const count = async (sel) => await page.locator(sel).count();
const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => "")) ?? "";

/* A term that cannot match anything, and one taken from the tenant's own data.
   The real term is derived at runtime rather than hardcoded: account names are
   seeded per tenant, and a stale literal turns "found nothing" into a passing
   run that proves nothing. */
const NONSENSE = "zzzzqqqqnothing";

await go();
const REAL = await page.evaluate(async () => {
  const r = await fetch("/api/brain/ledger/accounts");
  if (!r.ok) return null;
  const j = await r.json();
  const name = (j.accounts ?? [])[0]?.name ?? "";
  return name.split(/\s+/)[0] || null;
});
if (!REAL) {
  console.error(
    "Could not derive a search term from this tenant's accounts. Without a term\n" +
      "that genuinely matches, 'no matches' and 'nothing seeded' are indistinguishable.",
  );
  await browser.close();
  process.exit(2);
}
console.log(`Using "${REAL}" as the known-good term.\n`);

/* ── state 0: the bar can actually find things ───────────────────────────── */
await search(REAL);
const baseline = await count(RESULT);
check("baseline: a real term returns results", baseline > 0, `${baseline} results`);
if (baseline === 0) {
  console.error(
    "\nNo results on a healthy tenant — the rest of this run cannot distinguish\n" +
      "'no matches' from 'nothing seeded'. Check the tenant has data before trusting a pass.",
  );
}

/* ── state 1: genuinely nothing found ────────────────────────────────────── */
await search(NONSENSE);
check(
  "all sources up: an empty result says 'no matches', not an outage",
  (await count(NO_MATCHES)) === 1 && (await count(UNAVAILABLE)) === 0 && (await count(PARTIAL)) === 0,
  await text(NO_MATCHES),
);
check(
  "…and names all three sources as searched",
  /decisions/.test(await text(NO_MATCHES)) &&
    /vendors/.test(await text(NO_MATCHES)) &&
    /accounts/.test(await text(NO_MATCHES)),
);

/* ── state 2: partial outage — the quiet one ─────────────────────────────── */
await breakFeed("vendors");
await go();
await search(REAL);
check(
  "one feed 503: the bar admits the gap instead of silently returning fewer results",
  (await count(PARTIAL)) === 1,
  await text(PARTIAL),
);
check("…and the sources still up keep answering", (await count(RESULT)) > 0);
check("…and it is not mistaken for a total outage", (await count(UNAVAILABLE)) === 0);

await search(NONSENSE);
const partialEmpty = await text(NO_MATCHES);
check(
  "one feed 503 + no hits: 'no matches' claims only the sources actually searched",
  /decisions/.test(partialEmpty) && /accounts/.test(partialEmpty) && !/vendors/.test(partialEmpty),
  partialEmpty,
);
check("…and the outage notice is still on screen beside it", (await count(PARTIAL)) === 1);

/* Same again with a different feed, so the copy is not hardcoded to vendors. */
await healAll();
await breakFeed("decisions");
await go();
await search(NONSENSE);
const decDown = await text(NO_MATCHES);
check(
  "the naming follows whichever feed actually failed",
  /vendors/.test(decDown) && /accounts/.test(decDown) && !/decisions/.test(decDown),
  decDown,
);

/* ── state 3: nothing reachable ──────────────────────────────────────────── */
await breakFeed("vendors");
await breakFeed("accounts");
await go();
await search(REAL);
check(
  "all three 503: search says it is unavailable",
  (await count(UNAVAILABLE)) === 1,
  await text(UNAVAILABLE),
);
check(
  "…and never claims 'no matches' while blind",
  (await count(NO_MATCHES)) === 0 && (await count(RESULT)) === 0,
);
await search(NONSENSE);
check(
  "…including for a term that would genuinely have no matches",
  (await count(UNAVAILABLE)) === 1 && (await count(NO_MATCHES)) === 0,
);

/* ── state 4: still answering ────────────────────────────────────────────── */
await healAll();
await slowFeed("vendors", 7000);
await page.goto(`${BASE}/ledger`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200); // deliberately short — vendors is still in flight
await search(NONSENSE, 400);
check(
  "a feed that is still loading reads as 'searching', not 'no matches'",
  (await count('[data-testid="text-search-pending"]')) === 1 && (await count(NO_MATCHES)) === 0,
  (await text('[data-testid="text-search-pending"]')) || (await text(NO_MATCHES)),
);
check(
  "…and a pending feed is not misreported as an outage",
  (await count(PARTIAL)) === 0 && (await count(UNAVAILABLE)) === 0,
);

/* …and once it lands, the honest conclusion is allowed. */
await page.waitForTimeout(7000);
await search(NONSENSE, 600);
check(
  "once every feed has answered, 'no matches' is permitted again",
  (await count(NO_MATCHES)) === 1 && (await count('[data-testid="text-search-pending"]')) === 0,
  await text(NO_MATCHES),
);

await healAll();
await browser.close();

console.log(
  failures.length === 0
    ? "\nAll global-search degraded-state checks passed."
    : `\n${failures.length} FAILED:\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
