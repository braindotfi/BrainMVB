/**
 * Row-record geometry parity for Overview, Inbox and Ledger.
 *
 * WHY THIS IS AN ASSERTION AND NOT A SCREENSHOT
 *
 * "The rows are the same height" is a number, and no screenshot can tell you
 * whether two rows differ by 4px. Worse, a screenshot proves nothing a month
 * from now: one line-height tweak somewhere unrelated silently pushes a list
 * back out of alignment and nothing notices. So this measures, and it fails.
 *
 * THE TWO REFERENCES
 *
 * There are two, because they govern different things and they disagree about
 * padding — reading either one as "the row spec" gets you the wrong answer.
 *
 *   1. TEXT STACK — the Security settings table. Title (16px/20) + 4px gap +
 *      subtext (14px/16) = a 40px stack. This is the type ramp for every row
 *      record in the app.
 *
 *   2. ROW CHROME — the Profile settings rows (Identity card). Same 40px stack,
 *      wrapped in 12px vertical / 16px horizontal padding with a 12px gap
 *      between the row's columns, giving a 64px row box.
 *
 * Security's own rows have zero padding (their breathing room comes from the
 * parent card's 16px gaps), so they are NOT the chrome reference. Profile is.
 *
 * WHAT IS DELIBERATELY *NOT* ASSERTED
 *
 * Only the BASELINE (single-line) row is pinned. Rows legitimately grow: a
 * title that wraps, a third "note" line, the Rules tab's paused-rule banner.
 * Pinning those would be asserting that the UI must clip its own content. So
 * the assertion targets the SHORTEST row on each surface — the one with nothing
 * extra — and taller rows are reported for eyeballing rather than judged.
 *
 * Borders are subtracted before comparing. These lists separate rows with a 1px
 * `border-b` on the row itself, whereas Profile uses a separate divider element,
 * so the raw bounding boxes differ by 1px while the actual rows match.
 *
 * The Overview and Inbox decision rows do not exist in the demo tenant (no
 * proposals upstream), so the proposals read is stubbed. A GET is not a write.
 * Without the stub both surfaces render empty states, and measuring an empty
 * state would prove nothing about the rows it is supposed to check.
 *
 *   CHROMIUM=... PLAYWRIGHT=... QA_USER_ID=... QA_COOKIE=... \
 *   node scripts/qa-measure-row-heights.mjs
 */

import { createQaSession } from "./qa-harness.mjs";
import { stubProposals } from "./qa-fixtures.mjs";

const { page, base, check, finish } = await createQaSession({
  viewport: { width: 1440, height: 1400 },
});

await stubProposals(page);

/** Security's text stack. */
const REFERENCE_STACK = 40;
/** Profile's row box, borders excluded. */
const REFERENCE_BOX = 64;
const REFERENCE_PAD_Y = 24; // 12 top + 12 bottom
const REFERENCE_GAP = 12;
/** Sub-pixel rounding from web fonts; 1px is noise, 2px is a bug. */
const TOLERANCE = 1;

/** Geometry of a row element, with borders factored out of the height. */
const MEASURE = (node) => {
  const cs = getComputedStyle(node);
  const r = (n) => Math.round(n * 100) / 100;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const bb = parseFloat(cs.borderBottomWidth) || 0;
  /* The text stack is `.flex-col` on the Ledger/Inbox rows but `.flex-1` on the
     Profile row. Match either, first in document order — in every one of these
     layouts the title/subtext column is the row's first flexible child. */
  const stack = node.querySelector(".flex-col, .flex-1");
  return {
    box: r(node.getBoundingClientRect().height - bt - bb),
    padY: (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0),
    padX: `${cs.paddingLeft}/${cs.paddingRight}`,
    gap: parseFloat(cs.gap) || 0,
    stack: stack ? r(stack.getBoundingClientRect().height) : null,
    text: (node.textContent ?? "").trim().slice(0, 40),
  };
};

const rowsOn = async (selector) => {
  const els = await page.locator(selector).all();
  const out = [];
  for (const el of els.slice(0, 6)) out.push(await el.evaluate(MEASURE));
  return out.filter((r) => r.stack !== null);
};

const go = async (path, settle = 2800) => {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};

/* ── the two references ──────────────────────────────────────────────────── */

await go("/settings?section=security");
const secRows = await rowsOn("div.h-\\[40px\\].items-center");
check(
  "reference A: the Security table still has a 40px text stack",
  secRows.length > 0 && secRows.every((r) => Math.abs(r.stack - REFERENCE_STACK) <= TOLERANCE),
  secRows.length === 0
    ? "no reference rows found — the selector or the section changed"
    : `${secRows.length} rows, stacks ${secRows.map((r) => r.stack).join("/")}`,
);

await go("/settings?section=profile");
const [profile] = await rowsOn('[data-testid="setting-row-email"]');
check(
  "reference B: the Profile row still has a 64px box / 40px stack",
  !!profile &&
    Math.abs(profile.box - REFERENCE_BOX) <= TOLERANCE &&
    Math.abs(profile.stack - REFERENCE_STACK) <= TOLERANCE &&
    profile.padY === REFERENCE_PAD_Y &&
    profile.gap === REFERENCE_GAP,
  profile
    ? `box=${profile.box} stack=${profile.stack} padY=${profile.padY} padX=${profile.padX} gap=${profile.gap}`
    : "Profile email row not found",
);

/* ── the surfaces under test ─────────────────────────────────────────────── */

/** Assert the shortest row matches both references; report the rest. */
const assertBaseline = async (label, selector, { optional = false } = {}) => {
  const rows = await rowsOn(selector);
  if (rows.length === 0) {
    /* An empty list is not a pass. Say so plainly rather than logging nothing
       and letting a green run imply the surface was actually checked. */
    check(`${label}: rows present to measure`, optional, "no rows rendered in this tenant");
    return;
  }
  const b = rows.reduce((a, c) => (a.box <= c.box ? a : c));
  check(
    `${label}: baseline row matches Profile chrome + Security stack`,
    Math.abs(b.stack - REFERENCE_STACK) <= TOLERANCE &&
      Math.abs(b.box - REFERENCE_BOX) <= TOLERANCE &&
      b.padY === REFERENCE_PAD_Y &&
      b.gap === REFERENCE_GAP,
    `box=${b.box} (ref ${REFERENCE_BOX}), stack=${b.stack} (ref ${REFERENCE_STACK}), padY=${b.padY}, padX=${b.padX}, gap=${b.gap}`,
  );
  for (const t of rows.filter((r) => r.box > REFERENCE_BOX + TOLERANCE)) {
    console.log(`      grows on purpose: box=${t.box} stack=${t.stack}  ${t.text}`);
  }
};

await go("/");
await assertBaseline("overview decision", "[data-tier]");

await go("/inbox");
await assertBaseline("inbox decision", "[data-tier]");

await go("/ledger");
await assertBaseline("ledger account", '[data-testid^="row-account-"]');

for (const [tab, selector, label] of [
  ["cash-flow", '[data-testid^="row-cashflow-"]', "ledger cash flow"],
  ["vendors", '[data-testid^="row-vendor-"]', "ledger vendor"],
  ["rules", '[data-testid^="row-automation-"]', "ledger rule (automation)"],
  ["rules", '[data-testid^="row-guardrail-"]', "ledger rule (guardrail)"],
  ["rules", '[data-testid^="row-alwayson-"]', "ledger rule (always-on)"],
]) {
  await go("/ledger", 1800);
  await page.click(`[data-testid="tab-finance-${tab}"]`).catch(() => {});
  await page.waitForTimeout(1600);
  /* Vendors and Rules are empty in the demo tenant. That is a gap in the
     evidence, not a failure of the UI, so it is reported without failing the
     run — but it IS reported, so nobody reads this as "all six verified". */
  await assertBaseline(label, selector, { optional: true });
}

await finish();
