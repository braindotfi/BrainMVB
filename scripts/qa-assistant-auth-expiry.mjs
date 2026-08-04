/**
 * Live proof: assistant renders an honest error (not canned copy) on a 401.
 *
 * Auth via context.request.post() — Playwright's APIRequestContext shares the
 * cookie jar with all pages in the same BrowserContext, so the session cookie
 * set by demo-fresh is automatically present on every subsequent page.goto().
 *
 * Flow:
 *   1. POST /api/auth/demo-fresh via context.request (bypasses rate-limiter UI
 *      surface; retries once on 429 with a short back-off)
 *   2. Navigate to / — already authenticated via the shared cookie jar
 *   3. Route /api/assistant/chat to return 401 {"error":"Not authenticated"}
 *   4. Open the assistant if collapsed; send a message
 *   5. Assert data-testid="assistant-error" visible
 *   6. Assert "Your session expired. Please sign in again." in page body text
 *   7. Assert old canned text is absent
 *
 * Run:
 *   CHROMIUM=.../chromium-browser node scripts/qa-assistant-auth-expiry.mjs
 */

const PLAYWRIGHT_PATH =
  process.env.PLAYWRIGHT ??
  "/home/runner/.npm/_npx/c61c9351a0dbcfa7/node_modules/playwright/index.mjs";
const { chromium } = await import(PLAYWRIGHT_PATH);

const BASE     = process.env.QA_BASE ?? "http://127.0.0.1:5000";
const CHROMIUM = process.env.CHROMIUM ??
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser";

const CANNED = [
  "Live answers are coming soon",
  "assistant is still being configured",
  "not yet connected",
];

let passed = 0; let failed = 0;
const check = (label, ok, detail = "") => {
  if (ok) { console.log(`  ✓ ${label}`); passed++; }
  else    { console.error(`  ✗ ${label}${detail ? ": " + detail : ""}`); failed++; }
};

/** POST /api/auth/demo-fresh; retry once on 429. */
async function loginDemoFresh(context) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await context.request.post(`${BASE}/api/auth/demo-fresh`);
    if (res.ok()) {
      const body = await res.json();
      console.log(`  demo-fresh OK (attempt ${attempt}) — user ${body?.user?.id ?? "?"}`);
      return body;
    }
    if (res.status() === 429) {
      const waitMs = attempt * 6_000;
      console.log(`  demo-fresh 429 — waiting ${waitMs/1000}s before retry…`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`demo-fresh failed: ${res.status()} ${await res.text()}`);
  }
  throw new Error("demo-fresh still 429 after 3 attempts — demo limiter exhausted");
}

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await context.newPage();

  // ── 1. Authenticate via shared APIRequestContext cookie jar ───────────────
  console.log("Logging in via demo-fresh…");
  const authBody = await loginDemoFresh(context);
  const userId = authBody?.user?.id;

  // Pre-mark onboarding complete so the app lands directly on the main shell.
  await context.addInitScript((uid) => {
    if (uid) localStorage.setItem(`brain_onboarding_complete_${uid}`, "true");
  }, userId);

  check("demo-fresh login succeeded", !!userId);

  // ── 2. Set up 401 intercept BEFORE navigating ─────────────────────────────
  await page.route("**/api/assistant/chat", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not authenticated" }),
    }),
  );

  // ── 3. Navigate to the app — session cookie already set ───────────────────
  console.log("Navigating to /…");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  // Wait for the logged-in shell: expand or input must appear.
  console.log("Waiting for assistant UI (up to 30 s)…");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="input-assistant-message"]') !== null ||
      document.querySelector('[data-testid="button-assistant-expand"]') !== null,
    { timeout: 30_000 },
  );
  check("logged-in shell rendered", true);

  // ── 4. Ensure the assistant is open ──────────────────────────────────────
  const inputEl   = page.locator('[data-testid="input-assistant-message"]');
  const expandBtn = page.locator('[data-testid="button-assistant-expand"]');

  if (await expandBtn.isVisible()) {
    console.log("  Collapsed — clicking expand…");
    await expandBtn.click();
    await inputEl.waitFor({ state: "visible", timeout: 8_000 });
  }
  check("assistant input visible", await inputEl.isVisible());

  // ── 5. Fill the input, then confirm send is enabled ──────────────────────
  // The send button is disabled when the draft is empty (!draft.trim()) — fill
  // first so that condition clears, then wait for authLoading / isTransitioning
  // to also settle before checking.
  const sendBtn = page.locator('[data-testid="button-assistant-send"]');
  await inputEl.fill("What is our cash balance?");
  await page
    .waitForFunction(
      () =>
        !document.querySelector('[data-testid="button-assistant-send"]')
          ?.hasAttribute("disabled"),
      { timeout: 10_000 },
    )
    .catch(() => {});
  check(
    "send button enabled after typing (not blocked by auth-loading or isTransitioning)",
    await sendBtn.isEnabled(),
  );

  // ── 6. Send a message — intercept fires 401 ───────────────────────────────
  console.log("Sending message (intercepted to 401)…");
  await sendBtn.click();

  // ── 7. Assert the honest error state ─────────────────────────────────────
  console.log("Waiting for assistant-error badge…");
  const errorBadge = page.locator('[data-testid="assistant-error"]');
  await errorBadge.waitFor({ state: "visible", timeout: 12_000 });
  check("data-testid='assistant-error' badge is visible", await errorBadge.isVisible());

  // The reply text is in the ChatBubble above the badge. Check the body.
  const bodyText = (await page.locator("body").textContent()) ?? "";
  check(
    "reply 'Your session expired. Please sign in again.' appears in chat",
    bodyText.includes("Your session expired. Please sign in again."),
    bodyText.includes("session")
      ? `(found near: "${bodyText.slice(
          Math.max(0, bodyText.indexOf("session") - 10),
          bodyText.indexOf("session") + 60,
        )}")`
      : "(not found in page)",
  );

  // ── 8. Canned text must be absent ────────────────────────────────────────
  for (const phrase of CANNED) {
    check(`canned phrase absent: "${phrase}"`, !bodyText.includes(phrase));
  }

  // ── 9. Wrong-branch guard ────────────────────────────────────────────────
  check(
    "assistant-no-answer absent (error branch, not no-answer branch)",
    !(await page.locator('[data-testid="assistant-no-answer"]').isVisible().catch(() => false)),
  );

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  await page.screenshot({ path: "scripts/qa-assistant-auth-expiry-result.png" });
  console.log("Screenshot → scripts/qa-assistant-auth-expiry-result.png");

} finally {
  await browser.close();
}

if (failed > 0) process.exit(1);
