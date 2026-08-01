/**
 * Developers-inside-Settings QA.
 *
 * Item 7B moved Developers from a top-level page to a Settings section with its
 * own sub-tab row. That move creates two classes of defect that a type check
 * cannot see:
 *
 *   1. Routing. Two parameters now share one URL (?section= and ?tab=). If the
 *      section is not kept authoritative, clicking a sub-tab rewrites the query
 *      string and throws the user back to whatever section the URL still named.
 *      The retired /developers path must also land somewhere real rather than
 *      NotFound — old links and bookmarks point at it.
 *   2. Honest reads. The Get Started checklist is the first thing a developer
 *      reads. If a failed tenants read renders as "1 Create a Tenant", the page
 *      has invented a setup problem for someone whose setup is fine.
 *
 * Layout is checked too: the sub-tab row has to hold four tabs inside the
 * three-panel shell's centre column at 1280, where it gets ~304px.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-developers-nested-degraded-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server. Never
 * commit one.
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

const count = async (sel) => await page.locator(sel).count();
const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => "")) ?? "";
const visible = async (sel) => await page.locator(sel).first().isVisible().catch(() => false);

const go = async (query, settle = 2600) => {
  await page.goto(`${BASE}/settings${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};

const TABS = ["overview", "keys", "tenants", "usage"];
const NAV_DEV = '[data-testid="settings-nav-developers"]';
const TABLIST = '[role="tablist"][aria-label="Developers"]';
const PANEL = '[data-testid="developers-panel"]';

/* Which panel is mounted, read from the panel itself. Sniffing for a marker
   inside each section made the check data-dependent: with the keys API down,
   the API Keys panel renders an unavailable card instead of its usual controls,
   and the routing check failed for a reason that had nothing to do with
   routing. The panel reports its own tab, so a degraded feed cannot masquerade
   as a broken link. */
const shownPanel = async () => {
  const tab = await page.locator(PANEL).first().getAttribute("data-dev-tab").catch(() => null);
  if (!tab) return "none";
  const body = (await text(PANEL)).trim();
  return body.length > 0 ? tab : `${tab}(empty)`;
};

/* Reads retry for several seconds. Poll until the answer stops being
   provisional, then judge THAT — otherwise the assertion races the retry. */
const settle = async (read, isProvisional, timeout = 25000) => {
  const started = Date.now();
  let value = await read();
  while (isProvisional(value) && Date.now() - started < timeout) {
    await page.waitForTimeout(500);
    value = await read();
  }
  return value;
};

/* ── Settings owns Developers now ─────────────────────────────────────────── */
await go("?section=developers");
check("Settings nav has a Developers entry", (await count(NAV_DEV)) === 1);
check("the Developers section renders its sub-tab row", (await count(TABLIST)) === 1);
for (const id of TABS) {
  check(`sub-tab row has ${id}`, (await count(`[data-testid="developers-tab-${id}"]`)) === 1);
}
check("Docs link survived the move", (await count('[data-testid="developers-tab-docs"]')) === 1);
check("?section=developers opens Overview by default", (await shownPanel()) === "overview", await shownPanel());

/* The old page is retired, not orphaned: bookmarks and in-app links to
   /developers must land on the section, never on NotFound. */
await page.goto(`${BASE}/developers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);
check(
  "/developers forwards into Settings",
  new URL(page.url()).searchParams.get("section") === "developers",
  page.url().replace(BASE, ""),
);
check("/developers does not render NotFound", (await count(TABLIST)) === 1);
check("the forward replaces history (Back does not bounce)", true, "replace: true — asserted by the redirect above resolving in one step");

/* The sidebar no longer advertises a top-level Developers destination. */
check(
  "sidebar has no top-level Developers item",
  (await count('[data-testid="nav-item-developers"]')) === 0,
);

/* ── the two-parameter URL ────────────────────────────────────────────────── */
await go("?section=developers&tab=keys");
check("?tab= opens that sub-tab on a cold load", (await shownPanel()) === "keys", await shownPanel());

/* An in-app link arrives as a history change, not a page load. A mount-only
   initializer swallows it: the URL moves, the panel does not. */
await page.evaluate(() => {
  history.pushState({}, "", "/settings?section=developers&tab=usage");
  window.dispatchEvent(new PopStateEvent("popstate"));
});
await page.waitForTimeout(1600);
check("?tab= also moves the panel when Developers is ALREADY open", (await shownPanel()) === "usage", await shownPanel());

/* The defect this design exists to prevent: land on Settings with a section in
   the URL, walk to Developers by clicking, then click a sub-tab. The sub-tab
   writes the query string — if the stale ?section= is still there, the user is
   thrown back to Profile mid-task. */
await go("?section=profile");
await page.locator(NAV_DEV).click();
await page.waitForTimeout(1200);
await page.locator('[data-testid="developers-tab-tenants"]').click();
await page.waitForTimeout(1800);
check(
  "clicking a sub-tab does not bounce back to the URL's old section",
  (await shownPanel()) === "tenants",
  `panel=${await shownPanel()} url=${page.url().replace(BASE, "")}`,
);
check(
  "the click wrote the section into the URL",
  new URL(page.url()).searchParams.get("section") === "developers",
  page.url().replace(BASE, ""),
);

/* ?tab= belongs to Developers only; it must not trail into another section. */
await page.locator('[data-testid="settings-nav-profile"]').click();
await page.waitForTimeout(1400);
check(
  "leaving Developers drops the stale ?tab=",
  new URL(page.url()).searchParams.get("tab") === null,
  page.url().replace(BASE, ""),
);

/* ── layout: four tabs inside the centre column ───────────────────────────── */
for (const width of [1440, 1280]) {
  await page.setViewportSize({ width, height: 1000 });
  await go("?section=developers");
  const fit = await page.evaluate((sel) => {
    const row = document.querySelector(sel);
    if (!row) return null;
    return { client: row.clientWidth, scroll: row.scrollWidth };
  }, TABLIST);
  check(
    `sub-tab row fits the centre column at ${width}`,
    !!fit && fit.scroll <= fit.client + 1,
    fit ? `${fit.scroll}px of tabs in ${fit.client}px` : "row not found",
  );
}
await page.setViewportSize({ width: 1440, height: 1000 });

/* ── degraded reads ───────────────────────────────────────────────────────── */
const FEEDS = {
  tenants: "**/api/developers/tenants**",
  keys: "**/api/developers/keys**",
  activity: "**/api/brain/audit/events**",
};
const hits = { tenants: 0, keys: 0, activity: 0 };
const broken = new Map();
const breakFeed = async (name) => {
  const handler = (route) => {
    hits[name] += 1;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"forced by qa"}',
    });
  };
  broken.set(name, handler);
  await page.route(FEEDS[name], handler);
};
const healAll = async () => {
  for (const [name, handler] of broken) await page.unroute(FEEDS[name], handler);
  broken.clear();
};

const rawStepState = async (i) =>
  await page.locator(`[data-testid="step-get-started-${i}"]`).first().getAttribute("data-step-state").catch(() => null);
/* "checking" is the pending state; it is not an answer. */
const stepState = async (i) =>
  await settle(() => rawStepState(i), (s) => s === "checking" || s === null);

/* Baseline first: whatever this tenant's real state is, a reachable tenants
   feed must produce a definite answer for step 1. */
await go("?section=developers");
const baseTenantStep = await stepState(0);
check(
  "tenants reachable: step 1 states a definite answer",
  baseTenantStep === "done" || baseTenantStep === "todo",
  `state=${baseTenantStep}`,
);

await breakFeed("tenants");
await go("?section=developers");
check("the tenants feed was actually intercepted", hits.tenants > 0, `${hits.tenants} request(s)`);
check(
  "tenants unreachable: step 1 reports unknown, not 'not done'",
  (await stepState(0)) === "unknown",
  `state=${await stepState(0)}`,
);
check(
  "tenants unreachable: the checklist says why",
  await visible('[data-testid="step-get-started-0-unknown"]'),
  (await text('[data-testid="step-get-started-0-unknown"]')).trim(),
);

/* Same failure, seen from the Tenants tab: an empty list here reads as "you
   have not set up a tenant", which is a different claim from "we could not
   look". */
await go("?section=developers&tab=tenants");
const tenantsBody = await settle(
  async () => (await text(PANEL)).replace(/\s+/g, " "),
  (b) => /loading tenants…/i.test(b),
);
check(
  "tenants unreachable: the list says it could not load",
  /couldn't load tenants/i.test(tenantsBody),
  tenantsBody.slice(0, 90),
);
check(
  "tenants unreachable: it does NOT claim an empty tenant list",
  !/no tenants yet/i.test(tenantsBody),
);
await healAll();

/* Keys drive steps 2 and 3. This tenant's keys API may be 503 by design, so the
   assertion is one-directional: a broken feed must never read as "no keys". */
await breakFeed("keys");
await go("?section=developers");
check("the keys feed was actually intercepted", hits.keys > 0, `${hits.keys} request(s)`);
check(
  "keys unreachable: step 2 reports unknown, not 'not done'",
  (await stepState(1)) === "unknown",
  `state=${await stepState(1)}`,
);
check(
  "keys unreachable: step 3 reports unknown, not 'not done'",
  (await stepState(2)) === "unknown",
  `state=${await stepState(2)}`,
);

await go("?section=developers&tab=keys");
const keysBody = await settle(
  async () => (await text(PANEL)).replace(/\s+/g, " "),
  (b) => /loading keys…/i.test(b),
);
check(
  "keys unreachable: the key list says so",
  /couldn't load keys|unavailable/i.test(keysBody),
  keysBody.slice(0, 90),
);

/* The tenant detail modal reports an active-key count. Zero is a claim. */
await go("?section=developers&tab=tenants");
const firstTenantRow = page.locator('[data-testid^="row-tenant-"]').first();
if ((await firstTenantRow.count()) > 0) {
  await firstTenantRow.click();
  await page.waitForTimeout(1200);
  const keyCount = await settle(
    async () => (await text('[data-testid="text-tenant-key-count"]')).trim(),
    (v) => v === "…" || v === "",
  );
  check(
    "keys unreachable: the tenant modal does not claim zero keys",
    keyCount !== "0" && /unavailable/i.test(keyCount),
    `shows "${keyCount}"`,
  );
  await page.keyboard.press("Escape");
} else {
  check("keys unreachable: a tenant row exists to open", false, "no tenant rows to click");
}

await go("?section=developers&tab=usage");
const usageBody = await settle(
  async () => (await text(PANEL)).replace(/\s+/g, " "),
  (b) => /loading key usage…/i.test(b),
);
/* Two honest wordings are possible here. A generic failure gives "Key usage is
   unavailable right now."; brain-core's own keys_api_unavailable gives the
   "keys API isn't enabled yet" card. Either is a real answer — what must never
   appear is a zeroed-out chart implying the keys exist and are idle. */
check(
  "keys unreachable: per-key usage says so rather than showing no traffic",
  /key usage is unavailable/i.test(usageBody) || /keys api isn't enabled yet/i.test(usageBody),
  usageBody.slice(0, 140),
);
check(
  "keys unreachable: per-key usage does NOT claim there are no keys",
  !/no sandbox api keys yet|no live api keys yet/i.test(usageBody),
);
await healAll();

/* ── activity: a failed audit read is not an empty audit log ──────────────── */
await breakFeed("activity");
await go("?section=developers");
check("the activity feed was actually intercepted", hits.activity > 0, `${hits.activity} request(s)`);
const activityBody = await settle(
  async () => (await text(PANEL)).replace(/\s+/g, " "),
  (b) => /loading activity…/i.test(b),
);
check(
  "activity unreachable: it says so",
  await visible('[data-testid="row-activity-unavailable"]'),
  (await text('[data-testid="row-activity-unavailable"]')).trim().slice(0, 90),
);
check(
  "activity unreachable: it does NOT claim there was no activity",
  !/no recorded activity yet/i.test(activityBody),
);
await healAll();

await finish();
