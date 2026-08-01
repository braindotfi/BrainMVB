/**
 * Row-record height parity with the Security table.
 *
 * WHY THIS IS AN ASSERTION AND NOT A SCREENSHOT
 *
 * "The rows are the same height" is a number, and no screenshot can tell you
 * whether two rows differ by 4px. Worse, a screenshot proves nothing a month
 * from now: a single line-height tweak somewhere unrelated silently pushes a
 * list back out of alignment and nothing notices. So this measures, and fails.
 *
 * THE INVARIANT
 *
 * The Security settings table is the reference for row-record geometry. Its rows
 * are a 40px content box — title (leading 20) + 4px gap + subtext (leading 16) —
 * sitting in a card with 16px gaps, so each row occupies a 56px slot.
 *
 * Every row record on Overview, Inbox and Ledger must therefore have a 40px text
 * stack. Their lists use 8px padding and a border instead of the card's gaps,
 * which lands them on the same 56px slot.
 *
 * WHAT IS DELIBERATELY *NOT* ASSERTED
 *
 * Only the BASELINE (single-line) row is pinned at 40px. Rows legitimately grow:
 * a title that wraps, a third "note" line, or the Rules tab's paused-rule banner
 * all make a record taller on purpose. Pinning those would be asserting that the
 * UI must clip its own content. So the assertion is on the SHORTEST row of each
 * surface — the one that has nothing extra — and taller rows are reported for
 * eyeballing rather than judged.
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

/** The Security row's content box. Everything else is compared to this. */
const REFERENCE_STACK = 40;
/** Sub-pixel rounding from web fonts and borders; 1px is noise, 2px is a bug. */
const TOLERANCE = 1;

const rowsOn = async (selector) => {
  const els = await page.locator(selector).all();
  const out = [];
  for (const el of els.slice(0, 6)) {
    out.push(
      await el.evaluate((node) => {
        const cs = getComputedStyle(node);
        const stack = node.querySelector(".flex-col");
        const r = (n) => Math.round(n * 100) / 100;
        return {
          outer: r(node.getBoundingClientRect().height),
          padY: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
          stack: stack ? r(stack.getBoundingClientRect().height) : null,
          text: (node.textContent ?? "").trim().slice(0, 40),
        };
      }),
    );
  }
  return out.filter((r) => r.stack !== null);
};

const go = async (path, settle = 2800) => {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};

/* ── the reference ───────────────────────────────────────────────────────── */

await go("/settings?section=security");
const ref = await rowsOn("div.h-\\[40px\\].items-center");
check(
  "the Security table still measures what this script assumes",
  ref.length > 0 && ref.every((r) => Math.abs(r.stack - REFERENCE_STACK) <= TOLERANCE),
  ref.length === 0
    ? "no reference rows found — the selector or the section changed"
    : `${ref.length} rows, stacks ${ref.map((r) => r.stack).join("/")}`,
);

/* ── the surfaces under test ─────────────────────────────────────────────── */

/** Assert the shortest row matches the reference; report the rest. */
const assertBaseline = async (label, selector, { optional = false } = {}) => {
  const rows = await rowsOn(selector);
  if (rows.length === 0) {
    /* An empty list is not a pass. Say so plainly rather than logging nothing
       and letting a green run imply the surface was checked. */
    check(`${label}: rows present to measure`, optional, "no rows rendered in this tenant");
    return;
  }
  const baseline = rows.reduce((a, b) => (a.stack <= b.stack ? a : b));
  check(
    `${label}: baseline record matches the Security row`,
    Math.abs(baseline.stack - REFERENCE_STACK) <= TOLERANCE,
    `stack=${baseline.stack} (reference ${REFERENCE_STACK}), outer=${baseline.outer}, padY=${baseline.padY}`,
  );
  const taller = rows.filter((r) => r.stack > REFERENCE_STACK + TOLERANCE);
  for (const t of taller) {
    console.log(`      grows on purpose: stack=${t.stack} outer=${t.outer}  ${t.text}`);
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
     run — but it is reported, so nobody reads this as "all six verified". */
  await assertBaseline(label, selector, { optional: true });
}

await finish();
