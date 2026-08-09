/**
 * Verify: a notify_only proposal (compliance today) with no subject or
 * presentation.headline renders its resolved NARRATIVE as the title on
 * every surface that calls buildProposalHeaderCopy() — not the bare agent
 * name repeated across every row. Follow-up to fix/compliance-row-narrative-
 * label (PR #131): that PR is unit-tested at the function level; this script
 * is the live, four-surface walkthrough it was never run against. Standing
 * lesson from CLAUDE.md applies here directly — a passing unit test is not
 * proof the four call sites actually pass the return value through render
 * unmodified. No writes: this is read-only across all four checks.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-notify-only-title-fallback.mjs
 *
 * QA_COOKIE is a session id for a logged-in account. Never commit one.
 *
 * Needs a tenant carrying at least one pending notify_only proposal
 * (compliance is the only handler that emits notify_only today — see
 * services/internal-agents/src/compliance/handler.ts in brain-core). If the
 * seeded/demo tenant has none, the script says so plainly and exits without
 * failing the run — it cannot prove a fallback path it never exercised.
 */
import { createQaSession } from "./qa-harness.mjs";

const { page, base, check, finish } = await createQaSession({ viewport: { width: 1280, height: 1000 } });

/* A title that's just the bare category word (optionally trailed by a count
   badge) is exactly the pre-fix bug: every notify_only row showing the
   identical, indistinguishable "Compliance" string. A resolved narrative is
   longer, sentence-shaped prose — this is a deliberately loose check (no
   exact-string match, since real narrative text is tenant-specific) rather
   than a precise assertion, because the point is distinguishing rows from
   each other, not matching one hardcoded sentence. */
const looksGeneric = (title, agentLabel) =>
  title.trim().toLowerCase() === agentLabel.trim().toLowerCase();

async function rowTitles(rowLocator, titleSelector) {
  const n = await rowLocator.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = await rowLocator.nth(i).locator(titleSelector).first().innerText().catch(() => "");
    out.push(t.replace(/\s+/g, " ").trim());
  }
  return out;
}

/* ── Home: the "Brain Detected" widget from the original bug report ──────── */
await page.goto(`${base}/home`, { waitUntil: "domcontentloaded" });
let homeRows = page.locator('[data-testid^="row-overview-proposal-"]');
for (let i = 0; i < 15; i++) {
  if ((await homeRows.count()) > 0) break;
  await page.waitForTimeout(1500);
}
const homeCount = await homeRows.count();
console.log("Home proposal rows:", homeCount);

let complianceOnHome = [];
if (homeCount > 0) {
  const titles = await rowTitles(homeRows, "p, span, div");
  console.log("Home row titles:", titles);
  complianceOnHome = titles.filter((t) => /compliance/i.test(t));
}

if (complianceOnHome.length === 0) {
  console.log(
    "No compliance/notify_only rows visible on Home for this tenant — cannot exercise the " +
      "fallback path live. Not a failure: re-run against a tenant/demo seed that carries at " +
      "least one pending compliance finding.",
  );
} else {
  check(
    "Home: compliance row titles are not all the bare generic label",
    !complianceOnHome.every((t) => looksGeneric(t, "Compliance")),
    JSON.stringify(complianceOnHome),
  );
  const distinct = new Set(complianceOnHome);
  check(
    "Home: multiple compliance findings render DIFFERENT titles from each other",
    complianceOnHome.length === 1 || distinct.size > 1,
    `${distinct.size} distinct of ${complianceOnHome.length}`,
  );

  /* ── Modal: open the first compliance row and confirm the same resolved
       text appears there — proves Home and the modal read the same field,
       not two different renderings that happen to agree in the unit test. */
  const firstComplianceIdx = (await rowTitles(homeRows, "p, span, div")).findIndex((t) =>
    /compliance/i.test(t),
  );
  if (firstComplianceIdx >= 0) {
    await homeRows.nth(firstComplianceIdx).click();
    await page.waitForTimeout(1500);
    const modalTitle = await page
      .locator('[data-testid="text-live-proposal-subject"]')
      .first()
      .innerText()
      .catch(() => "");
    console.log("Modal title:", modalTitle);
    check(
      "Modal: title is not the bare generic label either",
      modalTitle.trim().length > 0 && !looksGeneric(modalTitle, "Compliance"),
      modalTitle,
    );
    check(
      "Modal: title matches the row that opened it (same field, same resolution)",
      modalTitle.trim() === complianceOnHome[0].trim(),
      `row="${complianceOnHome[0]}" modal="${modalTitle}"`,
    );
    const closeBtn = page.locator('[aria-label="Close"], [data-testid*="close"]').first();
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
    await page.waitForTimeout(500);
  }
}

/* ── Inbox: same proposals, different row component/testIdPrefix ────────── */
await page.goto(`${base}/inbox`, { waitUntil: "domcontentloaded" });
let inboxRows = page.locator('[data-testid^="row-decision-"]');
for (let i = 0; i < 15; i++) {
  if ((await inboxRows.count()) > 0) break;
  await page.waitForTimeout(1500);
}
const inboxTitles = await rowTitles(inboxRows, "p, span, div");
const complianceOnInbox = inboxTitles.filter((t) => /compliance/i.test(t));
console.log("Inbox compliance row titles:", complianceOnInbox);
if (complianceOnInbox.length === 0) {
  console.log("No compliance rows visible on Inbox either — same caveat as Home, not a failure.");
} else {
  check(
    "Inbox: compliance row titles are not all the bare generic label",
    !complianceOnInbox.every((t) => looksGeneric(t, "Compliance")),
    JSON.stringify(complianceOnInbox),
  );
}

/* ── GlobalSearch: same builder, third render path (title/detail as plain
     search-result text rather than a tier row) ─────────────────────────── */
await page.goto(`${base}/home`, { waitUntil: "domcontentloaded" });
const searchInput = page.locator('[data-testid="input-global-search"]').first();
if (await searchInput.isVisible().catch(() => false)) {
  await searchInput.fill("compliance");
  await page.waitForTimeout(1000);
  const results = page.locator('[data-testid="search-result-decision"]');
  const n = await results.count();
  console.log("GlobalSearch decision results for 'compliance':", n);
  if (n === 0) {
    console.log("GlobalSearch found no compliance decision results — same caveat, not a failure.");
  } else {
    const searchTitles = [];
    for (let i = 0; i < n; i++) {
      searchTitles.push((await results.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ").trim());
    }
    console.log("GlobalSearch result text:", searchTitles);
    check(
      "GlobalSearch: at least one compliance result shows more than the bare category word",
      searchTitles.some((t) => t.length > "Compliance".length + 5),
      JSON.stringify(searchTitles),
    );
  }
} else {
  console.log("Global search input not visible on this surface/viewport — skipped.");
}

await finish();
