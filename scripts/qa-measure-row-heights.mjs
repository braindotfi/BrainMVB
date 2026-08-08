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

/* ── Badge pills ──────────────────────────────────────────────────────────
   A badge pill is 20px tall: 2px padding + a 14px line + 2px padding + 1px
   borders. That is not decoration — 20px is exactly the height of the row
   title line the badge sits on, so a badge that grows drags the whole stack
   with it.

   This check exists because the typography pass re-led these to 12/16 for
   pairing-table compliance. Every pill-bearing row silently went 40px -> 42px,
   and tsc, 1126 unit tests and the design-token scan all stayed green. The row
   assertions above did catch it, but they report it as a *row* failure, which
   is one indirection away from the actual cause. This names the cause. */
const COLLECT_BADGES = () => {
  const out = [];
  for (const el of document.querySelectorAll('[class*="rounded-pill"]')) {
    const r = el.getBoundingClientRect();
    if (r.height < 2 || r.width < 2) continue;
    let t = el;
    for (const c of el.querySelectorAll("span,p")) {
      if ((c.textContent ?? "").trim()) { t = c; break; }
    }
    const cs = getComputedStyle(el);
    const ts = getComputedStyle(t);
    const py = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const by =
      (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    /* A badge is a small BORDERED chip: 12px type, <=4px vertical padding, a
       1px stroke. The border is what separates it from the other two things
       wearing `rounded-pill` — action buttons with 12-16px padding, and small
       borderless controls like Developers' "Copy". Both of those own their own
       height and correctly follow the pairing table at 12/16, so judging them
       against a badge leading would be wrong, not merely noisy. */
    if (Math.round(parseFloat(ts.fontSize)) !== 12 || py > 8 || by === 0) continue;
    out.push({
      h: Math.round(r.height),
      py,
      lh: ts.lineHeight === "normal" ? 0 : Math.round(parseFloat(ts.lineHeight)),
      text: (el.textContent ?? "").trim().slice(0, 18),
    });
  }
  return out;
};

/* Three surfaces, because the badge components do not share a padding value
   and a single page only proves the ones it happens to render. Inbox covers
   RecordPill/TypeTag (py-2, 20px), Team covers the role/state badges and
   Developers the status/method/layer badges (py-3, 22px). A surface that
   renders none is reported as an evidence gap, not silently passed. */
const badgesBySurface = {};
for (const [label, path] of [
  ["inbox", "/inbox"],
  ["team", "/settings?section=team"],
  ["developers", "/settings?section=developers"],
]) {
  await go(path);
  badgesBySurface[label] = await page.evaluate(COLLECT_BADGES);
}
const badges = Object.entries(badgesBySurface).flatMap(([s, v]) => v.map((b) => ({ ...b, s })));
const emptySurfaces = Object.entries(badgesBySurface).filter(([, v]) => !v.length).map(([s]) => s);
const offLeading = badges.filter((b) => b.lh !== 14);
const geometry = [
  ...new Set(badges.map((b) => `py${b.py}=>${b.h}px`)),
].sort().join(" ");

check(
  "every 12px badge pill is on leading-14",
  badges.length > 0 && emptySurfaces.length === 0 && offLeading.length === 0,
  emptySurfaces.length
    ? `no badges rendered on: ${emptySurfaces.join(", ")} — evidence gap, not a pass`
    : `${badges.length} badges across ${Object.keys(badgesBySurface).length} surfaces [${geometry}], ` +
      (offLeading.length
        ? `${offLeading.length} off: ${[...new Set(offLeading.map((b) => `${b.s} leading-${b.lh}=>${b.h}px "${b.text}"`))].slice(0, 3).join(", ")}`
        : "all leading-14"),
);

await finish();
