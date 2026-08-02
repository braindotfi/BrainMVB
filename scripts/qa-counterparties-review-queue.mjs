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

const { page, check, finish } = await createQaSession();

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
     from the other filters — that is the job the banner used to do. */
  await clickChip("tab-vendor-suggested");
  const badgeFromSuggested = await badgeValue();
  check(
    `${segment}s: badge stays visible and unchanged from another filter`,
    badgeFromSuggested === badge,
    `needs-review=${badge} from-suggested=${badgeFromSuggested}`,
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
await clickChip("tab-vendor-suggested");
check(
  "settled rows carry no review reason",
  (await count('[data-testid="chip-review-reason"]')) === 0,
);

/* ── Honest copy ─────────────────────────────────────────────────────────── */

await clickChip("tab-vendor-trusted");
const trustedText = await page.locator('[data-testid="list-counterparties"]').innerText();
const trustedRows = await count(ROWS);
check(
  "Trusted is honest that granting trust is unavailable, not merely empty",
  trustedRows > 0 || /isn't available yet/i.test(trustedText),
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

await finish();
