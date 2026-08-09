/**
 * Verify the restructured Overview and Inbox against a REAL, FRESHLY PROVISIONED
 * tenant.
 *
 * WHY IT LOGS ITSELF IN
 *
 * Every other QA script here takes QA_COOKIE — a session id for an account
 * someone already logged into. That is fine for checking chrome, but it is the
 * wrong instrument for this change. Both new surfaces are built entirely out of
 * live reads (ledger accounts, invoices, obligations, the audit feed), and a
 * long-lived demo tenant has been poked at by earlier runs: it may already hold
 * the decided rows, the acknowledged insights, or the settled history that makes
 * a section appear. Passing against it proves the code runs, not that it renders
 * the right thing for a tenant in a known state.
 *
 * So this script mints its own tenant via POST /api/auth/demo-fresh and drives
 * that. Nothing is pasted into Secrets, the tenant is disposable, and the demo
 * TTL sweeps it up.
 *
 * WHAT "PASS" IS ALLOWED TO MEAN
 *
 * A fresh tenant is a thin tenant. Several of the interesting states here —
 * a stalled agent run, a negative projected balance — cannot be conjured on
 * demand, and a check that quietly turns into `0 === 0` when its data is absent
 * is worse than no check: it reports green forever. So every conditional check
 * is witness-gated. If the data that would make it meaningful is not present,
 * it prints SKIP (not proven) and is counted separately. A run with skips is a
 * run that verified less than it looks like it did.
 *
 *   CHROMIUM=/path/to/chromium PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   node scripts/qa-overview-inbox-restructure.mjs
 */
import { createQaSession } from "./qa-harness.mjs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";

/* ── Fresh tenant ─────────────────────────────────────────────────────────── */

const login = await fetch(`${BASE}/api/auth/demo-fresh`, { method: "POST" });
if (!login.ok) {
  console.error(`FATAL  POST /api/auth/demo-fresh returned ${login.status}. This route 404s when the`);
  console.error("       server is pointed at production tenancy — check brainTenancyMode().");
  process.exit(2);
}
const { user } = await login.json();
const setCookie = login.headers.get("set-cookie") ?? "";
const sid = /brain\.sid=([^;]+)/.exec(setCookie)?.[1];
if (!sid) {
  console.error("FATAL  demo-fresh succeeded but issued no brain.sid cookie.");
  process.exit(2);
}
console.log(`fresh tenant: ${user.email} (${user.id})`);

const { page, base, check, finish } = await createQaSession({
  user: user.id,
  cookie: sid,
  viewport: { width: 1280, height: 1100 },
});

/* Skips are tracked apart from passes so the summary cannot flatter itself. */
const skipped = [];
const skip = (label, why) => {
  console.log(`SKIP  ${label} — ${why}`);
  skipped.push(label);
};

/**
 * Row ROOTS only.
 *
 * `TierRow` stamps its prefix on the container AND on the pieces inside it —
 * `<prefix>-<id>`, `<prefix>-<id>-select`, `<prefix>-<id>-badge`,
 * `<prefix>-<id>-action-<action>`. So a bare `[data-testid^="<prefix>-"]`
 * matches one row three or four times, and any count taken from it is silently
 * a multiple of the truth. Excluding the known suffixes keeps counts honest.
 */
const ROW_ROOT_SELECTOR = (prefix) =>
  `[data-testid^="${prefix}-"]:not([data-testid$="-select"]):not([data-testid$="-badge"]):not([data-testid*="-action-"])`;

/**
 * Rows anywhere on the page.
 *
 * NOT section-scoped, and that matters: `toRow` stamps the SAME `row-decision`
 * prefix on every record it builds, so approval rows and awareness rows are
 * indistinguishable by testid. A bare prefix count is therefore a count of both
 * sections, which is right for "does Overview list any rows at all" and wrong
 * for anything asserting what is IN a section — use rowRootsIn for those.
 */
const rowRoots = (prefix) => page.locator(ROW_ROOT_SELECTOR(prefix));

/** Rows inside one named section. */
const rowRootsIn = (sectionTestId, prefix) =>
  page.locator(`[data-testid="${sectionTestId}"]`).locator(ROW_ROOT_SELECTOR(prefix));

const settle = async (locator, tries = 30, gap = 2000) => {
  for (let i = 0; i < tries; i++) {
    if (await locator.first().isVisible().catch(() => false)) return true;
    await page.waitForTimeout(gap);
  }
  return false;
};

/* ── Overview ─────────────────────────────────────────────────────────────── */

await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });

const secondary = page.locator('[data-testid="grid-home-secondary-metrics"]');
check("Overview renders the secondary metric grid", await settle(secondary));

/* ── The headline total must not add up different currencies ──────────────────
   This tenant holds two USD bank accounts and an ETH smart account, and there
   is no FX rate anywhere in the app. The total therefore covers ONE currency and
   has to say what it left out — otherwise it shows a smaller number than the
   tenant's real holdings with no explanation, which reads as a wrong balance.

   Graded against the concentration card, which independently detects the mixed
   currencies. Tying the two together means this check cannot pass by accident on
   a single-currency tenant: it only demands the disclosure when a second
   currency is actually present. */
const accountsCard = page.locator('[data-testid="card-metric-accounts"]');
await settle(accountsCard);
const accountsText = (await accountsCard.innerText()).replace(/\s+/g, " ").trim();
const concentrationText = (await page.locator('[data-testid="card-metric-bank-concentration"]').innerText().catch(() => ""))
  .replace(/\s+/g, " ")
  .trim();
const tenantIsMixedCurrency = /more than one currency/i.test(concentrationText);
console.log(`accounts card >>> ${accountsText}`);

if (tenantIsMixedCurrency) {
  check(
    "a mixed-currency tenant's total names the currency it covers and what it excludes",
    /Excludes \d+ account/i.test(accountsText) && /\bUSD\b|\bEUR\b/.test(accountsText),
    accountsText,
  );
  /* The old total summed ETH units into the dollar figure. That exact number is
     gone, so the presence of a plain unexplained total is itself the regression. */
  check(
    "the total is no longer a bare cross-currency sum",
    !/Across bank, digital, and agent accounts\./.test(accountsText),
    accountsText,
  );
} else {
  skip("the mixed-currency disclosure on the accounts total", "this tenant holds one currency, so there is nothing to exclude");
}

/* The projection card must always resolve to exactly ONE honest state: a chart,
   or a named reason there isn't one. Two at once, or none, is the bug. */
const projectionStates = {
  chart: '[data-testid="chart-cash-projection"]',
  loading: '[data-testid="text-cash-projection-loading"]',
  noBalance: '[data-testid="text-cash-projection-no-balance"]',
  empty: '[data-testid="text-cash-projection-empty"]',
};
/* Wait for LOADING TO CLEAR, not for "a state to appear". The loading line is
   painted on the first frame, so settling on "any of these is visible" resolves
   instantly and grades the spinner — which passes, reports nothing, and hides
   every real check behind a skip. A fresh tenant's ledger takes a while to seed. */
for (let i = 0; i < 45; i++) {
  const stillLoading = await page.locator(projectionStates.loading).isVisible().catch(() => false);
  if (!stillLoading) break;
  await page.waitForTimeout(2000);
}
const shown = [];
for (const [name, sel] of Object.entries(projectionStates)) {
  if (await page.locator(sel).first().isVisible().catch(() => false)) shown.push(name);
}
check("the cash projection card resolves to exactly one state", shown.length === 1, shown.join("+") || "none");

if (shown[0] === "chart") {
  /* The basis caption is the whole reason this card is honest: it is where
     "confirmed" and "projected" are defined in the tenant's own terms. A chart
     without it is two lines the reader has to guess at. */
  const basis = await page.locator('[data-testid="text-cash-projection-basis"]').innerText().catch(() => "");
  check(
    "a drawn projection always states what Confirmed and Projected mean",
    /confirmed/i.test(basis) && /projected/i.test(basis),
    basis.replace(/\s+/g, " ").slice(0, 120),
  );

  const eventChips = page.locator('[data-testid^="row-cash-event-"]');
  const events = await eventChips.count();
  check("a drawn projection lists the events behind it", events > 0, `${events} events`);

  /* The strip has to read along the same axis as the plot above it — that
     alignment is the only reason it is a strip and not a list, so "is it
     actually horizontal" is the check, not "does it have a class". */
  if (events >= 2) {
    const a = await eventChips.nth(0).boundingBox();
    const b = await eventChips.nth(1).boundingBox();
    check(
      "the events read left to right, in one row",
      a && b && b.x > a.x && Math.abs(b.y - a.y) < 4,
      a && b ? `first(${Math.round(a.x)},${Math.round(a.y)}) second(${Math.round(b.x)},${Math.round(b.y)})` : "no boxes",
    );
    /* Certainty is drawn AND written. A dashed border on its own is not a
       label, and this is the field that decides whether the money is real. */
    const chipText = (await eventChips.first().innerText()).replace(/\s+/g, " ").trim();
    check("each event says whether it is confirmed or projected", /confirmed|projected/i.test(chipText), chipText);
  } else {
    skip("the horizontal event strip", `only ${events} event(s) scheduled in this window`);
  }

  const floor = page.locator('[data-testid="callout-cash-projection-floor"]');
  if (await floor.isVisible().catch(() => false)) {
    check("the floor callout names a figure", /\d/.test(await floor.innerText()));
  } else {
    skip("the negative-balance floor callout", "this tenant never dips below zero in the window");
  }
} else {
  skip("the drawn-projection checks", `card resolved to "${shown[0] ?? "none"}" on a fresh tenant`);
}

/* ── Overview must not be a second Inbox ──────────────────────────────────────
   The restructure's whole claim is that Overview COUNTS and the Inbox LISTS. A
   row list, a bulk bar or a detail modal reappearing here is the duplication
   coming back, and it would look entirely reasonable on screen — two plausible
   screens showing the same queue is exactly the failure that shipped before. */
const overviewRowRoots = await rowRoots("row-decision").count();
check("Overview lists no decision rows of its own", overviewRowRoots === 0, `${overviewRowRoots} rows`);
const overviewTierSections = await page.locator('[data-testid^="tier-section-"]').count();
check("Overview renders no tier sections", overviewTierSections === 0, `${overviewTierSections} sections`);
const overviewBulkBar = await page.locator('[data-testid="bulk-bar"]').count();
check("Overview offers no bulk approve", overviewBulkBar === 0, `${overviewBulkBar} bars`);

/* ── Reading order ────────────────────────────────────────────────────────────
   Figures first, then Brain's read of them, then what is waiting, then the
   forecast. Asserted on rendered geometry rather than on source order, because
   flex/grid ordering can move a node without the JSX moving. */
const topOf = async (sel) => {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  return box ? box.y : null;
};
const yMetrics = await topOf('[data-testid="grid-home-secondary-metrics"]');
const yInsight = await topOf('[data-testid="text-home-cash-insight"]');
const ySummary = await topOf('[data-testid="row-home-pending-summary"]');
const yProjection = await topOf('[data-testid="chart-cash-projection"], [data-testid="text-cash-projection-empty"], [data-testid="text-cash-projection-no-balance"]');

if (yMetrics !== null && yInsight !== null && yProjection !== null) {
  check("the metric grids come before Brain's read of them", yMetrics < yInsight, `${yMetrics} < ${yInsight}`);
  check("the cash projection card is last, not first", yInsight < yProjection, `${yInsight} < ${yProjection}`);
  if (ySummary !== null) {
    check("what's waiting sits above the projection card", ySummary < yProjection, `${ySummary} < ${yProjection}`);
    check("what's waiting sits below the metric grids", yMetrics < ySummary, `${yMetrics} < ${ySummary}`);
  }
} else {
  skip("the Overview reading-order checks", "one of the ordered elements did not render on this tenant");
}

/* ── The summary line ─────────────────────────────────────────────────────────
   Two states are legitimate: a count, or nothing at all. What is NOT legitimate
   is silence while a feed is failing, and that state cannot be conjured on a
   healthy tenant — so the absent case is only accepted after confirming the
   Inbox agrees there is nothing outstanding. */
const summary = page.locator('[data-testid="row-home-pending-summary"]');
const summaryVisible = await summary.isVisible().catch(() => false);
let overviewTotal = null;
if (summaryVisible) {
  const text = (await summary.innerText()).replace(/\s+/g, " ").trim();
  console.log(`summary >>> ${text}`);
  check("the summary line states a count", /\d+ items? needs? your attention|couldn't check/i.test(text), text);
  check("the summary line is a control, not a paragraph", (await summary.evaluate((el) => el.tagName)) === "BUTTON");
  const m = /(\d+) items? needs? your attention/i.exec(text);
  overviewTotal = m ? Number(m[1]) : null;
  /* "At least N" is the honest form when a feed was short. Both are acceptable;
     a bare N while something failed is not, and that is unit-tested. */
  if (/at least/i.test(text)) console.log("       (hedged — a contributing feed was unreadable or capped)");
} else {
  skip("the summary line's content", "nothing is waiting on this tenant, so the row is correctly absent");
}

await page.screenshot({ path: "/tmp/qa-overview-restructure.png", fullPage: true });

/* Clicking it must reach the queue it counts. A count with no way through is
   the worst of both designs: it tells you there is work and then strands you. */
if (summaryVisible) {
  await summary.click();
  await page.waitForTimeout(1500);
  check("the summary line opens the Inbox", new URL(page.url()).pathname === "/inbox", page.url());
}

/* ── Inbox ────────────────────────────────────────────────────────────────── */

await page.goto(`${base}/inbox`, { waitUntil: "domcontentloaded" });

const anySection = page.locator(
  '[data-testid="section-needs-decision"], [data-testid="section-needs-input"], [data-testid="section-for-awareness"], [data-testid="text-decisions-empty"]',
);
check("Inbox resolves to either named sections or an explicit empty state", await settle(anySection));

const sectionPresent = async (id) =>
  await page.locator(`[data-testid="${id}"]`).first().isVisible().catch(() => false);

const hasDecision = await sectionPresent("section-needs-decision");
const hasInput = await sectionPresent("section-needs-input");
const hasAwareness = await sectionPresent("section-for-awareness");
console.log(`sections — decision:${hasDecision} input:${hasInput} awareness:${hasAwareness}`);

/* Headings are load-bearing: this whole change is that the queue now says what
   it wants from you. A section rendering without its heading is a regression
   even though every row still works. */
if (hasDecision) {
  const h = await page.locator('[data-testid="heading-needs-decision"]').innerText();
  check("the approval section is labelled", /needs your approval/i.test(h), h);
  const decisionRows = rowRootsIn("section-needs-decision", "row-decision");
  const rows = await decisionRows.count();
  check("the approval section holds rows", rows > 0, `${rows} rows`);

  /* The rebucketing rule, checked where it can actually fail: every row under a
     heading that asks for approval must offer one. An acknowledge-only record
     landing here is the bug this section split was written to remove, and it
     renders perfectly — a tidy row under a heading that is lying about it. */
  let acknowledgeOnlyRows = 0;
  let rowsWithNoDecision = 0;
  for (let i = 0; i < rows; i++) {
    const labels = await decisionRows.nth(i).locator("button").allInnerTexts();
    const flat = labels.join(" ").toLowerCase();
    const decides = /approve|reject|decline/.test(flat);
    if (!decides) rowsWithNoDecision++;
    if (/acknowledge/.test(flat) && !decides) acknowledgeOnlyRows++;
  }
  check(
    "no acknowledge-only record sits under the approval heading",
    acknowledgeOnlyRows === 0,
    `${acknowledgeOnlyRows} of ${rows}`,
  );
  check(
    "every row in the approval section offers an approve or a reject",
    rowsWithNoDecision === 0,
    `${rowsWithNoDecision} of ${rows} had neither`,
  );
} else {
  skip("the decision section", "fresh tenant surfaced no undecided proposals");
}

if (hasInput) {
  const h = await page.locator('[data-testid="heading-needs-input"]').innerText();
  check("the input section is labelled", /needs your input/i.test(h), h);

  const inputRows = rowRoots("row-agent-input");
  const n = await inputRows.count();
  check("the input section holds rows", n > 0, `${n} rows`);

  /* The two rules this section ships under. Neither is cosmetic: a checkbox here
     would feed a stalled run into a bulk APPROVE, and a second action would be
     the per-type route guessing we deliberately deferred. */
  const boxes = await inputRows.locator('input[type="checkbox"]').count();
  check("no row in the input section is bulk-selectable", boxes === 0, `${boxes} checkboxes`);

  let worstActions = 0;
  for (let i = 0; i < n; i++) {
    worstActions = Math.max(worstActions, await inputRows.nth(i).locator("button").count());
  }
  check("each input row offers exactly one action", worstActions === 1, `max ${worstActions} buttons`);

  const first = (await inputRows.first().innerText()).replace(/\s+/g, " ").trim();
  check("an input row reads as a sentence, not a field dump", /couldn't|could not|needs/i.test(first), first.slice(0, 140));
} else {
  skip(
    "the whole Needs-your-input section",
    "no agent.run.missing_evidence event in this tenant's audit feed — the section is unproven on this run",
  );
}

if (hasAwareness) {
  const h = await page.locator('[data-testid="heading-for-awareness"]').innerText();
  check("the awareness section is labelled", /for your awareness/i.test(h), h);

  /* The other half of the rule. Awareness rows may carry Acknowledge — that is
     a write, but it records that you saw something rather than deciding it —
     and must never carry an approve or a reject. */
  const awarenessSection = page.locator('[data-testid="section-for-awareness"]');
  const awarenessButtons = (await awarenessSection.locator("button").allInnerTexts()).join(" ").toLowerCase();
  check(
    "nothing in the awareness section asks to be approved or rejected",
    !/approve|reject|decline/.test(awarenessButtons),
    awarenessButtons.slice(0, 120) || "(no buttons)",
  );
  const boxes = await page
    .locator('[data-testid="section-for-awareness"]')
    .locator('input[type="checkbox"]')
    .count();
  check("no row in the awareness section is bulk-selectable", boxes === 0, `${boxes} checkboxes`);
} else {
  skip("the awareness section", "fresh tenant surfaced no detections");
}

/* ── The two screens must agree ───────────────────────────────────────────────
   Overview prints one number that stands in for this page. If it counts a
   different set — awareness rows included, decided proposals not subtracted —
   both screens still look right on their own and only a tenant comparing them
   would ever find out. */
const inboxCountText = await page.locator('[data-testid="text-decision-count"]').innerText().catch(() => "");
const inboxCount = /^\d+$/.test(inboxCountText.trim()) ? Number(inboxCountText.trim()) : null;
if (overviewTotal !== null && inboxCount !== null) {
  check(
    "Overview's total matches the Inbox's awaiting-you count",
    overviewTotal === inboxCount,
    `overview ${overviewTotal} vs inbox ${inboxCount}`,
  );
} else if (!summaryVisible && inboxCount === 0) {
  check("an absent summary line agrees with an empty Inbox", true, "both zero");
} else {
  skip(
    "the Overview/Inbox count agreement",
    `overview total ${overviewTotal ?? "unread"}, inbox count ${inboxCount ?? "unread"} — one side hedged or did not render`,
  );
}

/* The count row must not silently include awareness rows: those are not asking
   the tenant for anything, and Overview does not count them. */
const approvalRowCount = await rowRootsIn("section-needs-decision", "row-decision").count();
const inputRowCount = await rowRoots("row-agent-input").count();
if (inboxCount !== null) {
  check(
    "the awaiting-you count is exactly the approval and input rows",
    inboxCount === approvalRowCount + inputRowCount,
    `${inboxCount} vs ${approvalRowCount}+${inputRowCount}`,
  );
} else {
  skip("the awaiting-you count composition", "the count pill did not render");
}

await page.screenshot({ path: "/tmp/qa-inbox-restructure.png", fullPage: true });

/* Resolved is deliberately NOT sectioned — it is history, nothing is being asked.
   Worth pinning, because "apply the new grouping everywhere" is the obvious
   wrong follow-up. */
/* By testid, NOT by text: `has-text("Resolved")` is a substring match, so it
   selects the "Unresolved" chip too — and that chip comes first, so `.first()`
   clicks the tab you are already on and the check silently grades nothing. */
const resolvedTab = page.locator('[data-testid="tab-inbox-resolved"]').first();
if (await resolvedTab.isVisible().catch(() => false)) {
  await resolvedTab.click();
  await page.waitForTimeout(2500);
  const stillSectioned =
    (await sectionPresent("section-needs-decision")) ||
    (await sectionPresent("section-needs-input")) ||
    (await sectionPresent("section-for-awareness"));
  check("the Resolved tab is not grouped into the 'needs you' sections", !stillSectioned);
} else {
  skip("the Resolved tab check", "no Resolved tab rendered");
}

/* ── Needs-your-input, with an injected witness ───────────────────────────────
   A fresh tenant has no stalled agent run, and one cannot be manufactured
   without actually breaking an agent. That left the section's rendering rules
   unproven above — so this pass supplies the witness by APPENDING one synthetic
   `agent.run.missing_evidence` event to the real audit feed on its way to the
   browser.

   This is a read interception, not a write: nothing is sent to brain-core and
   the tenant is untouched. It proves what a fixture in a unit test cannot —
   that the live query wiring, the parser, the row model and the two rules this
   section ships under (no checkbox, exactly one action) hold together in the
   real page. The payload deliberately uses the raw id spellings brain-core
   emits, so name-resolution is visibly absent rather than accidentally faked. */
await page.unrouteAll?.({ behavior: "ignoreErrors" }).catch(() => {});
await page.route("**/api/brain/audit/events*", async (route) => {
  const res = await route.fetch();
  let body;
  try {
    body = await res.json();
  } catch {
    body = { events: [], next_cursor: null };
  }
  const real = Array.isArray(body?.events) ? body.events : [];
  const witness = {
    id: "evt_qa_missing_evidence",
    tenant_id: real[0]?.tenant_id ?? "tnt_qa",
    layer: "agent",
    actor: "agent:payment",
    action: "agent.run.missing_evidence",
    event_type: "system_activity",
    inputs: { trigger_event: "invoice.received" },
    outputs: {
      run_id: "run_01QAQAQAQAQAQAQAQAQAQAQAQA",
      action: "payment.execute",
      missing_required_evidence: ["payment_destination", "approval_policy_match"],
      entity_refs: ["cp_01KZQA0000000000000000AA", "obl_01KZQA1111111111111111BB"],
    },
    policy_version: null,
    event_hash: "qa-witness",
    prev_event_hash: null,
    created_at: new Date().toISOString(),
  };
  await route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, events: [witness, ...real] }),
  });
});

await page.goto(`${base}/inbox`, { waitUntil: "domcontentloaded" });
const injectedSection = page.locator('[data-testid="section-needs-input"]');
const injectedVisible = await settle(injectedSection, 20, 1500);
check("an agent.run.missing_evidence event renders the Needs-your-input section", injectedVisible);

if (injectedVisible) {
  const rows = rowRoots("row-agent-input");
  const n = await rows.count();
  check("the stalled run becomes exactly one row", n === 1, `${n} rows`);

  const text = (await rows.first().innerText()).replace(/\s+/g, " ").trim();
  console.log("row >>>", text);

  /* The sentence is the point of the row: the tenant should learn what stopped
     and what is missing without decoding a field name. */
  check("the row names what the agent was trying to do", /pay|payment/i.test(text), text.slice(0, 100));
  check(
    "the row names the missing facts in plain language",
    /payment destination/i.test(text) && !/payment_destination/.test(text),
    text.slice(0, 160),
  );

  /* Known limitation, asserted so it stays a KNOWN one: refs render raw. If a
     future change resolves them to names, this fails and the note gets updated
     rather than quietly going stale. */
  check("entity refs render as raw ids behind a kind label", /cp_01KZQA/.test(text), "documented gap");

  const boxes = await rows.locator('input[type="checkbox"]').count();
  check("a stalled run is never bulk-selectable", boxes === 0, `${boxes} checkboxes`);

  const buttons = await rows.first().locator("button").count();
  check("a stalled run offers exactly one action", buttons === 1, `${buttons} buttons`);

  await page.screenshot({ path: "/tmp/qa-inbox-needs-input.png", fullPage: true });
}

if (skipped.length > 0) {
  console.log(`\n${skipped.length} check(s) were NOT proven on this tenant:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

await finish();
