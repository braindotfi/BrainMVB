/**
 * Browser regression: side-panel width changes must not trigger a
 * ResizeObserver loop or leave the assistant's measured UI hidden.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-assistant-panel-resize.mjs
 *
 * QA_COOKIE is a session id for a logged-in account. Never commit one.
 */
import { createQaSession } from "./qa-harness.mjs";

const { page, base, check, stubWrite, finish } = await createQaSession({
  viewport: { width: 1440, height: 900 },
});

const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
await page.addInitScript(() => {
  window.__qaUnhandledErrors = [];
  window.addEventListener("error", (event) => {
    window.__qaUnhandledErrors.push(String(event.error?.message ?? event.message));
  });
  window.addEventListener("unhandledrejection", (event) => {
    window.__qaUnhandledErrors.push(String(event.reason?.message ?? event.reason));
  });
});

const reply =
  "Your available cash is spread across the connected accounts shown in the Accounts panel.";
const chat = await stubWrite("**/api/assistant/chat", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ reply, answered: true, sources: [] }),
  }),
);

await page.goto(`${base}/assistant`, { waitUntil: "domcontentloaded" });
const assistant = page.locator('[data-testid="assistant-page"]');
const composer = page.locator('[data-testid="input-assistant-message"]');
await assistant.waitFor({ state: "visible", timeout: 30_000 });
await composer.fill(
  "Give me a detailed cash summary that is deliberately long enough to wrap when either side panel changes width.",
);
await page.locator('[data-testid="button-assistant-send"]').click();
await page.getByText(reply, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });

const bubbles = page.locator('[data-testid="assistant-chat-bubble"]');
const measuredBubble = bubbles.last();
check("assistant rendered a response before resizing", (await bubbles.count()) >= 2 && chat.hits === 1);

async function settleResize() {
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));
}

async function checkAssistantVisible(label) {
  check(`${label}: conversation remains visible`, await measuredBubble.isVisible());
  check(`${label}: composer remains visible`, await composer.isVisible());
  check(`${label}: measured bubble retains a width`, await measuredBubble.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && el.style.width !== "";
  }));
}

await page.locator('[data-testid="button-accounts-collapse"]').click();
await page.locator('[data-testid="button-accounts-expand"]').waitFor({ state: "visible" });
await settleResize();
await checkAssistantVisible("accounts collapsed");

await page.locator('[data-testid="button-accounts-expand"]').click();
await page.locator('[data-testid="button-accounts-collapse"]').waitFor({ state: "visible" });
await settleResize();
await checkAssistantVisible("accounts expanded");

await page.locator('[data-testid="button-collapse-sidebar"]').click();
await page.getByTitle("Expand menu").waitFor({ state: "visible" });
await settleResize();
await checkAssistantVisible("navigation collapsed");

await page.getByTitle("Expand menu").click();
await page.locator('[data-testid="button-collapse-sidebar"]').waitFor({ state: "visible" });
await settleResize();
await checkAssistantVisible("navigation expanded");

const windowErrors = await page.evaluate(() => window.__qaUnhandledErrors ?? []);
const allErrors = [...browserErrors, ...windowErrors];
check(
  "panel transitions raised no page or unhandled browser exception",
  allErrors.length === 0,
  allErrors.join(" | "),
);
check(
  "no ResizeObserver loop error was reported",
  !allErrors.some((message) => /ResizeObserver loop/i.test(message)),
  allErrors.join(" | "),
);

await chat.release();
await finish();