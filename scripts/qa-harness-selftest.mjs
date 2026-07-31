/**
 * Proves the write guard is armed, on every run, before the scripts that rely
 * on it execute.
 *
 * Without this, the guard is a claim. A refactor that reorders the route
 * installation, a Playwright upgrade that changes handler precedence, or a
 * stray direct request would all disarm it silently — and the first evidence
 * would be real data written to whatever tenant the suite was pointed at. So
 * the suite starts by attempting the exact violations it is meant to prevent
 * and asserting each one was stopped.
 *
 * The probe URLs below are deliberately non-existent paths on the app's own
 * origin: if the guard ever fails open, the run reports a violation rather than
 * mutating anything real.
 *
 *   CHROMIUM=... PLAYWRIGHT=... QA_USER_ID=... QA_COOKIE=... \
 *   node scripts/qa-harness-selftest.mjs
 */

import { readdirSync, readFileSync } from "node:fs";

import { createQaSession } from "./qa-harness.mjs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5000";

const { page, api, check, permitWrite, expectBlocked, stubWrite, violations, finish } = await createQaSession();

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const postFromPage = async (path, method = "POST") =>
  await page.evaluate(
    async ([u, m]) => {
      try {
        const res = await fetch(u, { method: m });
        return `sent:${res.status}`;
      } catch {
        return "blocked";
      }
    },
    [path, method],
  );

/* 1. An undeclared write from the page is stopped. */
check("an undeclared POST never leaves the browser", (await postFromPage("/api/qa-selftest-probe")) === "blocked");
check("an undeclared DELETE never leaves the browser", (await postFromPage("/api/qa-selftest-probe", "DELETE")) === "blocked");
check("an undeclared PATCH never leaves the browser", (await postFromPage("/api/qa-selftest-probe", "PATCH")) === "blocked");
check("each blocked write is recorded as a violation", violations.length === 3, `${violations.length} recorded`);

/* 2. Reads are untouched — the guard must not make the app look broken. */
const readStatus = await page.evaluate(async (u) => (await fetch(u)).status, `${BASE}/api/integrations/documents`);
check("GETs pass through untouched", readStatus === 200, `status ${readStatus}`);

/* 3. Playwright's APIRequestContext bypasses route handlers entirely — a call
      on it is a real request no matter what is routed. This is the hole the
      original incident could have walked through unnoticed, so the harness
      hands scripts a guarded wrapper instead. */
let threw = false;
try {
  await api.post(`${BASE}/api/qa-selftest-probe`);
} catch (err) {
  threw = /QA guard/.test(String(err));
}
check("a direct APIRequestContext write throws rather than sending", threw);

/* 3b. ...and nothing in this directory may reach around that wrapper. The raw
       context cannot be patched in place (Playwright ignores it), so the
       guarantee rests on scripts using the wrapper — checked here rather than
       trusted. The pattern is assembled at run time so this file does not match
       itself and can be scanned like every other script. */
const dir = new URL(".", import.meta.url).pathname;
const bypass = new RegExp("\\b(?:page|ctx|context)\\.re" + "quest\\s*\\.");
const offenders = readdirSync(dir)
  .filter((f) => f.endsWith(".mjs") && f !== "qa-harness.mjs")
  .filter((f) => bypass.test(readFileSync(`${dir}${f}`, "utf8")));
check("no QA script reaches around the guarded request context", offenders.length === 0, offenders.join(", "));

/* 4. A script's own stub takes precedence over the guard, and counts hits. */
const stub = await stubWrite("**/api/qa-selftest-probe**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
);
const stubbed = await postFromPage("/api/qa-selftest-probe?x=1");
check("a declared stub answers instead of the guard", stubbed === "sent:200", stubbed);
check("the stub counts its hits", stub.hits === 1, `${stub.hits}`);
await stub.release();
check("releasing a stub falls back to the guard, not to the network", (await postFromPage("/api/qa-selftest-probe?x=2")) === "blocked");

/* 5. expectBlocked silences a known denial without loosening anything. */
expectBlocked("/api/qa-selftest-expected", "self-test: a denial the script knows about");
check("an expected denial is still denied", (await postFromPage("/api/qa-selftest-expected")) === "blocked");

/* 6. permitWrite is scoped: the allowance dies with the callback. */
let permittedStatus = null;
await permitWrite("/api/qa-selftest-probe", "self-test: one deliberate real write", async () => {
  permittedStatus = await postFromPage("/api/qa-selftest-probe?permitted=1");
});
check("a permitted write is actually sent", String(permittedStatus).startsWith("sent:"), String(permittedStatus));
check("the permission expires with its callback", (await postFromPage("/api/qa-selftest-probe?after=1")) === "blocked");

/* The violations above were provoked on purpose. Clear them so the run's own
   verdict reflects the assertions rather than the probes — but only after
   confirming every one of them came from this file's own probe path, so a real
   leak elsewhere still fails the run. */
const provoked = violations.filter((v) => v.includes("/api/qa-selftest-probe")).length;
check("only the self-test's own probes were blocked", provoked === violations.length, violations.join(", "));
violations.length = 0;

await finish();
