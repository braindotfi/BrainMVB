/**
 * Settings degraded-state QA.
 *
 * Settings is where an operator goes to answer "what is Brain allowed to do
 * without me?". Three of the answers on this screen are dangerous when they are
 * confidently wrong:
 *
 *   1. Auto-approve limit. If the approval policy cannot be read and the row
 *      renders "None", the screen has told a finance lead that nothing is
 *      automated — on the exact surface they would check before leaving for the
 *      weekend. Unknown must read as unknown.
 *   2. Connected sources. If a sources feed fails and the list renders "No
 *      sources yet", the screen says a bank is disconnected when it is not.
 *   3. Notifications and escalation. Neither has a backend. Controls that look
 *      live imply Brain will chase an unapproved payment. It will not.
 *
 * Every check below is about what the screen SAYS, not whether it threw.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-settings-degraded-states.mjs
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

const FEEDS = {
  policy: "**/api/brain/approval-policy*",
  banks: "**/api/integrations/plaid/connections*",
  tools: "**/api/integrations/connections*",
  docs: "**/api/integrations/documents*",
  brainSources: "**/api/brain/sources*",
};
const broken = new Map();
const breakFeed = async (name) => {
  const handler = (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"forced by qa"}' });
  broken.set(name, handler);
  await page.route(FEEDS[name], handler);
};
const healAll = async () => {
  for (const [name, handler] of broken) await page.unroute(FEEDS[name], handler);
  broken.clear();
};

const go = async (section, settle = 2200) => {
  await page.goto(`${BASE}/settings?section=${section}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};
const count = async (sel) => await page.locator(sel).count();
const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => "")) ?? "";

const LIMIT = '[data-testid="text-auto-approve-limit"]';
const LIMIT_ROW = '[data-testid="setting-row-auto-approve-limit"]';
const SOURCES_NOTICE = '[data-testid="notice-sources-unavailable"]';
const SOURCES_EMPTY = '[data-testid="empty-connected-sources"]';

/* ── the tabs exist and the deep link is not mount-only ──────────────────── */
await go("profile");
for (const id of ["profile", "notifications", "team", "billing", "sources", "security", "legal", "account"]) {
  check(`nav has a ${id} tab`, (await count(`[data-testid="settings-nav-${id}"]`)) === 1);
}

check(
  "?section= opens that tab on a cold load",
  (await page.locator('[data-testid="settings-nav-profile"]').getAttribute("style"))?.includes("rgb(10, 12, 16)") ?? false,
);

/* An in-app link to another tab arrives as a history change, not a page load.
   A mount-only initializer swallows it: the URL moves, the page does not. */
await page.evaluate(() => {
  history.pushState({}, "", "/settings?section=team");
  window.dispatchEvent(new PopStateEvent("popstate"));
});
await page.waitForTimeout(1400);
check(
  "?section= also moves the page when Settings is ALREADY open",
  (await count('[data-testid="text-escalation-unavailable"]')) === 1,
  await text('[data-testid="text-escalation-unavailable"]'),
);

/* ── auto-approve limit: the money-authorization row ─────────────────────── */
await go("profile");
const healthyLimit = (await text(LIMIT)).trim();
check(
  "policy reachable: the limit row states a real answer",
  healthyLimit.length > 0 && healthyLimit !== "Unknown" && healthyLimit !== "Checking…",
  healthyLimit,
);
check("…and says it is read-only rather than offering a dead control",
  (await count('[data-testid="text-auto-approve-readonly"]')) === 1);
check("…and exposes no editable input for the limit",
  (await page.locator(`${LIMIT_ROW} input, ${LIMIT_ROW} select`).count()) === 0);

await breakFeed("policy");
await go("profile");
const brokenLimit = (await text(LIMIT)).trim();
check(
  "policy 503: the limit reads Unknown, NOT None",
  brokenLimit === "Unknown",
  brokenLimit,
);
check(
  "…and the sublabel says the limit is unknown rather than absent",
  /unknown, not absent/i.test(await text(LIMIT_ROW)),
);
await healAll();

/* ── connected sources: a failed read is not a disconnection ─────────────── */
for (const feed of ["banks", "tools", "docs", "brainSources"]) {
  await healAll();
  await breakFeed(feed);
  await go("sources", 2600);
  const noticeShown = (await count(SOURCES_NOTICE)) === 1;
  check(`sources: ${feed} 503 is admitted on screen`, noticeShown, await text(SOURCES_NOTICE));
  check(
    `sources: ${feed} 503 never renders as "No sources yet"`,
    (await count(SOURCES_EMPTY)) === 0,
  );
}

await healAll();
await go("sources", 2600);
check(
  "sources: with every feed healthy there is no outage notice",
  (await count(SOURCES_NOTICE)) === 0,
);

/* ── notifications: shown, and visibly not connected ─────────────────────── */
await go("notifications");
check(
  "notifications: the screen says delivery is not connected",
  (await count('[data-testid="text-notifications-unavailable"]')) === 1,
  await text('[data-testid="text-notifications-unavailable"]'),
);
for (const id of ["slack", "email-digest", "sms-urgent"]) {
  const row = `[data-testid="row-notification-${id}"]`;
  check(`notifications: ${id} row is present`, (await count(row)) === 1);
  check(
    `notifications: ${id} is marked disabled, not merely styled`,
    (await page.locator(row).getAttribute("aria-disabled")) === "true",
  );
  check(
    `notifications: ${id} offers nothing to click`,
    (await page.locator(`${row} button, ${row} input`).count()) === 0,
  );
}
check(
  "notifications: no invented threshold or channel name is quoted as configuration",
  !/\$100,?000|#finance-approvals/i.test(await page.locator("main, body").first().innerText()),
);

/* ── team: escalation is inert, backup approver is honest ────────────────── */
await go("team", 2600);
check(
  "team: escalation says the timers are not active",
  (await count('[data-testid="text-escalation-unavailable"]')) === 1,
  await text('[data-testid="text-escalation-unavailable"]'),
);
for (const id of ["urgent", "action-needed"]) {
  const row = `[data-testid="row-escalation-${id}"]`;
  check(`team: escalation ${id} row is present`, (await count(row)) === 1);
  check(
    `team: escalation ${id} is marked disabled`,
    (await page.locator(row).getAttribute("aria-disabled")) === "true",
  );
  check(
    `team: escalation ${id} offers nothing to click`,
    (await page.locator(`${row} button, ${row} select`).count()) === 0,
  );
}

/* The member id is read from the rendered page rather than hardcoded — members
   are seeded per tenant and a stale literal would silently skip this check. */
const memberId = await page.evaluate(() => {
  const el = document.querySelector('[data-testid^="button-backup-"]');
  return el ? el.getAttribute("data-testid").replace("button-backup-", "") : null;
});
if (!memberId) {
  check("team: at least one member row to mark", false, "no member rows rendered");
} else {
  const btn = `[data-testid="button-backup-${memberId}"]`;
  const pill = `[data-testid="pill-backup-${memberId}"]`;
  check("team: a member starts unmarked", (await count(pill)) === 0);
  await page.click(btn);
  await page.waitForTimeout(300);
  check("team: marking a backup approver shows the badge", (await count(pill)) === 1);
  check(
    "team: the mark is labelled as changing nothing about approval",
    /changes nothing about who can approve/i.test((await page.locator(btn).getAttribute("title")) ?? ""),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  check("team: the mark survives a reload", (await count(pill)) === 1);
  await page.click(btn);
  await page.waitForTimeout(300);
  check("team: the mark can be removed", (await count(pill)) === 0);
}

await healAll();
await browser.close();

console.log(
  failures.length === 0
    ? "\nAll settings degraded-state checks passed."
    : `\n${failures.length} FAILED:\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
