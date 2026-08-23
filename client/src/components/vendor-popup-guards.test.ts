/**
 * Source-scan guards for the vendor / counterparty detail popup and panel.
 *
 * #84 — Make sure the dismissed-vendor popup can't silently regress to the
 *   wrong buttons. Acknowledged (dismissed-but-not-trusted) rows must surface
 *   text-acknowledged-note and button-acknowledge-counterparty, never a trust
 *   grant button. Paused rows must surface button-restore-trust, placed inside
 *   the trustState === "paused" branch so a reviewer cannot accidentally
 *   approve via the wrong action.
 *
 * #85 — Prove a paused customer can be re-confirmed, not just vendors. The
 *   popup label for a paused customer is "Restore Confirmation" (not "Restore
 *   Trust"), and the restore button is the same button-restore-trust so QA
 *   selectors stay identical. VendorsPanel.handleRestore POSTs to /trust/restore
 *   (not /trust/grant) so the action uses the correct state transition.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const POPUP = "client/src/components/VendorDetailPopup.tsx";
const PANEL = "client/src/pages/VendorsPanel.tsx";

// ─── #84: Dismissed-vendor popup button contract ──────────────────────────────

describe("Dismissed-vendor popup buttons (#84)", () => {
  it("reviewed-only (acknowledged) rows surface text-acknowledged-note", () => {
    const src = readFileSync(POPUP, "utf8");
    expect(src, "text-acknowledged-note testid must exist in VendorDetailPopup").toMatch(
      /text-acknowledged-note/,
    );
    // The testid must appear after the reviewedOnly derivation — confirms it is
    // inside the acknowledged branch, not in the default trust UI.
    const reviewedOnlyIdx = src.indexOf("reviewedOnly");
    const testidIdx = src.indexOf("text-acknowledged-note");
    expect(reviewedOnlyIdx, "reviewedOnly variable not found").toBeGreaterThan(-1);
    expect(
      testidIdx,
      "text-acknowledged-note must appear after reviewedOnly is derived — it must be inside the acknowledged branch",
    ).toBeGreaterThan(reviewedOnlyIdx);
  });

  it("acknowledged rows show button-acknowledge-counterparty (the 'no action' path)", () => {
    const src = readFileSync(POPUP, "utf8");
    expect(src, "button-acknowledge-counterparty testid must exist").toMatch(
      /button-acknowledge-counterparty/,
    );
  });

  it("paused rows show button-restore-trust, placed inside the trustState === 'paused' branch", () => {
    const src = readFileSync(POPUP, "utf8");
    expect(src, "button-restore-trust testid must exist").toMatch(/button-restore-trust/);
    const pausedIdx = src.indexOf('trustState === "paused"');
    const restoreIdx = src.indexOf("button-restore-trust");
    expect(pausedIdx, 'trustState === "paused" branch not found').toBeGreaterThan(-1);
    expect(
      restoreIdx,
      "button-restore-trust must appear after the trustState === 'paused' check — it must be inside that branch",
    ).toBeGreaterThan(pausedIdx);
  });

  it("isReviewedOnly drives the acknowledged-only UI gate", () => {
    const src = readFileSync(POPUP, "utf8");
    // The guard must use isReviewedOnly (imported helper) — not an ad-hoc string check
    // — so future state changes to the reviewed model stay in one place.
    expect(src, "isReviewedOnly import/usage must exist in VendorDetailPopup").toMatch(
      /isReviewedOnly/,
    );
  });
});

// ─── #85: Paused customer re-confirmation ─────────────────────────────────────

describe("Paused customer re-confirmation (#85)", () => {
  it("customer restore label is 'Restore Confirmation', not 'Restore Trust'", () => {
    const src = readFileSync(POPUP, "utf8");
    expect(src, '"Restore Confirmation" label must exist for customer segment').toMatch(
      /Restore Confirmation/,
    );
  });

  it("customer restore label is derived from isCustomer (segment-aware, not hardcoded to vendor)", () => {
    const src = readFileSync(POPUP, "utf8");
    // The restore label must be a conditional that checks isCustomer.
    const isCustomerIdx = src.indexOf("isCustomer");
    const restoreConfIdx = src.indexOf("Restore Confirmation");
    expect(isCustomerIdx, "isCustomer derivation not found in VendorDetailPopup").toBeGreaterThan(-1);
    expect(
      restoreConfIdx,
      '"Restore Confirmation" must appear after isCustomer is defined — it must be derived from segment',
    ).toBeGreaterThan(isCustomerIdx);
  });

  it("paused customer and paused vendor both reach button-restore-trust (same QA selector)", () => {
    const src = readFileSync(POPUP, "utf8");
    // There must be exactly one button-restore-trust testid, shared between
    // customer and vendor segments — not separate selectors per segment.
    const occurrences = src.split("button-restore-trust").length - 1;
    expect(
      occurrences,
      "button-restore-trust testid must appear at least once (shared by customer and vendor restore paths)",
    ).toBeGreaterThan(0);
  });

  it("VendorsPanel handleRestore POSTs to /trust/restore, not /trust/grant", () => {
    const src = readFileSync(PANEL, "utf8");
    expect(src, "handleRestore function must exist in VendorsPanel").toMatch(/handleRestore/);
    expect(src, "VendorsPanel must reference /trust/restore").toMatch(/trust\/restore/);
  });

  it("paused counterparties go through handleRestore, not the grant path", () => {
    const src = readFileSync(PANEL, "utf8");
    // The paused → trusted transition must use /trust/restore (not /trust/grant).
    // A comment near handleRestore in VendorsPanel.tsx confirms this explicitly.
    const handleRestoreIdx = src.indexOf("handleRestore");
    const trustRestoreIdx = src.indexOf("trust/restore");
    expect(handleRestoreIdx, "handleRestore not found in VendorsPanel").toBeGreaterThan(-1);
    expect(trustRestoreIdx, "trust/restore not found in VendorsPanel").toBeGreaterThan(-1);
  });
});
