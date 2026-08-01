/**
 * Settings → Sources QA.
 *
 * Item 6 replaced a sidebar button + four-step modal wizard with a permanent
 * Settings section. Three classes of defect survive a type check:
 *
 *   1. The old structure lingering. If the sidebar button or the wizard is still
 *      reachable, there are now two answers to "where do I add a source" and one
 *      of them is the thing we set out to remove.
 *   2. Invented currency. Every account row carries a time phrase. Only
 *      brain-core sources publish a real `last_synced_at`; BrainMVB's own bank
 *      and tool connections know when they were CONNECTED and nothing more.
 *      Captioning the second as the first tells someone their bank feed is
 *      current when it may not have been read since the day they linked it.
 *   3. Degraded reads. A failed feed and a feed that has not answered yet are
 *      both misreported by "No accounts connected yet" — and the count above the
 *      lists is a completeness claim that has to qualify itself in both cases.
 *
 * Expected rows are derived from the live tenant at run time, never hardcoded:
 * the demo seed rolls its dates forward, so a pinned expectation would rot.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-sources-page-degraded-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server. Never
 * commit one.
 */

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";
const USER = process.env.QA_USER_ID;
const COOKIE = process.env.QA_COOKIE;
const CHROMIUM = process.env.CHROMIUM;
const PLAYWRIGHT = process.env.PLAYWRIGHT ?? "playwright";

if (!USER || !COOKIE) {
  console.error("QA_USER_ID and QA_COOKIE are required. See the header of this file.");
  process.exit(2);
}

const { chromium } = await import(PLAYWRIGHT);

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([
  { name: "brain.sid", value: COOKIE, domain: new URL(BASE).hostname, path: "/" },
]);
await ctx.addInitScript((u) => {
  localStorage.setItem(`brain_onboarding_complete_${u}`, "true");
}, USER);

const page = await ctx.newPage();
const failures = [];
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures.push(label);
};

const count = async (sel) => await page.locator(sel).count();
const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => "")) ?? "";
const go = async (settle = 3000) => {
  await page.goto(`${BASE}/settings?section=sources`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
};

/* Reads retry for several seconds. Poll until the answer stops being
   provisional, then judge THAT — otherwise the assertion races the retry. */
const settle = async (read, isProvisional, timeout = 20000) => {
  const started = Date.now();
  let value = await read();
  while (isProvisional(value) && Date.now() - started < timeout) {
    await page.waitForTimeout(500);
    value = await read();
  }
  return value;
};

const COUNT = '[data-testid="text-source-count"]';
const ACCOUNTS = '[data-testid="list-connected-accounts"]';
const DOCUMENTS = '[data-testid="list-documents"]';
const NOTICE = '[data-testid="notice-sources-unavailable"]';

/* ── what the tenant actually has, straight from the feeds ────────────────── */
const api = async (path) => {
  const res = await page.request.get(`${BASE}${path}`);
  return res.ok() ? await res.json().catch(() => null) : null;
};

await go();

const brainRaw = await api("/api/brain/sources");
const brainRows = Array.isArray(brainRaw?.data) ? brainRaw.data : Array.isArray(brainRaw) ? brainRaw : [];
const liveBrain = brainRows.filter((r) => !["disconnected", "revoked", "deleted"].includes(String(r?.status ?? "").toLowerCase()));
const withSyncTime = liveBrain.filter((r) => typeof r?.last_synced_at === "string" && r.last_synced_at !== "");
const banks = (await api("/api/integrations/plaid/connections")) ?? [];
const tools = (await api("/api/integrations/connections")) ?? [];
const docs = (await api("/api/integrations/documents")) ?? [];
const expectedAccounts = liveBrain.length + banks.length + tools.length;

console.log(
  `\ntenant: ${liveBrain.length} brain sources (${withSyncTime.length} with a sync time), ` +
  `${banks.length} banks, ${tools.length} tools, ${docs.length} documents\n`,
);

/* ── the section exists and is the whole story ────────────────────────────── */
check("Settings → Sources renders its subhead", (await count('[data-testid="text-sources-subhead"]')) === 1);
check("the connected-accounts list is present", (await count(ACCOUNTS)) === 1);
check("the documents list is present", (await count(DOCUMENTS)) === 1);
check("both lists are labelled", (await count('[data-testid="label-connected-accounts"]')) === 1 && (await count('[data-testid="label-documents"]')) === 1);

const renderedAccounts = await count(`${ACCOUNTS} [data-testid^="source-"]`);
const renderedDocs = await count(`${DOCUMENTS} [data-testid^="source-doc-"]`);
check("every connected account is listed", renderedAccounts === expectedAccounts, `${renderedAccounts} rendered vs ${expectedAccounts} live`);
check("every document is listed", renderedDocs === docs.length, `${renderedDocs} rendered vs ${docs.length} live`);

const countText = await settle(() => text(COUNT), (t) => t.includes("Checking") || t.includes("still checking"));
check(
  "the count matches what is actually shown",
  countText.startsWith(`${expectedAccounts + docs.length} connected source`),
  countText,
);

/* ── the old structure is gone, not merely bypassed ───────────────────────── */
check("the sidebar no longer offers Add Source", (await count('nav [data-testid="button-add-source"]')) === 0);
check("the collapsed sidebar no longer offers Add Source", (await count('[data-testid="nav-collapsed-add-source"]')) === 0);
check("exactly one Add source control exists on the page", (await count('[data-testid="button-add-source"]')) === 1);

await page.locator('[data-testid="button-add-source"]').click();
await page.waitForTimeout(1200);
check("adding a source opens an inline form, not a modal", (await count('[role="dialog"]')) === 0);
check("the inline form is on the page", (await count('[data-testid="form-add-source"]')) === 1);
check("the lists stay visible while adding", (await count(ACCOUNTS)) === 1);

/* ── the form hands off to a real mechanism per category ──────────────────── */
const MECHANISMS = [
  ["bank", "bank"],
  ["payments", "providers"],
  ["documents", "documents"],
  ["tax", "documents"],
  ["accounting", "providers"],
];
for (const [category, mechanism] of MECHANISMS) {
  await page.selectOption('[data-testid="select-source-category"]', category);
  await page.waitForTimeout(900);
  check(
    `category "${category}" offers the ${mechanism} mechanism`,
    (await count(`[data-testid="add-source-mechanism-${mechanism}"]`)) === 1,
  );
}
/* The screens carry their own reassurance copy for the modal path. Inline, the
   page says it once below the form; twice reads as a warning. */
await page.selectOption('[data-testid="select-source-category"]', "payments");
await page.waitForTimeout(900);
const formCopy = await text('[data-testid="form-add-source"]');
check(
  "the inline form does not repeat the page's reassurance copy",
  !/Read-only by Default|Secure by Default|Brain Reads but Doesn't Share/.test(formCopy),
  formCopy.replace(/\s+/g, " ").slice(0, 100),
);

await page.selectOption('[data-testid="select-source-category"]', "documents");
await page.waitForTimeout(900);
check("the document mechanism is a real file picker", (await count('[data-testid="input-add-source-file"]')) === 1);
check("the inline form does not repeat the document list above the page's own", (await count(`[data-testid="form-add-source"] [data-testid^="doc-row-"]`)) === 0);

/* An upload in flight is the one thing the inline form SHOULD report. It must
   report only that: the persisted rows belong to the list below, and rendering
   them here duplicates every row and every test id on the page. */
if (docs.length > 0) {
  /* The upload is intercepted and left hanging: the file must never reach the
     tenant. If the interception ever misses, the check below catches it and the
     cleanup at the end removes what landed. */
  let ingestHits = 0;
  await page.route("**/api/integrations/documents/ingest**", () => {
    ingestHits += 1;
    return new Promise(() => {});
  });
  await page.locator('[data-testid="input-add-source-file"]').setInputFiles({
    name: "qa-upload-probe.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("date,amount\n2026-01-01,1.00\n"),
  });
  await page.waitForTimeout(1500);
  const firstDocId = docs[0].id;
  check(
    "an in-flight upload is reported inline",
    /Uploading/i.test(await text('[data-testid="form-add-source"]')),
  );
  check(
    "an in-flight upload does not drag the document list into the form",
    (await count(`[data-testid="form-add-source"] [data-testid^="doc-row-"]`)) === 0,
  );
  check(
    "no document's remove control is rendered twice",
    (await count(`[data-testid="button-remove-doc-${firstDocId}"]`)) === 1,
  );
  check(
    "no document's extract status is rendered twice",
    (await count(`[data-testid="doc-status-${firstDocId}"]`)) === 1,
  );
  await page.unroute("**/api/integrations/documents/ingest**");
  await go();
  await page.locator('[data-testid="button-add-source"]').click();
  await page.waitForTimeout(900);
}

await page.locator('[data-testid="button-add-source"]').click();
await page.waitForTimeout(800);
check("the form closes again", (await count('[data-testid="form-add-source"]')) === 0);

/* ── time phrases must be earned ──────────────────────────────────────────── */
const accountCaptions = await page.locator(`${ACCOUNTS} [data-testid^="source-"] p`).allTextContents();
const syncedRows = accountCaptions.filter((c) => c.includes("last synced"));
check(
  "only sources that publish a sync time claim one",
  syncedRows.length === withSyncTime.length,
  `${syncedRows.length} rows say "last synced", ${withSyncTime.length} sources publish one`,
);
const bankCaptions = await page.locator('[data-testid^="source-bank-"] p').allTextContents();
check(
  "a bank connection is never captioned as recently synced",
  bankCaptions.every((c) => !c.includes("last synced")),
  bankCaptions.join(" | ") || "no bank rows on this tenant",
);
/* Seeded sources carry sync_disabled: permanently stale by arithmetic. Reporting
   that would be crying wolf about a fixture. */
const seeded = liveBrain.filter((r) => r?.metadata?.sync_disabled === true).length;
if (seeded > 0) {
  const overdue = accountCaptions.filter((c) => c.includes("sync overdue")).length;
  check(
    "a source that never syncs is not reported as overdue",
    overdue === 0,
    `${seeded} seeded sources, ${overdue} rows flagged overdue`,
  );
}

/* ── removing asks first, and says what removal does not undo ─────────────── */
if (docs.length > 0) {
  let deleteAttempts = 0;
  await page.route("**/api/integrations/documents/*/delete", (route) => {
    deleteAttempts += 1;
    return route.abort();
  });
  const firstDoc = docs[0].id;
  await page.locator(`[data-testid="button-remove-doc-${firstDoc}"]`).click();
  await page.waitForTimeout(700);
  const confirmText = await text(`[data-testid="source-doc-${firstDoc}"]`);
  check("Remove asks for confirmation before disconnecting", (await count(`[data-testid="button-remove-doc-${firstDoc}-confirm"]`)) === 1);
  check(
    "the confirmation says what removal does NOT undo",
    /not undone/i.test(confirmText),
    confirmText.replace(/\s+/g, " ").slice(0, 120),
  );
  check("nothing was deleted by opening the confirmation", deleteAttempts === 0);
  await page.locator(`[data-testid="source-doc-${firstDoc}"] button`, { hasText: "Cancel" }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.unroute("**/api/integrations/documents/*/delete");
}

/* Upstream-restricted connections are not ours to sever: no dead control. */
const restricted = liveBrain.filter((r) => r?.metadata?.disconnect_hidden === true || r?.metadata?.disconnectable === false);
for (const r of restricted.slice(0, 3)) {
  check(
    `an upstream-restricted source offers no Remove (${r.id})`,
    (await count(`[data-testid="button-remove-source-${r.id}"]`)) === 0,
  );
}

/* ── degraded reads: failed ───────────────────────────────────────────────── */
const FEEDS = {
  "brain sources": "**/api/brain/sources**",
  documents: "**/api/integrations/documents**",
  banks: "**/api/integrations/plaid/connections**",
};
for (const [name, pattern] of Object.entries(FEEDS)) {
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "qa_forced_failure" }) }),
  );
  await go();
  const notice = await settle(() => count(NOTICE), (n) => n === 0);
  check(`a failed ${name} read raises the incomplete notice`, notice === 1);

  const qualified = await settle(
    () => text(COUNT),
    (t) => t.includes("Checking") || t.includes("still checking"),
  );
  check(
    `the count admits the ${name} feed is missing`,
    /couldn't be loaded/.test(qualified),
    qualified,
  );

  if (name === "documents") {
    const body = await text(DOCUMENTS);
    check(
      "a failed documents read does not render as 'no documents'",
      !/No documents uploaded yet/.test(body) && /couldn't load/i.test(body),
      body.replace(/\s+/g, " ").slice(0, 120),
    );
  }
  await page.unroute(pattern);
}

/* ── degraded reads: pending is a third state, not a quiet 'no' ───────────── */
const hang = (route) => new Promise(() => { void route; });
for (const [name, pattern] of [["brain sources", FEEDS["brain sources"]], ["documents", FEEDS.documents]]) {
  await page.route(pattern, hang);
  await page.goto(`${BASE}/settings?section=sources`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const pendingCount = await text(COUNT);
  check(
    `a hanging ${name} read never reports a settled total`,
    /Checking your sources|still checking/.test(pendingCount),
    pendingCount,
  );
  const list = name === "documents" ? DOCUMENTS : ACCOUNTS;
  const body = await text(list);
  check(
    `a hanging ${name} read does not render as an empty list`,
    !/No accounts connected yet|No documents uploaded yet/.test(body),
    body.replace(/\s+/g, " ").slice(0, 100),
  );
  check(
    `a hanging ${name} read does not claim a failure either`,
    !/couldn't load/i.test(body),
    body.replace(/\s+/g, " ").slice(0, 100),
  );
  await page.unroute(pattern);
}

/* ── the probe left nothing behind ────────────────────────────────────────── */
const afterDocs = (await api("/api/integrations/documents")) ?? [];
const strays = afterDocs.filter((d) => String(d?.name ?? "").startsWith("qa-upload-probe"));
check("the probe upload never reached the tenant", strays.length === 0, `${strays.length} stray file(s)`);
for (const stray of strays) {
  await page.request.post(`${BASE}/api/integrations/documents/${stray.id}/delete`);
  console.log(`      cleaned up ${stray.name} (${stray.id})`);
}

/* ── the retired wizard is unreachable ────────────────────────────────────── */
await go();
const wizardMarkers = await page.evaluate(() =>
  document.body.innerHTML.includes("Sources Brain Reads From") ||
  document.body.innerHTML.includes("Add New Source"),
);
check("the wizard's home screen is gone from the app", !wizardMarkers);

console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILED:\n  - ${failures.join("\n  - ")}`}`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
