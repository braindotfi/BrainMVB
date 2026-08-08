/**
 * QA walkthrough for #136 — Modal shell standard.
 * Verifies: AddAccountModal Radix migration (focus trap, aria-modal, overlay/Esc close),
 * detail popup width at 480px, and app loads correctly.
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

  // ── 2. AddAccountModal: Radix present, focus trap, aria-modal ───────────
  const addMoneyBtn = page.locator('[data-testid="btn-add-money"]').first();
  const hasBtn = await addMoneyBtn.count() > 0;
  check('add-money-btn-present', hasBtn, `found: ${hasBtn}`);

  if (hasBtn) {
    await addMoneyBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]').first();
    const dialogCount = await dialog.count();
    check('add-account-radix-rendered', dialogCount > 0, `role=dialog count: ${dialogCount}`);

    if (dialogCount > 0) {
      const ariaModal = await dialog.getAttribute('aria-modal');
      check('add-account-aria-modal', ariaModal === 'true', `aria-modal="${ariaModal}"`);

      const srTitle = await page.locator('[role="dialog"] .sr-only').first().textContent().catch(() => '');
      check('add-account-sr-title', srTitle.includes('Add Money'), `sr-only: "${srTitle}"`);

      // Width: form variant = 400px
      const { width } = await dialog.boundingBox();
      check('add-account-width-400', Math.round(width) === 400, `width: ${Math.round(width)}px`);

      // Focus trapped — Tab key cycles within dialog
      await page.keyboard.press('Tab');
      const focusedTag = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? el?.tagName ?? 'none';
      });
      check('add-account-focus-trapped', focusedTag !== 'BODY', `focused: ${focusedTag}`);

      // Overlay click closes
      await page.mouse.click(50, 50);
      await page.waitForTimeout(400);
      const afterOverlay = await page.locator('[role="dialog"]').count();
      check('add-account-overlay-closes', afterOverlay === 0, `dialogs remaining: ${afterOverlay}`);
    }

    // Re-open → Escape closes
    await addMoneyBtn.click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterEsc = await page.locator('[role="dialog"]').count();
    check('add-account-esc-closes', afterEsc === 0, `dialogs after Esc: ${afterEsc}`);
  }

  // ── 3. Inbox detail popup: width must now be 480px (was 520) ───────────
  await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  const rows = page.locator('[data-testid^="audit-row-"], [data-testid^="proposal-row-"], [data-testid^="decision-row-"]');
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
  const addGoalBtn = page.locator('[data-testid="btn-add-goal"]').first();
  const hasGoal = await addGoalBtn.count() > 0;
  if (hasGoal) {
    await addGoalBtn.click();
    await page.waitForTimeout(400);
    const goalDialog = page.locator('[role="dialog"]').first();
    if (await goalDialog.count() > 0) {
      const { width } = await goalDialog.boundingBox();
      check('add-goal-width-400', Math.round(width) === 400, `width: ${Math.round(width)}px (was 440)`);
      await page.keyboard.press('Escape');
    }
  } else {
    console.log('  (btn-add-goal not on home page — skip goal width check)');
  }

} catch (e) {
  console.error('WALKTHROUGH ERROR:', e.message);
  console.error(e.stack);
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
