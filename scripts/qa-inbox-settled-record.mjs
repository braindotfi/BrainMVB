/**
 * Verify: tapping an already-actioned (settled) record in the Inbox opens the
 * record popup IN PLACE instead of navigating to the old Audit Log page.
 *
 * A freshly seeded demo tenant has no decided history, so this script creates
 * one by approving a single proposal. That is a real write, declared through
 * permitWrite, and it is scoped to a throwaway demo tenant created for this run.
 * Point it at a demo tenant only — it decides a real proposal.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-inbox-settled-record.mjs
 *
 * QA_COOKIE is a session id for a logged-in account. Never commit one.
 */
import { createQaSession } from "./qa-harness.mjs";

const { page, base, check, permitWrite, finish } = await createQaSession({ viewport: { width: 1280, height: 1000 } });

const rows = page.locator('[data-testid^="row-decision-"]');
const rowTexts = async () => {
  const n = await rows.count();
  const out = [];
  for (let i = 0; i < n; i++) out.push((await rows.nth(i).innerText()).replace(/\s+/g, " ").trim());
  return out;
};
const settledIn = (texts) => texts.findIndex((t) => /\b(Approved|Rejected|Auto-approved|Acknowledged)\b/i.test(t));

await page.goto(`${base}/inbox`, { waitUntil: "domcontentloaded" });
let count = 0;
for (let i = 0; i < 30; i++) {
  count = await rows.count();
  if (count > 0) break;
  await page.waitForTimeout(2000);
}
console.log("visible decision rows:", count);
check("the seeded tenant renders decision rows", count > 0);
if (count === 0) {
  console.log("BODY >>>", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400));
  await finish();
  process.exit(0);
}

/* Create settled history if the tenant has none yet. */
let texts = await rowTexts();
if (settledIn(texts) < 0) {
  const approveBtn = page.locator('[data-testid$="-action-approve"]').first();
  if (await approveBtn.isVisible().catch(() => false)) {
    await permitWrite("/decide", "create one settled record on a throwaway demo tenant so the settled-row tap can be tested", async () => {
      await approveBtn.click();
      await page.waitForTimeout(6000);
    });
  }
  for (let i = 0; i < 15; i++) {
    texts = await rowTexts();
    if (settledIn(texts) >= 0) break;
    await page.waitForTimeout(2000);
  }
}

const idx = settledIn(texts);
console.log("settled row index:", idx, "|", (texts[idx] ?? "").slice(0, 140));
check("a settled (already-actioned) record is on screen to tap", idx >= 0);

if (idx >= 0) {
  await rows.nth(idx).click();
  await page.waitForTimeout(3000);
  const url = page.url();
  console.log("url after tapping settled row:", url);

  check("tapping a settled record does NOT navigate to /audit-log", !url.includes("/audit-log"), url);
  check("the user stays on the Inbox route", url.includes("/inbox"), url);

  const popup = await page.locator('[data-testid="button-close-audit-popup"]').first().isVisible().catch(() => false);
  check("the audit record popup opens in place", popup);

  const oldPage = await page.locator("text=Here's your decision history with Brain.").isVisible().catch(() => false);
  check("the old Audit Log page structure is NOT rendered", !oldPage);

  const inboxBehind = await page.locator("text=Know what needs your attention.").isVisible().catch(() => false);
  check("the Inbox timeline is still the underlying page", inboxBehind);

  await page.screenshot({ path: "/tmp/settled-record-open.png" });

  if (popup) {
    await page.locator('[data-testid="button-close-audit-popup"]').first().click();
    await page.waitForTimeout(1500);
    const back = page.url().includes("/inbox")
      && await page.locator("text=Know what needs your attention.").isVisible().catch(() => false);
    check("closing the popup leaves the user on the Inbox timeline", back, page.url());
  }
}

/* The pending path must not regress. */
texts = await rowTexts();
const pendingIdx = texts.findIndex((t) => /\bApprove\b/.test(t) && !/\b(Approved|Rejected|Acknowledged)\b/i.test(t));
console.log("pending row index:", pendingIdx);
if (pendingIdx >= 0) {
  await rows.nth(pendingIdx).click();
  await page.waitForTimeout(3000);
  check("tapping a pending record stays on the Inbox route", page.url().includes("/inbox") && !page.url().includes("/audit-log"), page.url());
  const anyModal = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  check("tapping a pending record still opens a detail modal", anyModal);
  await page.screenshot({ path: "/tmp/pending-record-open.png" });
}

await finish();
