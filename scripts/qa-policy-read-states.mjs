/**
 * Approval-policy read states QA.
 *
 * brain-core answers GET /policy/{tenant} in materially different ways, and the
 * difference matters more than it looks:
 *
 *   200            — a policy exists; render what it actually says
 *   404 policy_not_found — no policy is activated. A REAL, KNOWN state.
 *   401 / 403      — the read was refused. We do not know what the policy says.
 *   5xx            — the read broke. Same: we do not know.
 *
 * The trap is collapsing the middle two into one bucket. "No policy is active
 * on this tenant yet" is a statement of fact; if an auth failure renders that
 * sentence, the app is telling a finance lead their tenant has no approval
 * policy when it may have a strict one they simply could not read. That is the
 * dangerous direction — it makes an unknown look like a permissive known.
 *
 * The reverse (a genuine 404 rendering as "Unknown") is merely unhelpful, but
 * still wrong: it hides a fact the system actually has.
 *
 * The BFF (server/brain/proxy.ts relayError) relays core's status and body
 * verbatim for BrainApiError, so the distinction leaves the server intact. What
 * these checks pin is the half that can silently rot: the CLIENT, where
 * throwIfResNotOk flattens status+body into a single Error string and
 * isPolicyNotFound recovers the 404 case by substring match. Fixtures below are
 * shaped exactly as the BFF emits them, so a change to that envelope breaks
 * these tests rather than the UI.
 *
 *   CHROMIUM=/path/to/chromium \
 *   PLAYWRIGHT=/path/to/playwright/index.mjs \
 *   QA_USER_ID=<user uuid> QA_COOKIE=<brain.sid value> \
 *   node scripts/qa-policy-read-states.mjs
 *
 * QA_COOKIE is a session id for a logged-in account on the target server. Never
 * commit one.
 */

import { createQaSession } from "./qa-harness.mjs";

const { ctx, page, base, check, finish } = await createQaSession({ viewport: { width: 1280, height: 1000 } });

/* Exactly what server/brain/proxy.ts relayError() writes for a BrainApiError:
   core's status on the response, and core's body nested under `body`. */
const upstream = (status, body) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ error: "brain_upstream_error", status, body }),
});

const CASES = {
  ok: {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      selfApprovalBlocked: true,
      secondApprovalThreshold: { value: "10000.00", currency: "USD" },
      version: 3,
      quorumRequired: 2,
      rules: [
        {
          id: "auto_small",
          applies_to: ["outbound_payment"],
          execute: "auto",
          when: { "amount.lte": { value: "2500.00", currency: "USD" } },
        },
      ],
    }),
  },
  notFound: upstream(404, { error: "policy_not_found", message: "no active policy for tenant" }),
  unauthorized: upstream(401, { error: "unauthorized", message: "token rejected" }),
  forbidden: upstream(403, { error: "forbidden", message: "missing scope policy:read" }),
  serverError: upstream(500, { error: "internal_error", message: "upstream exploded" }),
  /* Not a BrainApiError — an unexpected throw inside the BFF. This is the only
     case that legitimately collapses, and it collapses to 502. */
  proxyError: {
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: "brain_proxy_error", message: "socket hang up" }),
  },
};

let current = "ok";
await ctx.route("**/api/brain/approval-policy**", (route) => route.fulfill(CASES[current]));

const VALUE = '[data-testid="text-auto-approve-limit"]';
const ROW = '[data-testid="setting-row-auto-approve-limit"]';

const load = async (mode) => {
  current = mode;
  await page.goto(`${base}/settings?section=profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(ROW, { timeout: 15_000 });
  await page.waitForTimeout(1200);
};

const valueText = async () => (await page.locator(VALUE).innerText()).trim();
const rowText = async () => (await page.locator(ROW).innerText()).replace(/\s+/g, " ").trim();

/* ── 200: say what the policy actually says ──────────────────────────────── */
await load("ok");
check("a readable policy renders its real limit", (await valueText()).includes("2,500"), await valueText());
check(
  "…and does not hedge about a value it knows",
  !/unknown/i.test(await rowText()),
  await rowText(),
);

/* ── 404 policy_not_found: a real, known absence ─────────────────────────── */
await load("notFound");
const nf = await rowText();
check("404 policy_not_found reads as a known absence, not an unknown", /No policy/i.test(await valueText()), await valueText());
check("…and says so in plain words", /No approval policy is active on this tenant yet/i.test(nf), nf);
check("…and never calls a known absence 'unknown'", !/unknown/i.test(nf), nf);

/* ── 401 / 403 / 5xx: we do not know, and must not imply otherwise ───────── */
for (const [mode, label] of [
  ["unauthorized", "401"],
  ["forbidden", "403"],
  ["serverError", "500"],
  ["proxyError", "502 proxy error"],
]) {
  await load(mode);
  const t = await rowText();
  const v = await valueText();
  check(`${label} reads as Unknown`, /unknown/i.test(v), v);
  check(
    `${label} never claims the tenant has no policy`,
    !/No approval policy is active|No policy/i.test(v),
    v,
  );
  check(
    `${label} says the limit is unknown rather than absent`,
    /unknown, not absent/i.test(t),
    t,
  );
  check(`${label} never shows a number it could not read`, !/[\d],?\d*\.\d\d/.test(v), v);
}

/* ── The two states must not be interchangeable ──────────────────────────── */
await load("notFound");
const notFoundValue = await valueText();
await load("unauthorized");
const unauthorizedValue = await valueText();
check(
  "a missing policy and an unreadable one are visibly different states",
  notFoundValue !== unauthorizedValue,
  `404 → "${notFoundValue}"  vs  401 → "${unauthorizedValue}"`,
);

await finish();
