/**
 * Does the "Approved automatically" bucket contain ONLY payments that cleared
 * without a human?
 *
 * WHY THIS EXISTS
 *
 * The Inbox once told an operator that a $19,400 payment they had personally
 * approved was "Approved automatically — no human approval was required",
 * printed directly beside the audit row naming them as the approver. The cause
 * was classifying on status: `approved` is the terminal status of BOTH the
 * human and the automatic path, so the bucket borrowed human approvals to look
 * populated. The distinguishing evidence is `approval_ids`.
 *
 * A synthetic empty-state check would not have caught that, because the bug
 * only appears once a REAL approval exists on the tenant. So this walks actual
 * records: it reads every money-path intent, splits them by approval evidence,
 * and holds the rendered Inbox to that split.
 *
 * TWO ARMS, AND NEITHER MAY PASS VACUOUSLY
 *
 *   human-approved  an intent with a real appr_ record. If the tenant has none,
 *                   the script CREATES one (propose + approve, both declared
 *                   writes) so this arm always runs against a real payment.
 *                   It must never render as automatic.
 *
 *   auto-cleared    an intent on a cleared status with an empty approval array.
 *                   These must render, with the automatic wording.
 *
 * The auto arm cannot be manufactured from the client: a policy `outcome:
 * allow` with `required_approvers: []` still produces a `pending_approval`
 * intent that waits for a person, and the only endpoint that could move one
 * further needs a scope this app's token does not hold. So when the tenant has
 * no such record the arm reports NOT PRODUCIBLE and asserts the bucket is
 * empty. That is a real assertion — the bug being guarded against is exactly a
 * bucket that is populated when it should be empty — but the run says so out
 * loud rather than banking a green tick it did not earn.
 *
 *   QA_USER_ID=$(cat /tmp/qa-uid) QA_COOKIE=$(cat /tmp/qa-sid) \
 *     node scripts/qa-auto-approved-provenance.mjs
 */
import { createQaSession } from "./qa-harness.mjs";

const AUTO_WORDING = /Approved automatically|cleared automatically|no human approval was required/i;

const { page, api, base, check, permitWrite, finish } = await createQaSession();

/* ---------- 1. the tenant's real money-path records ---------- */

const listed = await (await api.get(`${base}/api/brain/proposals`)).json();
const intentIds = [
  ...new Set((listed.proposals ?? []).map((p) => p.payment_intent_id).filter(Boolean)),
];

async function detail(id) {
  return await (await api.get(`${base}/api/brain/payment-intents/${id}?expand=agent`)).json();
}
let intents = await Promise.all(intentIds.map(detail));

const cleared = (i) => i.status === "proposed" || i.status === "approved";
const humanApproved = (i) => Array.isArray(i.approval_ids) && i.approval_ids.length > 0;
const autoCleared = (i) => cleared(i) && Array.isArray(i.approval_ids) && i.approval_ids.length === 0;

/* ---------- 2. make sure the human arm is never vacuous ---------- */

if (!intents.some(humanApproved)) {
  const candidate = (listed.proposals ?? []).find(
    (p) => p.payment_intent_id && p.available_decisions?.some((d) => d.id === "approve"),
  );
  if (candidate) {
    await permitWrite(
      /\/api\/brain\/payment-intents\/.+\/approve/,
      "produce the human-approved payment this test is about",
      async () =>
        await api.post(`${base}/api/brain/payment-intents/${candidate.payment_intent_id}/approve`, {
          data: {},
        }),
    );
    intents = await Promise.all(intentIds.map(detail));
  }
}

const humans = intents.filter(humanApproved);
const autos = intents.filter(autoCleared);
console.log(`\nmoney-path intents: ${intents.length}`);
console.log(`  human-approved (appr_ record present): ${humans.length}`);
for (const i of humans) console.log(`    - ${i.id} status=${i.status} approvals=${i.approval_ids.join(",")}`);
console.log(`  auto-cleared (cleared status, no approval): ${autos.length}`);
for (const i of autos) console.log(`    - ${i.id} status=${i.status}`);

check(
  "human arm has a real payment to test against (not a vacuous pass)",
  humans.length > 0,
  humans.length > 0 ? "" : "no human-approved intent exists and none could be produced",
);
if (autos.length === 0) {
  console.log(
    "\n  NOTE: auto arm NOT PRODUCIBLE on this tenant — no intent has ever cleared\n" +
      "  without a human, so the bucket is asserted empty rather than populated.",
  );
}

/* ---------- 3. what the Inbox actually renders ---------- */

await page.goto(`${base}/inbox`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const resolvedTab = page.locator("text=/^Resolved/").first();
if (await resolvedTab.count()) {
  await resolvedTab.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(4000);
}
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");

const autoRowCount = (body.match(/Approved automatically/gi) ?? []).length;

check(
  `the automatic bucket holds exactly the ${autos.length} genuinely auto-cleared payment(s)`,
  autoRowCount === autos.length,
  `rendered ${autoRowCount} "Approved automatically" row(s) for ${autos.length} auto-cleared intent(s)`,
);

/* The bug itself: a human approval wearing the automatic wording. Checked per
   record, by the counterparty name shown on its row, so a failure names the
   payment instead of just reporting a count mismatch.

   An unresolvable name FAILS. The first version of this loop skipped such a
   record with `continue`, which silently dropped the single most important
   assertion in the file and still printed ALL CHECKS PASSED — the same class of
   mistake as the bug under test: a green result standing in for evidence that
   was never gathered. */
const cpList = await (await api.get(`${base}/api/brain/ledger/counterparties`)).json();
const cpName = new Map(
  (cpList.counterparties ?? cpList.data ?? []).map((c) => [c.id, c.name ?? c.display_name]),
);

for (const i of humans) {
  const name = cpName.get(i.destination_counterparty_id);
  check(
    `counterparty for ${i.id} resolves, so its row can be located`,
    Boolean(name),
    name ? "" : `no name for ${i.destination_counterparty_id} — cannot verify this record`,
  );
  if (!name) continue;
  /* The record's DECISION must survive the exclusion, but do not demand the
     payee name: the surviving row is brain-core's audit projection, which
     renders "Payment approved / Approved by <actor> after review" WITHOUT the
     counterparty or the amount. That thinness is a pre-existing gap in the
     audit projection, not something this fix introduced — the payee was only
     ever visible on the row that was lying about how it cleared. Asserting on
     the name here would fail for the wrong reason and pressure a future author
     into restoring the false row to make the test green. */
  const approvalRows = (body.match(/Payment approved/gi) ?? []).length;
  check(
    `the decision on ${name}'s payment survives (an approval row is still shown)`,
    approvalRows >= humans.length,
    `${approvalRows} approval row(s) for ${humans.length} human-approved payment(s)`,
  );
  if (!body.includes(name)) continue;

  const at = body.indexOf(name);
  const window = body.slice(Math.max(0, at - 200), at + 400);
  const wrong = window.match(AUTO_WORDING);
  check(
    `human-approved payment to ${name} is NOT described as automatic`,
    !wrong,
    wrong ? `renders "${wrong[0]}"` : "",
  );
  check(
    `human-approved payment to ${name} still surfaces truthfully`,
    /Approved by .+ after review|Payment approved/i.test(window),
    /Approved by .+ after review|Payment approved/i.test(window)
      ? window.match(/Approved by .+? after review|Payment approved/i)[0]
      : "no truthful row found near the record",
  );
}

await finish();
