/**
 * Settings → Audit Log QA.
 *
 * The audit trail moved. The old standalone /audit-log page defaulted to
 * decision history and hid pipeline events behind a toggle; it is gone, and
 * /audit-log is now only a redirect. Settled decisions live in the Inbox
 * timeline, and the COMPLETE trail — decisions plus the pipeline traffic behind
 * them — lives at Settings → Audit Log.
 *
 * That move inverts the default. There is no filter on at load, so an empty
 * list is once again a fact about the tenant. The failure modes worth guarding
 * therefore shift, but they rhyme:
 *
 *   - a failed read must read as a failed read, never as an empty history: the
 *     two look identical on screen and mean opposite things
 *   - when the operator DOES narrow the list and it comes back empty, the copy
 *     must name how many records the filter is withholding
 *   - "Decisions only" must mean decisions — assistant Q&A is neither a
 *     decision nor pipeline traffic and gets its own badge
 *   - the count must not claim a total it cannot know: brain-core pages behind
 *     a cursor this app does not follow, so a full page back is "at least N"
 *   - the Inbox must NOT inherit any of this; it stays a decision queue
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
const DECISION_COUNT = 2;
const MIXED = [
  decisionEvent(1, "payment_intent.approved"),
  decisionEvent(2, "payment_intent.rejected"),
  assistantEvent,
  ...SYSTEM_ONLY.slice(0, 8),
];
const MIXED_SYSTEM_COUNT = 8;

/* A full page (what the hook asks brain-core for) — the cap-disclosure case. */
const EVENT_LIMIT = 100;
const FULL_PAGE = Array.from({ length: EVENT_LIMIT }, (_, i) => systemEvent(i));
/* One short of the cap. Merged with the local questions below this exceeds
   EVENT_LIMIT, which is the trap: the cap applies to the brain-core read alone,
   so this page must NOT be reported as capped. */
const NEAR_LIMIT = Array.from({ length: EVENT_LIMIT - 1 }, (_, i) => systemEvent(i));

/* Assistant questions are recorded locally and merged in from a separate query,
   so they survive an audit-feed failure. That is what makes "the feed failed"
   and "the list is empty" separable states worth testing. */
const LOCAL_QUESTIONS = [
  { id: "q_qa_1", question: "What did we pay Brightline last month?", createdAt: at(3) },
  { id: "q_qa_2", question: "Are any invoices overdue?", createdAt: at(4) },
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
  const events =
    mode === "mixed" ? MIXED
    : mode === "fullPage" ? FULL_PAGE
    : mode === "nearLimit" ? NEAR_LIMIT
    : mode === "empty" ? []
    : SYSTEM_ONLY;
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events, next_cursor: null }) });
});

/* Locally-recorded assistant questions merge into the same list. Empty for most
   modes so every row on screen is attributable to the audit fixture and the
   counts below mean something; populated only where their interaction with the
   audit read is the thing under test. */
let localQuestions = [];
await ctx.route("**/api/assistant/questions**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ questions: localQuestions }) }),
);

const ROWS = '[data-testid^="row-audit-"]';
const BADGES = '[data-testid^="badge-audit-category-"]';
const EMPTY = '[data-testid="text-audit-empty"]';
const FILTER = '[data-testid="button-audit-type-filter"]';
const COUNT_BADGE = '[data-testid="badge-audit-count"]';
const CAP = '[data-testid="text-audit-cap"]';

const rowCount = () => page.locator(ROWS).count();
const emptyText = async () => ((await page.locator(EMPTY).count()) > 0 ? (await page.locator(EMPTY).innerText()).trim() : "");
const textOf = async (sel) => ((await page.locator(sel).count()) > 0 ? (await page.locator(sel).first().innerText()).trim() : "");
/* Badges are CSS-uppercased, so compare on a normalised form rather than the
   rendered casing — an assertion that fails on `text-transform` is noise. */
const badgeKinds = async () =>
  new Set((await page.locator(BADGES).allInnerTexts()).map((b) => b.trim().toLowerCase()));

async function load(nextMode) {
  mode = nextMode;
  held = null;
  const before = hits;
  await page.goto(`${base}/settings?section=audit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
  check(`[${nextMode}] the intercepted audit read is the one the page used`, hits > before, `${hits - before} request(s)`);
}

const pick = async (id) => {
  await page.click(FILTER);
  await page.waitForTimeout(200);
  await page.click(`[data-testid="option-audit-type-${id}"]`);
  await page.waitForTimeout(600);
};

/* ── 1. The tab exists and shows everything by default ───────────────────── */
await load("systemOnly");
check("Settings has an Audit Log tab", (await page.locator('[data-testid="settings-nav-audit"]').count()) === 1);
check(
  "nothing is filtered out at load — pipeline events included",
  (await rowCount()) === SYSTEM_COUNT,
  `${await rowCount()} rows`,
);
check("the filter starts on All types", (await textOf(FILTER)) === "All types", await textOf(FILTER));
check("every row is badged with its category", (await page.locator(BADGES).count()) === SYSTEM_COUNT);
check(
  "pipeline events are badged as System",
  (await badgeKinds()).size === 1 && (await badgeKinds()).has("system"),
  [...(await badgeKinds())].join(", "),
);

/* ── 2. A narrowed list must say what it is withholding ──────────────────── */
await pick("decisions");
check("decisions-only on a pipeline-only log shows nothing", (await rowCount()) === 0, `${await rowCount()} rows`);
const filteredEmpty = await emptyText();
check("a filtered-empty list never claims the log itself is empty", !/No audit records yet/i.test(filteredEmpty), filteredEmpty);
check(
  "the empty state names how many records the filter is holding",
  filteredEmpty.includes(`${SYSTEM_COUNT} records are hidden by the type filter`),
  filteredEmpty,
);
check("the empty state says how to see them", /All types/i.test(filteredEmpty), filteredEmpty);

await pick("all");
check("returning to All types restores every row", (await rowCount()) === SYSTEM_COUNT);

/* ── 3. Decisions, assistant Q&A and pipeline traffic are told apart ─────── */
await load("mixed");
check(
  "a mixed log shows every category at once",
  (await rowCount()) === MIXED.length,
  `${await rowCount()} of ${MIXED.length} rows`,
);
const mixedKinds = await badgeKinds();
check(
  "all three categories are represented",
  ["decision", "assistant", "system"].every((k) => mixedKinds.has(k)),
  [...mixedKinds].join(", "),
);

await pick("decisions");
check(
  "'Decisions only' means decisions — assistant Q&A is not counted as one",
  (await rowCount()) === DECISION_COUNT,
  `${await rowCount()} rows, expected ${DECISION_COUNT}`,
);
check(
  "…and every remaining row is badged a decision",
  (await badgeKinds()).size === 1 && (await badgeKinds()).has("decision"),
  [...(await badgeKinds())].join(", "),
);

await pick("system");
check(
  "'System activity only' excludes both decisions and assistant Q&A",
  (await rowCount()) === MIXED_SYSTEM_COUNT,
  `${await rowCount()} rows, expected ${MIXED_SYSTEM_COUNT}`,
);
check(
  "…and every remaining row is badged System",
  (await badgeKinds()).size === 1 && (await badgeKinds()).has("system"),
  [...(await badgeKinds())].join(", "),
);
await pick("all");

/* ── 4. Search, and what "no matches" is allowed to mean ─────────────────── */
/* The term is derived from a fixture rather than hardcoded, so it cannot go
   stale against a renamed action. */
await page.fill('[data-testid="input-audit-search"]', "rejected");
await page.waitForTimeout(600);
check("search narrows the list", (await rowCount()) > 0 && (await rowCount()) < MIXED.length, `${await rowCount()} rows`);
await page.fill('[data-testid="input-audit-search"]', "zzz-no-such-record-zzz");
await page.waitForTimeout(600);
check("a genuine no-match reads as one", /No records match your search/i.test(await emptyText()), await emptyText());
await page.fill('[data-testid="input-audit-search"]', "");
await page.waitForTimeout(500);

/* ── 5. A row opens its record without leaving the page ──────────────────── */
await page.locator(ROWS).first().click();
await page.waitForTimeout(1200);
check("tapping a row opens the record popup", (await page.locator('[role="dialog"]').count()) > 0);
check("…in place: the route is still Settings → Audit Log", page.url().includes("section=audit"), page.url());
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ── 6. The count may not overstate what it knows ────────────────────────── */
await load("fullPage");
check(
  "a full page back is disclosed as capped, not as a total",
  (await page.locator(CAP).count()) === 1,
  await textOf(CAP),
);
check("…and the count badge says 'at least'", (await textOf(COUNT_BADGE)).includes("+"), await textOf(COUNT_BADGE));

await load("systemOnly");
check("a short page makes no cap claim", (await page.locator(CAP).count()) === 0);
check(
  "…and its count badge is exact",
  (await textOf(COUNT_BADGE)) === String(SYSTEM_COUNT),
  await textOf(COUNT_BADGE),
);

/* The cap belongs to the brain-core read, not to the list on screen. A page one
   short of the limit, padded past it by locally-recorded rows, must still read
   as complete — otherwise the page invents history that does not exist. */
localQuestions = LOCAL_QUESTIONS;
await load("nearLimit");
check(
  "local rows cannot push a short page over the cap",
  (await page.locator(CAP).count()) === 0,
  `${await rowCount()} rows on screen, ${EVENT_LIMIT - 1} from brain-core`,
);
check(
  "…and the count badge stays exact even though the merged list exceeds the limit",
  !(await textOf(COUNT_BADGE)).includes("+"),
  await textOf(COUNT_BADGE),
);

/* ── 7. Unreachable is not empty ─────────────────────────────────────────── */
/* The nastiest case: the audit read fails but local rows survive it, so the
   list is NOT empty. The empty state never renders, and without an explicit
   notice a couple of browser-recorded questions would sit under copy promising
   "every recorded event on this tenant". */
await load("fail");
check(
  "a failed read with surviving local rows still renders rows",
  (await rowCount()) === LOCAL_QUESTIONS.length,
  `${await rowCount()} rows`,
);
check(
  "…and admits the list is incomplete rather than letting them stand for the trail",
  (await page.locator('[data-testid="notice-audit-unavailable"]').count()) === 1,
  await textOf('[data-testid="notice-audit-unavailable"]'),
);
check(
  "…and drops the completeness claim from the scope copy",
  !/Every recorded event on this tenant/i.test(await textOf('[data-testid="text-audit-scope"]')),
  await textOf('[data-testid="text-audit-scope"]'),
);
check(
  "…and shows no count badge, which would read as a total",
  (await page.locator(COUNT_BADGE).count()) === 0,
  await textOf(COUNT_BADGE),
);
localQuestions = [];

await load("fail");
const failText = await emptyText();
check("a failed audit read says so", /could not read your audit history/i.test(failText), failText);
check(
  "a failed read makes no claim about what the history contains",
  !/no audit records yet|no records match/i.test(failText),
  failText,
);
check("a failed read is not dressed as a filter problem", !/hidden by the type filter/i.test(failText), failText);

await load("empty");
check(
  "a genuinely empty log — and only that — says the log is empty",
  /No audit records yet/i.test(await emptyText()),
  await emptyText(),
);

/* A read still in flight must not resolve the question either way. */
mode = "hang";
await page.goto(`${base}/settings?section=audit`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const pendingText = await emptyText();
check("a pending read says it is loading", /reading your audit history/i.test(pendingText), pendingText);
check("a pending read claims nothing about what is or isn't there", !/no audit records/i.test(pendingText), pendingText);
if (held) {
  await held.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: SYSTEM_ONLY, next_cursor: null }) });
  await page.waitForTimeout(2000);
  check("once the read lands the rows appear", (await rowCount()) === SYSTEM_COUNT, `${await rowCount()} rows`);
}

/* ── 8. The Inbox stays a decision queue ─────────────────────────────────── */
mode = "mixed";
await page.goto(`${base}/inbox`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
check("the Inbox did not inherit the type filter", (await page.locator(FILTER).count()) === 0);
check("the Inbox did not inherit the category badges", (await page.locator(BADGES).count()) === 0);

/* ── 9. The old bookmark still lands somewhere real ──────────────────────── */
await page.goto(`${base}/audit-log`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
check("/audit-log still redirects rather than 404ing", !/page not found/i.test(await page.locator("body").innerText()), page.url());

await finish();
