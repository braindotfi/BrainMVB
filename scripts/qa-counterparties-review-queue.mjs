/**
 * Counterparties review-queue QA.
 *
 * WHAT THIS GUARDS
 *
 * This screen shipped with two different definitions of "needs review": a red
 * banner counted one set of rows, the Needs Review chip filtered another. So
 * the page warned you about nine vendors and then, when you clicked through to
 * look at them, showed you a different list. A warning that points at rows the
 * filter refuses to show is worse than no warning — it teaches the user the
 * number is noise.
 *
 * The fix was to derive the badge and the list from ONE predicate. That is a
 * structural property, and `brainVendors.test.ts` pins it at the unit level.
 * But the unit test only proves the two numbers agree in a pure function; it
 * cannot prove the component actually renders the rows it counted, that the
 * banner is really gone, or that the count rescopes when the segment changes.
 * Those are facts about the DOM, so this checks the DOM.
 *
 * It also pins the honesty rules the redesign turns on: a zero-payment row must
 * read "No payments yet" rather than "$0.00" (a real zero and no data are
 * different facts), and the Trusted tab must say trust-granting is unavailable
 * rather than implying the user simply has not got there yet.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-counterparties-review-queue.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server; take
 * it from a browser session or a curl login jar. Never commit one.
 */

import { createQaSession } from "./qa-harness.mjs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";

const { page, check, finish, permitWrite } = await createQaSession();

const go = async (path, settle = 2400) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};
const count = (sel) => page.locator(sel).count();
const ROWS = '[data-testid^="row-vendor-"]';
const BADGE = '[data-testid="tab-vendor-needs-review-count"]';

const badgeValue = async () => {
  if ((await count(BADGE)) !== 1) return null;
  const raw = (await page.locator(BADGE).innerText()).trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
};

/* Click a chip and let the list re-render. Chips are buttons, not links, so
   there is no navigation to wait on. */
const clickChip = async (testid) => {
  await page.locator(`[data-testid="${testid}"]`).click();
  await page.waitForTimeout(400);
};

/* ── The canonical route, and the one that predates the rename ───────────── */

await go("/ledger?tab=counterparties");
check(
  "canonical ?tab=counterparties opens the counterparties panel",
  (await count('[data-testid="tab-vendor-needs-review"]')) === 1,
);

/* Links emitted before the rename (bookmarks, older assistant citations, the
   audit log's vendor references) must keep working rather than silently
   dropping the user on a different tab. */
await go("/ledger?tab=vendors");
check(
  "legacy ?tab=vendors still resolves to the same panel",
  (await count('[data-testid="tab-vendor-needs-review"]')) === 1,
);

await go("/ledger?tab=counterparties");

/* ── The banner is gone for good ─────────────────────────────────────────── */

check(
  "the old new-vendors banner is not rendered",
  (await count('[data-testid="notice-new-vendors"]')) === 0,
);

/* ── The badge counts exactly the rows it opens ──────────────────────────── */

for (const segment of ["vendor", "customer"]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);
  await clickChip("tab-vendor-needs-review");

  const badge = await badgeValue();
  const rows = await count(ROWS);
  check(
    `${segment}s: Needs Review badge equals the rows it shows`,
    badge !== null && badge === rows,
    `badge=${badge} rows=${rows}`,
  );

  /* The badge is the only attention signal left, so it has to stay readable
     from the other filters — that is the job the banner used to do. Read it
     from Trusted rather than Suggested: Suggested is hidden while its bucket is
     empty, so it is not a chip this loop can rely on being there. */
  await clickChip("tab-vendor-trusted");
  const badgeFromSettled = await badgeValue();
  check(
    `${segment}s: badge stays visible and unchanged from another filter`,
    badgeFromSettled === badge,
    `needs-review=${badge} from-trusted=${badgeFromSettled}`,
  );

  /* And it must describe THIS segment. A count that silently includes the other
     side of the split is the same class of lie as the old banner. */
  await clickChip("tab-vendor-needs-review");
  const reasons = await count('[data-testid="chip-review-reason"]');
  check(
    `${segment}s: every queued row explains why it is queued`,
    reasons === rows,
    `rows=${rows} reasons=${reasons}`,
  );
}

/* Cross-check that the split actually splits. Comparing counts would only prove
   the two numbers differ; compare the row IDENTITIES instead, so a row leaking
   into both segments is caught even if the totals happen to look plausible.
   Row ids are stable and one counterparty has one type, so this stays true even
   if a freshly-seeded tenant grows more rows between the two captures. */
const rowIds = async () =>
  new Set(
    (await page.locator(ROWS).evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-testid")),
    )).filter(Boolean),
  );

await go("/ledger?tab=counterparties");
await clickChip("segment-vendor");
await clickChip("tab-vendor-needs-review");
const vendorIds = await rowIds();
await clickChip("segment-customer");
const customerIds = await rowIds();
const overlap = [...vendorIds].filter((id) => customerIds.has(id));
check(
  "no counterparty appears in both segments' queues",
  vendorIds.size > 0 && customerIds.size > 0 && overlap.length === 0,
  `vendors=${vendorIds.size} customers=${customerIds.size} overlap=[${overlap.join(", ")}]`,
);

/* ── Reason chips belong to the queue only ───────────────────────────────── */

await go("/ledger?tab=counterparties");
await clickChip("tab-vendor-trusted");
check(
  "settled rows carry no review reason",
  (await count('[data-testid="chip-review-reason"]')) === 0,
);

/* ── Honest copy ─────────────────────────────────────────────────────────── */

await clickChip("tab-vendor-trusted");
const trustedText = await page.locator('[data-testid="list-counterparties"]').innerText();
const trustedRows = await count(ROWS);
// Trust actions are now live. An empty Trusted list is genuinely empty, not
// "unavailable". Verify the old "isn't available yet" copy is gone.
check(
  "Trusted tab: trust actions are live, no unavailability disclaimer",
  !/isn't available yet/i.test(trustedText),
  trustedText.replace(/\n+/g, " | ").slice(0, 160),
);

await clickChip("tab-vendor-needs-review");
const queueText = await page.locator('[data-testid="list-counterparties"]').innerText();
check(
  "a row with no payments says so instead of showing $0.00",
  !/\$0\.00/.test(queueText),
  queueText.replace(/\n+/g, " | ").slice(0, 200),
);

/* ── The add box follows the tabs, before the records label ──────────────── */

const listBox = await page.locator('[data-testid="list-counterparties"]').boundingBox();
const addBox = await page.locator('[data-testid="panel-add-vendor-idle"]').boundingBox();
check(
  "the add box sits below the tabs and above the records label",
  listBox && addBox && addBox.y < listBox.y,
  `add.y=${addBox?.y} list.y=${listBox?.y}`,
);

/* ── The segment renames labels, never state ─────────────────────────────────
   Vendors say "Trusted", customers say "Confirmed", and both chips carry the
   SAME value — so a segment switch cannot silently reinterpret which rows the
   user is looking at. Reading the label off a chip located by its stable test
   id is what proves the rename is cosmetic. */

const chipLabel = async (testid) => {
  const el = page.locator(`[data-testid="${testid}"]`);
  return (await el.count()) === 1 ? (await el.innerText()).trim() : null;
};

await go("/ledger?tab=counterparties");
await clickChip("segment-vendor");
check(
  "vendors call the settled tier Trusted",
  (await chipLabel("tab-vendor-trusted")) === "Trusted",
  `label=${await chipLabel("tab-vendor-trusted")}`,
);

await clickChip("segment-customer");
check(
  "customers call the same tier Confirmed, on the same chip",
  (await chipLabel("tab-vendor-trusted")) === "Confirmed",
  `label=${await chipLabel("tab-vendor-trusted")}`,
);

/* The Paused tab is now always visible on BOTH segments (showPaused is an
   unconditional true). Customers can be paused exactly like vendors, and hiding
   the tab while empty made pausing look like a vendors-only feature during the
   normal case where nothing is paused. This assertion used to require the chip
   to be ABSENT on Customers; it outlived that policy and would now fail on every
   run, so it is inverted to match. */
await clickChip("tab-vendor-needs-review");
const pausedOnCustomers = await count('[data-testid="tab-vendor-paused"]');
check(
  "the Paused chip is present on Customers, empty or not",
  pausedOnCustomers === 1,
  `paused chips on customers=${pausedOnCustomers}`,
);

await clickChip("segment-vendor");
check(
  "the Paused chip is present on Vendors",
  (await count('[data-testid="tab-vendor-paused"]')) === 1,
);

/* Suggested is hidden on BOTH segments while nothing can reach the tier —
   nothing upstream marks a counterparty as Brain-suggested yet. The moment
   something does, the chip must come back, so this asserts the pairing (chip
   present iff it has rows) rather than hard-coding "always absent". */
for (const segment of ["vendor", "customer"]) {
  await clickChip(`segment-${segment}`);
  const suggestedChips = await count('[data-testid="tab-vendor-suggested"]');
  let suggestedRows = null;
  if (suggestedChips === 1) {
    await clickChip("tab-vendor-suggested");
    suggestedRows = await count(ROWS);
    await clickChip("tab-vendor-needs-review");
  }
  check(
    `${segment}s: the Suggested chip is shown only when it has rows`,
    suggestedChips === 0 || suggestedRows > 0,
    `chip=${suggestedChips} rows=${suggestedRows}`,
  );
}

/* Selecting a chip the other segment does not offer must not leave the list
   showing a tier no chip is highlighting.

   The probe chip is DERIVED, never named. This check used to hardcode Paused as
   its example of a segment-only chip. When Paused became unconditional the app
   was correct to keep it selected across the switch, and the check failed the
   app for doing the right thing. Which chips are conditional is a product
   decision that will keep moving (today: Suggested and Informational, both
   hidden while their bucket is empty), so ask the page rather than assume.

   Two properties, and the one that matters most always runs: whatever the
   segment switch does, exactly one chip must be selected and that chip must be
   on screen. A selection pointing at a chip nobody can see is the actual bug —
   the list then shows a tier with nothing highlighting it. The narrower
   fallback-to-Needs-Review assertion only runs when a genuinely segment-only
   chip exists to trigger it, and says so out loud when none does. */
const CHIP = '[data-testid^="tab-vendor-"]:not([data-testid$="-count"])';
const visibleChipIds = () =>
  page.locator(CHIP).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
const pressedChipIds = () =>
  page
    .locator('[data-testid^="tab-vendor-"][aria-pressed="true"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));

await clickChip("segment-vendor");
const vendorChips = await visibleChipIds();
await clickChip("segment-customer");
const customerChips = await visibleChipIds();
const vendorOnlyChips = vendorChips.filter((id) => !customerChips.includes(id));

const stranded = [];
for (const chipId of vendorChips) {
  await clickChip("segment-vendor");
  await clickChip(chipId);
  await clickChip("segment-customer");
  const pressed = await pressedChipIds();
  const visible = await visibleChipIds();
  if (pressed.length !== 1 || !visible.includes(pressed[0])) {
    stranded.push(`${chipId} → pressed=[${pressed.join(", ")}]`);
  }
}
check(
  "after a segment switch, exactly one chip is selected and it is on screen",
  vendorChips.length > 0 && stranded.length === 0,
  stranded.length ? stranded.join("; ") : `checked ${vendorChips.length} chips`,
);

if (vendorOnlyChips.length === 0) {
  console.log(
    "SKIP  segment-only chip falls back to Needs Review — no chip is exclusive to Vendors on this tenant",
  );
} else {
  await clickChip("segment-vendor");
  await clickChip(vendorOnlyChips[0]);
  await clickChip("segment-customer");
  const pressed = await pressedChipIds();
  check(
    "switching away from a segment-only chip falls back to Needs Review",
    pressed.length === 1 && pressed[0] === "tab-vendor-needs-review",
    `chip=${vendorOnlyChips[0]} pressed=[${pressed.join(", ")}]`,
  );
}

/* ── The add box follows the segment ─────────────────────────────────────────
   The create route accepts customers, so an add box that says "vendor" on the
   Customers segment would be describing a different write than the one it
   performs. */
const addBoxText = async () =>
  (await page.locator('[data-testid="panel-add-vendor-idle"]').innerText()).toLowerCase();

check(
  "the add box asks for a customer on the Customers segment",
  /customer/.test(await addBoxText()) && !/vendor/.test(await addBoxText()),
  (await addBoxText()).replace(/\n+/g, " | ").slice(0, 120),
);

await clickChip("segment-vendor");
check(
  "the add box asks for a vendor on the Vendors segment",
  /vendor/.test(await addBoxText()) && !/customer/.test(await addBoxText()),
  (await addBoxText()).replace(/\n+/g, " | ").slice(0, 120),
);

/* ── The detail popup tells the same story as the list ───────────────────────
   Trust routes are live (brain-core PRs #397/#403, GIT deedc628). Verify the
   popup's actions are enabled — not the old disabled placeholders — and that
   the "unavailable" note copy is absent. */

const POPUP = '[data-testid="vendor-detail-popup-content"]';
/* Trust actions that may render in the Needs Review popup (unreviewed rows only).
   paused rows live in the Paused tab — their restore button is checked separately.
   trusted rows live in the Trusted tab — their pause button is not checked here. */
const TRUST_ACTIONS = [
  "button-grant-trust",
  "button-pause-counterparty",
  "button-acknowledge-counterparty",
];

const openFirstRow = async () => {
  const rows = page.locator(ROWS);
  if ((await rows.count()) === 0) return false;
  await rows.first().click();
  await page.waitForTimeout(600);
  return (await count(POPUP)) === 1;
};
const closePopup = async () => {
  const btn = page.locator('[data-testid="button-close-vendor-popup"]');
  if ((await btn.count()) === 1) await btn.click();
  await page.waitForTimeout(300);
};

/* Open the first row in the current list that can actually perform `testid`,
   and return its text.

   Taking ROWS.first() and assuming its state is what let three separate checks
   here fail while the app was correct. The Needs Review queue is NOT
   homogeneous: a high/sanctioned risk_level keeps a row queued no matter what
   the user has already decided, so the queue accumulates rows that are trusted
   or acknowledged already and offer a different action set. Every earlier run
   happened to find an ordinary unreviewed row first; once earlier steps had
   consumed those, the assumption surfaced as three false failures at once.

   Selecting by the action the check needs makes each step state-independent. */
/* How many counterparties of this segment are still awaiting a first decision,
   read from the API rather than inferred from the DOM.

   Without it, "no row offers a grant button" is ambiguous, and the two readings
   are opposites: the control could be broken, or the tenant could simply be
   spent. Steps 1 and 4 of the transition walk consume a row permanently on every
   run (grant and acknowledge have no inverse, unlike pause/restore), so
   exhaustion is the normal end state of a long-lived demo tenant and must not
   report as a product bug — while a missing control on a tenant that DOES have
   an eligible row must not be softened into a skip. */
const unreviewedCount = async (segType) => {
  const res = await page.request.get(`${BASE}/api/brain/ledger/counterparties`);
  if (!res.ok()) return null;
  const body = await res.json().catch(() => null);
  if (!body) return null;
  const rows = Array.isArray(body) ? body : (body.counterparties ?? body.data ?? body.items ?? []);
  if (!Array.isArray(rows)) return null;
  return rows.filter(
    (r) => r.type === segType && (r.trust_status ?? r.trustStatus) === "unreviewed",
  ).length;
};

/* Report a row the script could not find, splitting "tenant is spent" from
   "the control is gone". An unreadable API is neither — it fails, because a
   read that did not happen cannot clear anything. */
const reportNoEligibleRow = async (label, segType, detail) => {
  const remaining = await unreviewedCount(segType);
  if (remaining === 0) {
    console.log(
      `SKIP  ${label} — no unreviewed ${segType} left on this tenant. Steps 1 and 4 ` +
        "consume one row each per run and cannot be undone; re-provision to exercise this.",
    );
    return;
  }
  check(
    label,
    false,
    remaining === null
      ? `${detail}; could not read the counterparties feed to tell exhaustion from a regression`
      : `${detail}; ${remaining} unreviewed ${segType}(s) exist, so this is not tenant exhaustion`,
  );
};

const openRowOffering = async (testid, max = 12) => {
  const total = Math.min(await count(ROWS), max);
  for (let i = 0; i < total; i += 1) {
    const row = page.locator(ROWS).nth(i);
    const text = (await row.innerText()).replace(/\n+/g, " | ");
    await row.click();
    await page.waitForTimeout(600);
    let matched = false;
    try {
      const btn = page.locator(`[data-testid="${testid}"]`);
      matched =
        (await count(POPUP)) === 1 &&
        (await btn.count()) === 1 &&
        !(await btn.first().isDisabled());
    } catch {
      /* A probe that threw is not a match. Falling through to closePopup keeps a
         half-open popup from stacking onto the next row's click. */
      matched = false;
    }
    if (matched) return text;
    await closePopup();
  }
  return null;
};

for (const segment of ["vendor", "customer"]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);
  await clickChip("tab-vendor-needs-review");

  /* These checks describe the popup of a row awaiting a decision, so pick a row
     that is actually awaiting one. A risk-flagged row stays in this queue after
     it has been actioned, and its popup offers a different action set — asking
     it for a Pause button fails the app for the queue's own composition. */
  if ((await openRowOffering("button-grant-trust")) === null) {
    await reportNoEligibleRow(
      `${segment}s: a queued row awaiting a decision opens its detail popup`,
      segment,
      `no row in the queue (${await count(ROWS)}) offers an enabled grant action`,
    );
    continue;
  }

  /* At least one trust action must be live (enabled) in the popup now that
     brain-core trust routes are deployed. */
  const liveActions = [];
  for (const id of TRUST_ACTIONS) {
    const el = page.locator(`[data-testid="${id}"]`);
    if ((await el.count()) === 1 && !(await el.first().isDisabled())) liveActions.push(id);
  }
  check(
    `${segment}s: the popup has at least one live trust action`,
    liveActions.length > 0,
    `enabled=[${liveActions.join(", ")}]`,
  );

  /* The old "unavailable" note is gone — actions are live. */
  check(
    `${segment}s: the popup has no unavailability disclaimer`,
    (await count('[data-testid="text-review-actions-unavailable"]')) === 0,
  );

  const popupText = await page.locator(POPUP).innerText();

  /* One word per state. "Reject" and "Flag" were both second names for the paused
     state, and two words for one state is how a queue starts disagreeing with
     itself. The state is now named after the verb that writes it (/trust/pause),
     which also frees "flag" for the per-counterparty anomaly signals that already
     own the word further down this same popup. */
  check(
    `${segment}s: the popup says Pause — never Reject, never Flag`,
    !/reject/i.test(popupText) &&
      (await count('[data-testid="button-reject-vendor"]')) === 0 &&
      (await count('[data-testid="button-pause-trust"], [data-testid="button-pause-counterparty"]')) > 0,
    popupText.replace(/\n+/g, " | ").slice(0, 200),
  );

  /* The popup inherits the segment's vocabulary from the row that opened it —
     a customer's popup calling them a vendor would undo the rename one click in. */
  const otherNoun = segment === "vendor" ? /\bcustomer/i : /\bvendor/i;
  check(
    `${segment}s: the popup uses this segment's noun`,
    !otherNoun.test(popupText),
    popupText.replace(/\n+/g, " | ").slice(0, 200),
  );

  /* The heading is the largest text on the popup and it used to derive itself
     from trustStatus, which reports "trusted" before it has looked at risk — so
     it could read "Trusted Vendor" directly above a chip reading "Needs Review".
     It is derived from the same tier predicate as the chip now. These rows were
     opened from the Needs Review tab, so a settled word in the heading is that
     bug returning. */
  const popupTitle = (
    await page.locator('[data-testid="text-vendor-popup-title"]').innerText()
  ).trim();
  const settledWord = segment === "vendor" ? /trusted/i : /confirmed/i;
  check(
    `${segment}s: a queued row's heading claims no settled state`,
    /^(Review|New) /.test(popupTitle) && !settledWord.test(popupTitle),
    `title="${popupTitle}"`,
  );

  await closePopup();
}

/* And the grant action is worded per segment: "Trust" for people we pay,
   "Confirm" for people who pay us — the same alias the chip uses. */
for (const [segment, expected] of [
  ["vendor", /^Trust Vendor$/],
  ["customer", /^Confirm Customer$/],
]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);
  await clickChip("tab-vendor-needs-review");

  /* A wording regression that only shows up on a populated tenant is exactly
     what this check exists to catch, so a missing row is never a quiet pass —
     but it is a FAILURE only when an eligible row actually exists. */
  if ((await openRowOffering("button-grant-trust")) === null) {
    await reportNoEligibleRow(
      `${segment}s: the grant action is worded for this segment`,
      segment,
      "no queued row offers an enabled grant action",
    );
    continue;
  }

  // button-trust-vendor-review is the legacy test ID used when under_review had its own label.
  // Both resolve to the same grant endpoint now; keep the selector broad so either works.
  const grant = page.locator(
    '[data-testid="button-grant-trust"], [data-testid="button-trust-vendor-review"]',
  );
  const label = (await grant.count()) >= 1 ? (await grant.first().innerText()).trim() : null;
  check(
    `${segment}s: the grant action is worded for this segment`,
    label !== null && expected.test(label),
    `label=${label ?? "no grant action rendered"}`,
  );
  // Trust routes are live — the grant button must not be disabled.
  const grantEnabled =
    label !== null && (await grant.first().isEnabled().catch(() => false));
  check(
    `${segment}s: the grant action is enabled (trust routes live)`,
    grantEnabled,
    grantEnabled ? "enabled" : label === null ? "button not found" : "button is disabled",
  );
  await closePopup();
}

/* ── Paused tab: the restore path must be live, not a placeholder ───────────
   paused → trusted via /trust/restore is the only transition that requires a
   row to have been actioned once already, so it is the likeliest to silently
   rot. This is a read-only inspection (no write): open the first Paused row
   and prove the restore button is rendered AND enabled, with no stale
   "unavailable" disclaimer left over from the pre-trust-routes era.

   The Paused chip is rendered unconditionally, so its presence says nothing
   about whether any row is paused — only an empty LIST does. */

for (const segment of ["vendor", "customer"]) {
  await go("/ledger?tab=counterparties");
  await clickChip(`segment-${segment}`);

  /* An absent chip is therefore not "no paused rows" — it means the selector
     stopped matching the app, which is exactly the rot that let three stale
     assertions survive in this file unnoticed. Fail loudly; never skip. */
  if ((await count('[data-testid="tab-vendor-paused"]')) === 0) {
    check(
      `${segment}s: the Paused chip is reachable by its testid`,
      false,
      "tab-vendor-paused matched nothing — renamed testid?",
    );
    continue;
  }

  await clickChip("tab-vendor-paused");
  const pausedRows = await count(ROWS);
  if (pausedRows === 0) {
    /* The honest skip: nothing is paused on this tenant yet. It does not leave
       the restore path unproven — the transition walk below pauses a row itself
       and drives paused → restore end to end. */
    console.log(
      `SKIP  ${segment}s: Paused tab restore-path check — Paused list is empty (no paused rows on this tenant)`,
    );
    continue;
  }

  if (!(await openFirstRow())) {
    check(`${segment}s: a paused row opens its detail popup`, false, "popup did not open");
    continue;
  }

  const restoreBtn = page.locator('[data-testid="button-restore-trust"]');
  const restorePresent = (await restoreBtn.count()) === 1;
  check(
    `${segment}s: the Paused popup renders the restore action`,
    restorePresent,
  );

  if (restorePresent) {
    const restoreEnabled = await restoreBtn.isEnabled().catch(() => false);
    check(
      `${segment}s: the restore action is enabled (trust routes live)`,
      restoreEnabled,
      restoreEnabled ? "enabled" : "button is disabled",
    );
  }

  /* The disabled-placeholder era shipped an "unavailable" note alongside the
     dead buttons. Both the test-id'd note and its copy must be gone. */
  const pausedPopupText = await page.locator(POPUP).innerText();
  check(
    `${segment}s: the Paused popup has no unavailability disclaimer`,
    (await count('[data-testid="text-review-actions-unavailable"]')) === 0 &&
      !/isn't available yet|unavailable/i.test(pausedPopupText),
    pausedPopupText.replace(/\n+/g, " | ").slice(0, 200),
  );

  await closePopup();
}

/* ── End-to-end trust transition walkthrough ─────────────────────────────────
   Exercises all four real backend calls in sequence against a live demo tenant.
   Each `permitWrite` declaration scopes the write to exactly one button click so
   the write-guard still catches anything the script does NOT intend.

   Sequence:
     1. unreviewed → trusted    via /trust/grant       (Needs Review → Trusted tab)
     2. trusted    → paused     via /trust/pause        (Trusted → Paused tab)
     3. paused     → trusted    via /trust/restore      (Paused → Trusted tab)
     4. any        → acknowledged  via /trust/acknowledge (Needs Review → gone)

   If the Needs Review queue is empty the whole block is skipped with a clear
   note — never a false pass. */

await go("/ledger?tab=counterparties");
await clickChip("segment-vendor");
await clickChip("tab-vendor-needs-review");

const needsReviewCount = await count(ROWS);
if (needsReviewCount === 0) {
  check(
    "trust-transition walkthrough: Needs Review has rows to work with",
    false,
    "queue is empty — demo tenant may need re-provisioning",
  );
} else {
  /* ── Step 1: unreviewed → trusted (grant) ─────────────────────────────── */
  /* Selected by the action this step needs, not by position. */
  const grantRowText = await openRowOffering("button-grant-trust");
  const popupOpen = grantRowText !== null && (await count(POPUP)) === 1;
  if (!popupOpen) {
    await reportNoEligibleRow(
      "trust-transition: a Needs Review row offering grant opens its popup",
      "vendor",
      "no queued row offers an enabled grant action",
    );
  } else {
    const grantBtn = page.locator('[data-testid="button-grant-trust"]');
    const grantExists = (await grantBtn.count()) === 1;
    check(
      "trust-transition 1/4: grant button is present in Needs Review popup",
      grantExists,
    );

    if (grantExists) {
      await permitWrite(
        /\/trust\/grant/,
        "step 1: unreviewed → trusted",
        async () => {
          await grantBtn.click();
          /* Wait for the list to invalidate and re-render. */
          await page.waitForTimeout(2000);
        },
      );

      await clickChip("tab-vendor-needs-review");
      await page.waitForTimeout(400);
      const stillInQueue = await count(ROWS);
      /* Granting trust does not clear a risk-marked row. isNeedsReview gives a
         high/sanctioned risk_level precedence over trust state, so the row stays
         queued until the risk itself is answered — trusting a counterparty is
         not a reply to a sanctions hit. "Grant empties the row out of the queue"
         is a rule that only ever held for ordinary rows. */
      const grantRowRisky = /risk:\s*(high|sanction)/i.test(grantRowText ?? "");
      check(
        grantRowRisky
          ? "trust-transition 1/4: granted — a risk-marked row correctly stays in Needs Review"
          : "trust-transition 1/4: unreviewed → trusted (grant) — row left Needs Review",
        grantRowRisky ? stillInQueue === needsReviewCount : stillInQueue < needsReviewCount,
        `risk=${grantRowRisky} before=${needsReviewCount} after=${stillInQueue}`,
      );

      await clickChip("tab-vendor-trusted");
      await page.waitForTimeout(400);
      const trustedCount = await count(ROWS);
      check(
        "trust-transition 1/4: unreviewed → trusted (grant) — row appears in Trusted tab",
        trustedCount > 0,
        `trusted-tab rows: ${trustedCount}`,
      );

      /* ── Step 2: trusted → paused ─────────────────────────────────────── */
      if (trustedCount > 0) {
        /* Select by action here too. The Trusted tab is known-good at this point
           (step 1 just put a row in it), but the first row is not necessarily
           the row step 1 granted, and a positional pick is the exact assumption
           that made three other checks fail on a queue that had drifted. */
        const pauseRowText = await openRowOffering("button-pause-trust");
        const pauseExists = pauseRowText !== null;
        const pauseBtn = page.locator('[data-testid="button-pause-trust"]');
        check(
          "trust-transition 2/4: pause button is present in Trusted popup",
          pauseExists,
        );

        if (pauseExists) {
          await permitWrite(
            /\/trust\/pause/,
            "step 2: trusted → paused",
            async () => {
              await pauseBtn.click();
              await page.waitForTimeout(2000);
            },
          );

          await clickChip("tab-vendor-trusted");
          await page.waitForTimeout(400);
          const trustedAfterPause = await count(ROWS);
          check(
            "trust-transition 2/4: trusted → paused — row left Trusted tab",
            trustedAfterPause < trustedCount,
            `before=${trustedCount} after=${trustedAfterPause}`,
          );

          /* The Paused chip is unconditional, and a row was just paused, so at
             this point it must be both present and populated. Treating its
             absence as "nothing to check" would silently swallow the whole
             restore path — steps 2 and 3 both hang off this branch. */
          const pausedChipExists = (await count('[data-testid="tab-vendor-paused"]')) === 1;
          check(
            "trust-transition 2/4: the Paused chip is present after a pause",
            pausedChipExists,
            pausedChipExists ? "" : "tab-vendor-paused matched nothing — renamed testid?",
          );
          if (pausedChipExists) {
            await clickChip("tab-vendor-paused");
            await page.waitForTimeout(400);
            const pausedCount = await count(ROWS);
            check(
              "trust-transition 2/4: trusted → paused — row appears in Paused tab",
              pausedCount > 0,
              `paused-tab rows: ${pausedCount}`,
            );

            /* ── Step 3: paused → trusted (restore) ──────────────────── */
            if (pausedCount > 0) {
              await page.locator(ROWS).first().click();
              await page.waitForTimeout(600);

              const restoreBtn = page.locator('[data-testid="button-restore-trust"]');
              const restoreExists = (await restoreBtn.count()) === 1;
              check(
                "trust-transition 3/4: restore button is present in Paused popup",
                restoreExists,
              );

              if (restoreExists) {
                const restoreEnabled = await restoreBtn.isEnabled().catch(() => false);
                check(
                  "trust-transition 3/4: restore button is enabled (not disabled placeholder)",
                  restoreEnabled,
                );

                if (restoreEnabled) {
                  await permitWrite(
                    /\/trust\/restore/,
                    "step 3: paused → trusted",
                    async () => {
                      await restoreBtn.click();
                      await page.waitForTimeout(2000);
                    },
                  );

                  const pausedChipGone = (await count('[data-testid="tab-vendor-paused"]')) === 0;
                  const pausedAfterRestore = pausedChipGone ? 0 : await (async () => {
                    await clickChip("tab-vendor-paused");
                    await page.waitForTimeout(400);
                    return count(ROWS);
                  })();
                  check(
                    "trust-transition 3/4: paused → trusted (restore) — row left Paused tab",
                    pausedAfterRestore < pausedCount,
                    `before=${pausedCount} after=${pausedAfterRestore}`,
                  );

                  await clickChip("tab-vendor-trusted");
                  await page.waitForTimeout(400);
                  const trustedAfterRestore = await count(ROWS);
                  check(
                    "trust-transition 3/4: paused → trusted (restore) — row back in Trusted tab",
                    trustedAfterRestore > 0,
                    `trusted-tab rows: ${trustedAfterRestore}`,
                  );
                }
              }
            }
          } else {
            check(
              "trust-transition 2/4: trusted → paused — Paused chip appeared",
              false,
              "Paused chip not visible after pause — row may not have moved",
            );
          }
        }
      }
    }
  }
  await closePopup();

  /* ── Step 4: any valid state → acknowledged ("No action") ─────────────── */
  await go("/ledger?tab=counterparties");
  await clickChip("segment-vendor");
  await clickChip("tab-vendor-needs-review");
  await page.waitForTimeout(400);

  const queueForAck = await count(ROWS);
  if (queueForAck === 0) {
    check(
      "trust-transition 4/4: acknowledge — a row is available to mark no action",
      false,
      "Needs Review queue is empty. Steps 1 and 4 (grant, acknowledge) are not " +
        "reversible, so each run drains this tenant's queue by two rows — unlike " +
        "steps 2–3, which restore what they change. A fresh tenant is needed.",
    );
  } else {
    /* Select by the action, and keep the row's text: what "No action" should do
       to this row depends on why the row is queued, and the reason is on the
       row. A row held here by a risk flag may already be acknowledged and offer
       no "No action" button at all. */
    const ackRowText = await openRowOffering("button-acknowledge-counterparty");
    const ackExists = ackRowText !== null;
    if (ackExists) {
      check("trust-transition 4/4: No action button is present in popup", true);
    } else {
      await reportNoEligibleRow(
        "trust-transition 4/4: No action button is present in popup",
        "vendor",
        `no row in the queue (${queueForAck}) offers an enabled acknowledge action`,
      );
    }
    const ackBtn = page.locator('[data-testid="button-acknowledge-counterparty"]');

    if (ackExists) {
      await permitWrite(
        /\/trust\/acknowledge/,
        "step 4: any → acknowledged",
        async () => {
          await ackBtn.click();
          await page.waitForTimeout(2000);
        },
      );

      await clickChip("tab-vendor-needs-review");
      await page.waitForTimeout(400);
      const queueAfterAck = await count(ROWS);

      /* "Acknowledging clears the row" is true of most rows and false as a rule,
         and this check asserted the rule. It passed for several runs purely
         because the first queued row happened to be an ordinary one; the moment
         earlier steps consumed enough rows that a risk-marked one surfaced, it
         failed while the app was behaving correctly.

         isNeedsReview gives a high/sanctioned risk_level precedence over trust
         state, so a risk-marked row stays queued after "No action" — which is
         the right call: a user dismissing a counterparty they recognise has not
         answered the sanctions hit. Both branches are asserted, so the rule is
         pinned whichever row the tenant happens to offer. */
      const riskMarked = /risk:\s*(high|sanction)/i.test(ackRowText);
      const detail = `risk=${riskMarked} before=${queueForAck} after=${queueAfterAck} row="${ackRowText.slice(0, 70)}"`;
      check(
        riskMarked
          ? "trust-transition 4/4: acknowledged — a risk-marked row correctly stays in Needs Review"
          : "trust-transition 4/4: any → acknowledged (No action) — row left Needs Review",
        riskMarked ? queueAfterAck === queueForAck : queueAfterAck < queueForAck,
        detail,
      );
    }
  }
}

await finish();
