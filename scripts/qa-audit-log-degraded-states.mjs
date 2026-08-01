/**
 * Audit Log system-activity filter QA.
 *
 * The Audit Log now defaults to decision history and hides pipeline events
 * behind a toggle. That is a filter that is ON by default, which changes what
 * an empty list means: it is no longer a fact about the tenant's history, it is
 * a fact about the filter. On the live demo tenant this is not hypothetical —
 * the last hundred events are almost entirely pipeline traffic, so the default
 * view is empty and the empty state is carrying the whole truth.
 *
 * So the checks below are mostly about what the page SAYS when it is showing
 * nothing:
 *
 *   - "No audit records yet" must never appear while records are being withheld
 *   - the hidden count must be real, not decorative: revealing must produce
 *     exactly that many more rows
 *   - a search that matches a hidden event must say so, rather than report no
 *     matches and leave the operator to conclude the record does not exist
 *   - a failed read must still read as a failed read, not as a filtered-empty
 *     list — the two look identical and mean opposite things
 *
 * Assistant activity (a person asked Brain a question) stays visible by
 * default; the control is labelled "system activity" and hiding human Q&A
 * behind it would misdescribe what it does.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-audit-log-degraded-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server. Never
 * commit one.
 */

import { createQaSession } from "./qa-harness.mjs";

const { ctx, page, base, check, finish } = await createQaSession({ viewport: { width: 1280, height: 1000 } });

/* ── Fixtures ──────────────────────────────────────────────────────────────
   Shaped from a real /audit/events response on the demo tenant (pipeline
   actions dominate; brain-core's own event_type is the classifier). */
const at = (minsAgo) => new Date(Date.UTC(2026, 6, 31, 12, 0, 0) - minsAgo * 60_000).toISOString();

const systemEvent = (n) => ({
  id: `evt_qa_sys_${n}`,
  tenant_id: "tnt_qa",
  layer: "wiki",
  actor: "agent_qa",
  actor_ref: { id: "agent_qa", type: "agent" },
  action: n % 2 === 0 ? "wiki.page.regenerated" : "agent.router.selected",
  event_type: "system_activity",
  category: "system_activity",
  inputs: {},
  outputs: {},
  policy_version: null,
  event_hash: `hash_sys_${n}`,
  prev_event_hash: null,
  created_at: at(n + 1),
});

const decisionEvent = (n, action) => ({
  id: `evt_qa_dec_${n}`,
  tenant_id: "tnt_qa",
  layer: "execution",
  actor: "user_qa",
  actor_ref: { id: "user_qa", type: "user", display_name: "QA Operator" },
  action,
  event_type: "flagged",
  inputs: {},
  outputs: {},
  policy_version: 1,
  event_hash: `hash_dec_${n}`,
  prev_event_hash: null,
  created_at: at(n),
});

const assistantEvent = {
  id: "evt_qa_assistant",
  tenant_id: "tnt_qa",
  layer: "wiki",
  actor: "user_qa",
  actor_ref: { id: "user_qa", type: "user", display_name: "QA Operator" },
  action: "wiki.question",
  event_type: "assistant_activity",
  inputs: { question: "Which invoices are still open?" },
  outputs: {},
  policy_version: null,
  event_hash: "hash_assistant",
  prev_event_hash: null,
  created_at: at(0),
};

const SYSTEM_COUNT = 12;
const SYSTEM_ONLY = Array.from({ length: SYSTEM_COUNT }, (_, i) => systemEvent(i));
const MIXED = [
  decisionEvent(1, "payment_intent.approved"),
  decisionEvent(2, "payment_intent.rejected"),
  assistantEvent,
  ...SYSTEM_ONLY.slice(0, 8),
];

let mode = "systemOnly";
let held = null;
let hits = 0;

await ctx.route("**/api/brain/audit/events**", async (route) => {
  hits += 1;
  if (mode === "hang") { held = route; return; }
  if (mode === "fail") {
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "upstream_unavailable" }) });
  }
  const events = mode === "mixed" ? MIXED : SYSTEM_ONLY;
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events, next_cursor: null }) });
});

/* The page also merges auto-approved proposals. Emptied so every row on screen
   is attributable to the audit fixture and the counts below mean something. */
await ctx.route("**/api/brain/proposals**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ proposals: [], next_cursor: null }) }),
);

const ROWS = '[data-testid^="row-audit-"]';
const TOGGLE = '[data-testid="toggle-system-activity"]';
const TOGGLE_TEXT = '[data-testid="text-system-activity-toggle"]';
const EMPTY = '[data-testid="text-audit-empty"]';

const rowCount = () => page.locator(ROWS).count();
const toggleText = () => page.locator(TOGGLE_TEXT).innerText();
const emptyText = async () => ((await page.locator(EMPTY).count()) > 0 ? (await page.locator(EMPTY).innerText()).trim() : "");
const pageText = () => page.locator("body").innerText();

async function load(nextMode) {
  mode = nextMode;
  held = null;
  const before = hits;
  await page.goto(`${base}/audit-log`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check(`[${nextMode}] the intercepted audit read is the one the page used`, hits > before, `${hits - before} request(s)`);
}

/* ── 1. A log that is nothing but pipeline traffic (the live demo tenant) ── */
await load("systemOnly");

check("the default view hides pipeline events", (await rowCount()) === 0, `${await rowCount()} rows`);
const empty1 = await emptyText();
check("an emptied-by-filter log never claims to be an empty log", !/No audit records yet/i.test(empty1), empty1);
check("the empty state names what is being withheld", empty1.includes(`${SYSTEM_COUNT} system events are hidden`), empty1);
check("the empty state says how to see it", /show system activity/i.test(empty1), empty1);
check("the toggle discloses the count too", (await toggleText()) === `Show system activity (${SYSTEM_COUNT})`, await toggleText());

/* The count has to be real, not decorative. */
await page.click(TOGGLE);
await page.waitForTimeout(600);
check("revealing produces exactly the promised number of rows", (await rowCount()) === SYSTEM_COUNT, `${await rowCount()} rows`);
check("the toggle reads as state once on", (await toggleText()) === "Showing system activity", await toggleText());

/* ── 2. The choice survives a reload, per user ── */
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("an explicit choice to show system activity is remembered", (await rowCount()) === SYSTEM_COUNT);
await page.click(TOGGLE);
await page.waitForTimeout(600);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("and so is turning it back off", (await rowCount()) === 0 && (await toggleText()).startsWith("Show system activity ("));

/* ── 3. A search whose only match is behind the filter ──
   The term is taken from what the page itself renders, not hardcoded. */
await page.click(TOGGLE);
await page.waitForTimeout(600);
const hiddenRowTitle = (await page.locator(`${ROWS} p`).first().innerText()).trim();
await page.click(TOGGLE);
await page.waitForTimeout(400);
await page.fill('[data-testid="input-audit-search"]', hiddenRowTitle);
await page.waitForTimeout(600);
const searchEmpty = await emptyText();
check("a search does not report 'no matches' when the match is merely hidden", /hidden system event/i.test(searchEmpty), searchEmpty);
check("the hidden-match count is stated", /\d+ hidden system event/i.test(searchEmpty), searchEmpty);
await page.fill('[data-testid="input-audit-search"]', "zzz-no-such-record-zzz");
await page.waitForTimeout(600);
check("a genuine no-match still reads as one", (await emptyText()) === "No matches.", await emptyText());
await page.fill('[data-testid="input-audit-search"]', "");
await page.waitForTimeout(400);

/* ── 4. Decisions and assistant activity are what the default view is for ── */
await load("mixed");
check("decisions and human Q&A are visible by default", (await rowCount()) === 3, `${await rowCount()} rows`);
check("only the pipeline events are counted as hidden", (await toggleText()) === "Show system activity (8)", await toggleText());
const visibleText = await page.locator('[data-testid^="row-audit-"]').allInnerTexts();
check(
  "assistant activity is not swept behind a control labelled 'system activity'",
  visibleText.join(" ").toLowerCase().includes("invoices are still open") ||
    visibleText.some((t) => /question/i.test(t)),
  visibleText.join(" | "),
);
await page.click(TOGGLE);
await page.waitForTimeout(600);
check("revealing adds the pipeline events to the same list", (await rowCount()) === 11, `${await rowCount()} rows`);
await page.click(TOGGLE);
await page.waitForTimeout(400);

/* ── 5. A failed read must not be mistaken for a filtered-empty one ── */
await load("fail");
const failText = await pageText();
check("a failed audit read says so", /couldn't load the audit log/i.test(failText));
check("a failed read makes no claim about decision history", !/no decision events|no audit records|system events are hidden/i.test(failText));

/* ── 6. Still reading ── */
await load("hang");
const pendingText = await pageText();
check("a pending read says it is loading", /loading your audit log/i.test(pendingText));
check("a pending read claims nothing about what is or isn't there", !/no decision events|no audit records/i.test(pendingText));
if (held) {
  await held.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: SYSTEM_ONLY, next_cursor: null }) });
  await page.waitForTimeout(1200);
  check("once the read lands, the honest filtered-empty state appears", /system events are hidden/i.test(await emptyText()), await emptyText());
}

await finish();
