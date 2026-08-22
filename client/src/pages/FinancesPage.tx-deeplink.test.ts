/**
 * Source-scan guards for the Finances page transaction deep-link.
 *
 * #248 — Confirm the transaction popup actually receives the deep-linked ID,
 *   not just that state exists.
 *
 *   PR #204 added ?tx= param support: FinancesPage reads the `tx` search
 *   param in a useEffect and calls setOpenTxId(txParam) to open the correct
 *   popup row. This test pins that the effect actually passes the param value
 *   INTO the popup prop (txId={openTxId}), not just that the state variable
 *   exists somewhere in the file.
 *
 *   It also confirms:
 *   - "tx" is in TAB_SCOPED_PARAMS so it's cleared when switching tabs.
 *   - The cleanup function (closeTx) clears the URL param.
 *   - TransactionDetailPopup receives txId={openTxId} as its prop.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FINANCES = "client/src/pages/FinancesPage.tsx";
const AGENT_RUN_INPUT = "client/src/lib/agentRunInput.ts";

// ─── #248: Transaction popup receives the deep-linked ID ─────────────────────

describe("Transaction popup receives the deep-linked ID (#248)", () => {
  it("openTxId state variable is declared in FinancesPage", () => {
    const src = readFileSync(FINANCES, "utf8");
    expect(src, "openTxId must be a useState variable").toMatch(
      /const \[openTxId,\s*setOpenTxId\]/,
    );
  });

  it("tx param is read from the URL search string in a useEffect that runs when it changes", () => {
    const src = readFileSync(FINANCES, "utf8");
    const txParamIdx = src.indexOf("const txParam");
    expect(txParamIdx, "txParam variable not found").toBeGreaterThan(-1);
    const window = src.slice(txParamIdx, txParamIdx + 200);
    expect(window, "txParam must call new URLSearchParams(search).get('tx')").toMatch(
      /URLSearchParams.*search.*\.get\(["'`]tx["'`]\)/,
    );
    expect(window, "txParam must be consumed in a useEffect dependency").toMatch(
      /\[txParam\]/,
    );
  });

  it("the useEffect sets openTxId to the param value (not just checks it exists)", () => {
    const src = readFileSync(FINANCES, "utf8");
    // Find the txParam useEffect and confirm it calls setOpenTxId(txParam).
    expect(src, "setOpenTxId must be called with txParam as argument").toMatch(
      /if \(txParam\)\s*setOpenTxId\(txParam\)/,
    );
  });

  it("TransactionDetailPopup receives txId={openTxId} so the popup opens on the right row", () => {
    const src = readFileSync(FINANCES, "utf8");
    expect(src, "txId={openTxId} must be passed to TransactionDetailPopup").toMatch(
      /TransactionDetailPopup[\s\S]{0,300}txId=\{openTxId\}/,
    );
  });

  it('"tx" is in TAB_SCOPED_PARAMS so switching tabs clears the deep-link', () => {
    const src = readFileSync(FINANCES, "utf8");
    const tspMatch = src.match(/const TAB_SCOPED_PARAMS\s*=\s*\[([^\]]+)\]/);
    expect(tspMatch, "TAB_SCOPED_PARAMS must be defined").not.toBeNull();
    expect(tspMatch![1], '"tx" must be in TAB_SCOPED_PARAMS').toMatch(/"tx"/);
  });

  it("closeTx clears the tx URL param so the popup cannot re-open on a back-navigation", () => {
    const src = readFileSync(FINANCES, "utf8");
    expect(src, "closeTx function must exist").toMatch(/const closeTx\s*=/);
    const closeTxIdx = src.indexOf("const closeTx");
    const closeSrc = src.slice(closeTxIdx, closeTxIdx + 300);
    // The param variable name may vary (sp, params, searchParams, etc.) — match
    // .delete("tx") / .delete('tx') regardless of the receiver name.
    expect(closeSrc, 'closeTx must call .delete("tx") to clear the URL param').toMatch(
      /\.delete\(["'`]tx["'`]\)/,
    );
  });

  it("inputRowFixPath appends ?tx= for transaction_record fields so the link is correct at the source", () => {
    const src = readFileSync(AGENT_RUN_INPUT, "utf8");
    expect(src, "inputRowFixPath must append the tx param for transaction fields").toMatch(
      /tx=.*encodeURIComponent|encodeURIComponent.*tx=/,
    );
  });
});
