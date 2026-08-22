import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const AGENT_RUN_INPUT = "client/src/lib/agentRunInput.ts";
const FINANCES_PAGE   = "client/src/pages/FinancesPage.tsx";

/**
 * Source-scan checks that pin the structural wiring connecting the 'Find
 * Transaction' button to the TransactionDetailPopup.
 *
 * The behavioral end of this contract (inputRowFixPath actually returning
 * &tx=<ref>) is covered by client/src/lib/agentRunInput.test.ts. These
 * checks guard the receiving end: FinancesPage must read ?tx=, open the
 * popup via setOpenTxId, and clear the param when the user switches tabs.
 */

describe("Find Transaction deep-link — inputRowFixPath source structure", () => {
  const src = readFileSync(AGENT_RUN_INPUT, "utf8");

  // Scope all assertions to the body of inputRowFixPath itself.
  const fnStart = src.indexOf("export function inputRowFixPath");
  expect(fnStart, "export function inputRowFixPath not found").toBeGreaterThan(-1);
  const fnBody = src.slice(fnStart);

  it("the inputRowFixPath function body handles transaction_record", () => {
    // Confirm the case label exists inside the function (not just in a comment).
    const caseIdx = fnBody.indexOf('case "transaction_record"');
    expect(
      caseIdx,
      '"transaction_record" case label not found in inputRowFixPath body',
    ).toBeGreaterThan(-1);
  });

  it("the inputRowFixPath function body handles the 'transaction' alias", () => {
    const caseIdx = fnBody.indexOf('case "transaction"');
    expect(
      caseIdx,
      '"transaction" case label not found in inputRowFixPath body',
    ).toBeGreaterThan(-1);
  });

  it("the transaction case block appends &tx= to the URL when a ref is present", () => {
    // The ternary that produces the tx URL must be present in the function body.
    const withTx = fnBody.indexOf("tab=cash-flow&tx=");
    expect(
      withTx,
      "tab=cash-flow&tx= not found in inputRowFixPath body — the deep-link is broken",
    ).toBeGreaterThan(-1);

    // And the tx-append must come after the transaction_record case label.
    const caseIdx = fnBody.indexOf('case "transaction_record"');
    expect(withTx).toBeGreaterThan(caseIdx);
  });

  it("the transaction case block has a fallback path with no tx param", () => {
    // When entityRefs is empty there is nothing to open; the fallback must be
    // a bare tab link with no ?tx= so FinancesPage does not call setOpenTxId(null).
    const noTxPath = fnBody.indexOf('"/ledger?tab=cash-flow"');
    expect(
      noTxPath,
      '"/ledger?tab=cash-flow" fallback not found in inputRowFixPath body',
    ).toBeGreaterThan(-1);

    // Both branches live inside the same case block.
    const caseIdx = fnBody.indexOf('case "transaction_record"');
    expect(noTxPath).toBeGreaterThan(caseIdx);
  });
});

describe("Find Transaction deep-link — FinancesPage wiring", () => {
  const src = readFileSync(FINANCES_PAGE, "utf8");

  it("reads the ?tx= param from the search string on every search change", () => {
    // Must use .get("tx") (not a one-time mount effect) so a second deep-link
    // to a different transaction without leaving the page reopens the popup.
    expect(src).toContain('.get("tx")');
  });

  it("the tx useEffect calls setOpenTxId(txParam) when txParam is truthy", () => {
    // The exact body that ships must call setOpenTxId with the param value.
    // This literal is specific enough that only the real effect satisfies it:
    // a removed or renamed call causes the test to fail.
    expect(
      src,
      "setOpenTxId(txParam) not found — the tx param effect is broken or renamed",
    ).toContain("if (txParam) setOpenTxId(txParam)");
  });

  it("the tx useEffect declares txParam as its only dependency", () => {
    // The dependency array must list txParam so React re-runs the effect on
    // every search change, not just on mount.  Without this, a second deep-link
    // to a different tx id on the same page visit never opens the popup.
    const effectBody = src.indexOf("if (txParam) setOpenTxId(txParam)");
    expect(effectBody).toBeGreaterThan(-1);
    // The closing of the effect + dependency array must follow immediately.
    const depArray = src.indexOf("}, [txParam]);", effectBody);
    expect(
      depArray,
      '}, [txParam]); not found after the tx effect body — dependency array is wrong',
    ).toBeGreaterThan(-1);
  });

  it("closeTx deletes the ?tx= param so the effect cannot immediately reopen the popup", () => {
    // If closing the popup did not remove ?tx= from the URL, the useEffect
    // would fire again on the next render and reopen what the user just dismissed.
    expect(src).toContain('params.delete("tx")');
  });

  it("'tx' is in TAB_SCOPED_PARAMS so it is cleared when the user switches tabs", () => {
    // Scoped to the TAB_SCOPED_PARAMS declaration; checks the exact string
    // in the array literal rather than anywhere in the file.
    const match = src.match(/const TAB_SCOPED_PARAMS\s*=\s*\[([^\]]*)\]/);
    expect(
      match,
      "TAB_SCOPED_PARAMS declaration not found in FinancesPage",
    ).toBeTruthy();
    expect(
      match![1],
      '"tx" not listed in TAB_SCOPED_PARAMS — switching tabs will leave a stale ?tx= in the URL',
    ).toContain('"tx"');
  });

  it("TransactionDetailPopup is rendered with openTxId wired to its txId prop", () => {
    // The popup must receive openTxId as txId. If the state variable is renamed
    // or the prop name changes without updating the other, the popup never opens.
    expect(
      src,
      "TransactionDetailPopup txId={openTxId} not found — prop wiring is broken",
    ).toContain("TransactionDetailPopup txId={openTxId}");
  });

  it("TransactionDetailPopup receives closeTx as its onClose handler", () => {
    // If onClose is not wired to closeTx, dismissing the popup does not remove
    // the ?tx= param and the effect reopens it immediately.
    expect(src).toContain("onClose={closeTx}");
  });
});
