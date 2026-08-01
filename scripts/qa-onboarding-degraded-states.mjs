/**
 * First-run walkthrough degraded-state QA.
 *
 * The walkthrough exists to prove one claim: Brain proposes, and only acts
 * inside rules you set. Everything specific it says is therefore read from the
 * tenant's live approval policy — which means the read can be pending, can
 * fail, or can honestly come back empty, and those three are NOT the same
 * sentence:
 *
 *   pending  → describe the mechanism, quote no number, claim nothing
 *   failed   → same, and in particular never "nothing runs automatically":
 *              a failed read is not evidence of an empty policy
 *   404      → the one state allowed to say "yet", because it is true
 *   known    → quote the tenant's own rule and their own limit, exactly
 *
 * The subtle failure this guards against is the reassuring one. A new user is
 * told "nothing runs automatically" because the policy service was down, closes
 * the walkthrough believing Brain is inert, and is surprised later. The screen
 * that introduces the trust model cannot be the screen that misstates it.
 *
 * Also checked: example rows are labelled as examples (a fresh tenant must not
 * read them as their own history), copy is frozen per step so a late read never
 * rewrites a sentence mid-sentence, finishing marks first-visit detection done,
 * and Settings → Replay reuses that same detection rather than a second path.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-onboarding-degraded-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server. Never
 * commit one.
 */

import { createQaSession } from "./qa-harness.mjs";

const { ctx, page, base, user, check, finish } = await createQaSession({
  viewport: { width: 1280, height: 900 },
  onboarding: "firstVisit",
});

/* ── The policy read, under our control ────────────────────────────────────
   One route, four behaviours. `hits` guards against the silent version of this
   test passing: if the pattern stopped matching, every case would quietly
   exercise the live policy and agree with itself. */
const POLICY = {
  selfApprovalBlocked: true,
  secondApprovalThreshold: { value: "25000.00", currency: "USD" },
  version: 3,
  quorumRequired: 1,
  rules: [
    {
      id: "auto-approve-utility-payments",
      applies_to: ["outbound_payment"],
      when: { "amount.lte": { value: "5000.00", currency: "USD" } },
      execute: "auto",
    },
    { id: "everything-else-confirms", applies_to: ["outbound_payment"], execute: "confirm", require: "single_signer" },
  ],
};
const LIMIT_TEXT = "5,000.00 USD";

let mode = "known";
let held = null;
let hits = 0;

await ctx.route("**/api/brain/approval-policy**", async (route) => {
  hits += 1;
  if (mode === "hang") {
    held = route; // deliberately left unanswered until the test releases it
    return;
  }
  if (mode === "fail") {
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "upstream_unavailable" }) });
  }
  if (mode === "none") {
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "policy_not_found" }) });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(POLICY) });
});

const MODAL = '[data-testid="onboarding-modal"]';
const STEP = '[data-testid^="onboarding-step-"]';
const NEXT = '[data-testid="button-onboarding-continue"]';

const stepText = () => page.locator(STEP).innerText();
const seen = (sel) => page.locator(sel).count().then((n) => n > 0);
const next = async () => {
  await page.click(NEXT);
  await page.waitForTimeout(250);
};

/** Load Home with the walkthrough unseen, under the given policy behaviour. */
async function openWalkthrough(nextMode) {
  mode = nextMode;
  held = null;
  const before = hits;
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((u) => localStorage.removeItem(`brain_onboarding_complete_${u}`), user);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(MODAL, { timeout: 20000 });
  await page.waitForTimeout(600);
  check(`[${nextMode}] the intercepted policy read is the one the screen used`, hits > before, `${hits - before} request(s)`);
}

/* Phrases that assert this tenant automates nothing. Correct for a policy we
   read; a lie for one we could not. */
const CLAIMS_NOTHING = /nothing runs automatically|no rules are active|haven't set any/i;

/* ── 1. A policy we can read: the tenant's own rule, the tenant's own number ── */
await openWalkthrough("known");

check(
  "the old 4-step source wizard is gone",
  !(await seen('[data-testid^="button-category-"]')) && !/what would you like to connect/i.test(await page.locator(MODAL).innerText()),
);
check("the walkthrough is three steps", (await page.locator(`${MODAL} [class*="rounded-full"]`).count()) > 0 && (await seen('[data-testid="onboarding-step-1"]')));

const s1 = await stepText();
check("step 1 shows the tenant's own rule", /auto approve utility payments/i.test(s1), s1.split("\n")[2] ?? "");
check("a real rule is not labelled as an example", !(await seen('[data-testid="onboarding-row-example"]')));

await next();
const s2 = await stepText();
check("step 2 quotes the tenant's actual auto-approve limit", s2.includes(LIMIT_TEXT), s2.split("\n")[1] ?? "");
check("the auto-approved illustration is labelled an example", await seen('[data-testid="onboarding-row-example"]'));

await next();
const s3 = await stepText();
check("step 3 says what escalates, using the same limit", s3.includes(`above ${LIMIT_TEXT}`), s3.split("\n")[1] ?? "");
check("step 3 keeps the propose-only promise", /never executes outside your rules/i.test(s3));
check(
  "the example's approve/decline buttons are inert",
  await page.locator('[data-testid="onboarding-row-decisions"] button[disabled]').count().then((n) => n === 2),
);
check("the last step offers the way in", /got it/i.test(await page.locator(NEXT).innerText()));

/* ── 2. A policy we could not read: no claim in either direction ── */
await openWalkthrough("fail");
let all = "";
for (let i = 0; i < 3; i += 1) {
  all += `${await stepText()}\n`;
  if (i < 2) await next();
}
check("a failed policy read never claims the tenant automates nothing", !CLAIMS_NOTHING.test(all), all.replace(/\n/g, " | "));
check("a failed policy read quotes no threshold", !/\d/.test(all));
check("a failed policy read still explains the model", /never executes outside your rules/i.test(all));

/* ── 3. Still reading: same restraint, and no error state on an explainer ── */
await openWalkthrough("hang");
const pending1 = await stepText();
check("a pending read shows the generic frame, not an error", !/unavailable|couldn't|error/i.test(pending1), pending1.split("\n")[1] ?? "");
check("a pending read claims nothing about this tenant", !CLAIMS_NOTHING.test(pending1) && !/\d/.test(pending1));

/* Copy freeze: the read lands while step 2 is on screen. */
await next();
const frozen = await stepText();
if (held) {
  await held.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(POLICY) });
  held = null;
}
mode = "known";
await page.waitForTimeout(1200);
check("a late read does not rewrite the step being read", (await stepText()) === frozen);
await next();
check("the step after it picks up the real numbers", (await stepText()).includes(LIMIT_TEXT));

/* ── 4. An honestly empty policy: the one state allowed to say "yet" ── */
await openWalkthrough("none");
const n1 = await stepText();
check("a fresh tenant is told it has no rules yet", /haven't set any yet/i.test(n1), n1.split("\n")[1] ?? "");
check("the rule on screen is marked as an example", await seen('[data-testid="onboarding-row-example"]'));
await next();
const n2 = await stepText();
check("an empty policy may say nothing runs automatically", /nothing runs automatically/i.test(n2), n2.split("\n")[1] ?? "");
check("no auto-approved example is shown when nothing is automated", !(await seen('[data-testid="onboarding-row"]')));
await next();
check("step 3 stays honest with no policy", !/\d/.test(await stepText()));

/* ── 5. Finishing, and getting back in ── */
mode = "known";
await page.click(NEXT);
await page.waitForTimeout(800);
check("finishing dismisses the walkthrough", !(await seen(MODAL)));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
check("first-visit detection remembers it was seen", !(await seen(MODAL)));

await page.goto(`${base}/settings?section=profile`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="button-replay-onboarding"]', { timeout: 20000 });
await page.click('[data-testid="button-replay-onboarding"]');
await page.waitForTimeout(1500);
check("Settings can replay the walkthrough", await seen(MODAL));
check("the replayed walkthrough starts at the beginning", await seen('[data-testid="onboarding-step-1"]'));

await finish();
