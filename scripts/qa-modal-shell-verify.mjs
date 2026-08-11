/**
 * QA walkthrough for #136 — Modal shell standard.
 * Verifies: app loads, inbox detail popup width (480px), home add-goal modal
 * width (400px). AddAccountModal is unreachable from the app (no nav wires it
 * in) so it has no automated check here.
 * Run: QA_COOKIE=<value> node scripts/qa-modal-shell-verify.mjs
 */
import { chromium } from 'playwright';

const CHROMIUM = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE = 'http://127.0.0.1:5000';
const cookie = process.env.QA_COOKIE;

if (!cookie) { console.error('QA_COOKIE required'); process.exit(1); }

const results = [];
const check = (id, pass, note) => {
  results.push({ id, pass, note });
  console.log(`${pass ? '✓' : '✗'} ${id}: ${note}`);
};

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'connect.sid', value: cookie, domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
const page = await ctx.newPage();

try {
  // ── 1. Home page loads ──────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  const url = page.url();
  check('app-loads', !url.includes('/login'), `landed at: ${url}`);

  // ── 2. AddAccountModal: unreachable from the app (no nav wires it in —
  // see CLAUDE.md holdout list), so there is no button to drive here. No
  // check recorded rather than one that can never run.

  // ── 3. Inbox detail popup: width must now be 480px (was 520) ───────────
  await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  const rows = page.locator('[data-testid^="row-decision-"]');
  const rowCount = await rows.count();
  check('inbox-has-rows', rowCount > 0, `${rowCount} rows`);
  if (rowCount > 0) {
    await rows.first().click();
    await page.waitForTimeout(600);
    const popup = page.locator('[role="dialog"]').first();
    if (await popup.count() > 0) {
      const { width } = await popup.boundingBox();
      check('inbox-popup-width-480', Math.round(width) === 480, `width: ${Math.round(width)}px (was 520)`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } else {
      check('inbox-popup-opens', false, 'no dialog appeared after row click');
    }
  }

  // ── 4. Home page goal modal: width must be 400px (was 440) ─────────────
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  const addGoalBtn = page.locator('[data-testid="button-add-goal"]').first();
  const hasGoal = await addGoalBtn.count() > 0;
  check('add-goal-btn-present', hasGoal, `found: ${hasGoal}`);
  if (hasGoal) {
    await addGoalBtn.click();
    await page.waitForTimeout(400);
    const goalDialog = page.locator('[role="dialog"]').first();
    if (await goalDialog.count() > 0) {
      const { width } = await goalDialog.boundingBox();
      check('add-goal-width-400', Math.round(width) === 400, `width: ${Math.round(width)}px (was 440)`);
      await page.keyboard.press('Escape');
    } else {
      check('add-goal-opens', false, 'no dialog appeared after add-goal click');
    }
  }

} catch (e) {
  console.error('WALKTHROUGH ERROR:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n─── Summary ───');
const passed = results.filter(r => r.pass).length;
console.log(`${passed}/${results.length} checks passed`);
const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.log('FAILED:', failed.map(r => `${r.id} (${r.note})`).join('\n  '));
  process.exit(1);
}
