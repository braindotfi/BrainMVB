/**
 * Capture the row-record surfaces after the typography pass so the result can
 * be eyeballed against the Security table, which is the reference.
 *
 * Not an assertion script — screenshots only.
 *
 *   CHROMIUM=... PLAYWRIGHT=... QA_USER_ID=... QA_COOKIE=... \
 *   node scripts/qa-capture-row-typography.mjs
 */

import { createQaSession } from "./qa-harness.mjs";
import { stubProposals } from "./qa-fixtures.mjs";

const { page, base, finish } = await createQaSession({ viewport: { width: 1440, height: 1200 } });

/* The demo tenant has no proposals upstream, so Overview and Inbox render their
   empty states and the decision rows — the whole point of those two shots —
   never appear. Stub the read so the rows exist. A GET is not a write. */
await stubProposals(page);

const SHOTS = [
  { path: "/", name: "overview", wait: '[data-testid^="row-"]' },
  { path: "/inbox", name: "inbox", wait: null },
  { path: "/ledger", name: "ledger", wait: null },
  { path: "/settings?section=sources", name: "settings-sources", wait: null },
  { path: "/settings?section=audit", name: "settings-audit", wait: '[data-testid^="row-audit-"]' },
  { path: "/settings?section=security", name: "settings-security-REFERENCE", wait: null },
];

for (const shot of SHOTS) {
  await page.goto(`${base}${shot.path}`, { waitUntil: "domcontentloaded" });
  if (shot.wait) {
    await page.waitForSelector(shot.wait, { timeout: 15_000 }).catch(() => {});
  }
  await page.waitForTimeout(2500);
  const file = `screenshots/rowtype-${shot.name}.jpg`;
  await page.screenshot({ path: file, type: "jpeg", quality: 82, fullPage: false });
  console.log(`captured ${file}`);
}

await finish();
