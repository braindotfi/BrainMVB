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

/* ---------- 4. is this run capable of catching the bug at all? ----------

   The count assertion above is the real test, but on a tenant with no relevant
   records it would pass while proving nothing. So state the witness explicitly:
   a record the OLD rule (status alone) would have admitted to the automatic
   bucket, and the new rule excludes. Before the fix, this tenant rendered one
   such row; the assertion below is what turns that history into a live check.

   Text-window matching around a counterparty name was tried here and removed:
   a +/-200 character slice of body text is not a row-level association, and the
   name lookup could skip the most important assertion in the file while still
   printing ALL CHECKS PASSED. The rows carry no stable id to bind to, so the
   honest instrument is the population count, not a pretend per-row check. */

const oldRuleWouldAdmit = intents.filter(cleared);
const witnesses = oldRuleWouldAdmit.filter(humanApproved);
console.log(
  `\nregression witnesses (old status-only rule would have called these automatic): ${witnesses.length}`,
);
for (const w of witnesses) console.log(`    - ${w.id} approvals=${w.approval_ids.join(",")}`);

check(
  "this run can actually catch the bug (a human-approved record the old rule would have mislabelled exists)",
  witnesses.length > 0,
  witnesses.length > 0
    ? ""
    : "no witness on this tenant — the automatic-bucket assertions cannot fail here, so this run proves nothing",
);

/* With a witness present, this is the bug, stated as a population invariant:
   the old rule rendered 1 automatic row against 0 genuinely auto-cleared
   intents. */
check(
  "no human-approved payment is rendered as automatic",
  autoRowCount === autos.length,
  `${autoRowCount} automatic row(s) rendered, ${autos.length} auto-cleared intent(s) exist, ` +
    `${witnesses.length} human-approved record(s) the old rule would have admitted`,
);

/* And the decision itself must survive the exclusion. Not asserted by payee
   name: the surviving row is brain-core's audit projection, which renders
   "Payment approved / Approved by <actor> after review" WITHOUT counterparty or
   amount (see the follow-up issue). Demanding the name here would fail for the
   wrong reason and pressure a future author into restoring the false row to go
   green. */
const approvalRows = (body.match(/Payment approved/gi) ?? []).length;
check(
  "every human-approved payment still has its decision on the surface",
  approvalRows >= humans.length,
  `${approvalRows} approval row(s) for ${humans.length} human-approved payment(s)`,
);

await finish();
