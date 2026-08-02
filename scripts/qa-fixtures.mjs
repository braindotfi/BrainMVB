/**
 * Shared read-fixtures for QA scripts.
 *
 * These stub GET responses only. They exist because the demo tenant is missing
 * data that some surfaces are entirely about — most importantly proposals, which
 * are empty upstream, so Overview and Inbox render their empty states and the
 * decision rows never appear. A screenshot or a measurement of an empty state
 * proves nothing about the rows it was supposed to check.
 *
 * Keep these shaped exactly like the BFF's real response (client/src/lib/
 * brainProposals.ts). A fixture that drifts from the contract turns a passing
 * run into a statement about the fixture rather than the app.
 */

const proposal = (over) => ({
  status: "pending",
  risk_band: "standard",
  confidence: 0.82,
  mode: "propose",
  evidence: [],
  payment_intent_id: null,
  action_type: null,
  stored_action_type: null,
  details: null,
  policy: null,
  presentation: null,
  key_facts: null,
  resolved_refs: null,
  created_at: "2026-08-01T09:00:00Z",
  available_decisions: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Decline" },
  ],
  ...over,
});

/** One record that fits on a single line — directly comparable to a Security
 *  row — and one long enough to wrap, where a fixed height would clip. */
export const PROPOSALS_FIXTURE = {
  next_cursor: null,
  proposals: [
    proposal({
      id: "prop_qa_short",
      type: "collections",
      narrative: "Thornebury Imports is 34 days late.",
      agent: { id: "ag_qa_1", kind: "collections", display_name: "Collections Agent" },
      subject: { label: "Customer", display: "Thornebury Imports" },
    }),
    proposal({
      id: "prop_qa_long",
      type: "treasury",
      risk_band: "elevated",
      narrative:
        "Balances above the operating floor have been idle for eleven days across three separate accounts, and the quarter closes on Friday.",
      agent: { id: "ag_qa_2", kind: "treasury", display_name: "Treasury Agent" },
      subject: {
        label: "Account",
        display: "Operating cash — higher-yield reserve transfer before quarter close",
      },
    }),
  ],
};

export const PROPOSALS_ROUTE = "**/api/brain/proposals*";

/** Install the proposals fixture on a page. */
export async function stubProposals(page, fixture = PROPOSALS_FIXTURE) {
  await page.route(PROPOSALS_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }),
  );
}
