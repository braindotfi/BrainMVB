import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* Source-scan regression test for the modal shell standard (see CLAUDE.md
   "Modal shell standard"). No jsdom rendering — same precedent as
   client/src/lib/debtIdentity.test.ts's payable/bill shell check: read the
   file text, assert on the literal className strings. This exists because
   #128 shipped a PR whose own docs claimed SecurityModals.tsx was converged
   while two of its three Dialog.Overlay/Content pairs still weren't. */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

/* Every file that renders a Dialog.Overlay / DialogPrimitive.Overlay. */
const OVERLAY_FILES = [
  "AccountDetailPopup.tsx",
  "AddAccountModal.tsx",
  "AddGoalModal.tsx",
  "AgentProposalModal.tsx",
  "AuditRecordPopup.tsx",
  "BillingModals.tsx",
  "ContactUpdateModal.tsx",
  "DeleteConfirmDialog.tsx",
  "DocumentViewerPopup.tsx",
  "LiveEvidenceRecordPopup.tsx",
  "LiveInsightModal.tsx",
  "MemberDetailPopup.tsx",
  "MissingEvidenceModal.tsx",
  "OnboardingFlow.tsx",
  "ProposalDetail.tsx",
  "ReviewItems.tsx",
  "SecurityModals.tsx",
  "TransactionDetailPopup.tsx",
  "VendorDetailPopup.tsx",
  "detailPopup.tsx",
  "settings/figma/TeamSection.tsx",
  "ui/alert-dialog.tsx",
  "ui/dialog.tsx",
  "../pages/RuleDetail.tsx",
  "../pages/VendorsPanel.tsx",
];

describe("modal shell — overlay blur", () => {
  it("no Dialog.Overlay uses backdrop-blur-sm (must be backdrop-blur-[2px])", () => {
    for (const f of OVERLAY_FILES) {
      const src = read(f);
      for (const line of src.split("\n")) {
        if (/Overlay/.test(line) && /backdrop-blur-sm\b/.test(line)) {
          throw new Error(
            `${f}: Dialog.Overlay uses backdrop-blur-sm, not backdrop-blur-[2px]\n  ${line.trim()}`,
          );
        }
      }
    }
  });
});

/* Width standard: 480 (detail popups), 400 (forms), 375 (compact confirms).
   Named exceptions are exactly the holdouts CLAUDE.md's "Modal shell
   standard" section documents — real, tracked drift, not silent drift.
   Delete a row here the moment its file converges, so this test starts
   failing on the *next* new violation instead of quietly agreeing with the
   old one. */
const ALLOWED_WIDTHS = [480, 400, 375];
const WIDTH_EXCEPTIONS: Record<string, number[]> = {
  "MissingEvidenceModal.tsx": [520],
  "DocumentViewerPopup.tsx": [560],
  "MemberDetailPopup.tsx": [440],
  "settings/figma/TeamSection.tsx": [440],
  "../pages/RuleDetail.tsx": [440], // resume-rule modal; its delete-rule modal is already 375
  "../pages/VendorsPanel.tsx": [374],
};

/* Files whose fixed, centered Dialog.Content declares width as a literal
   `w-[NNpx]` class. BillingModals' local ModalShell instead passes width via
   a `style={{ width }}` prop (480/400, already on-standard) — not
   scannable by this regex, and not worth a second scan mechanism for the
   one file that's already compliant. */
const WIDTH_FILES = [
  "AccountDetailPopup.tsx",
  "AddAccountModal.tsx",
  "AddGoalModal.tsx",
  "AgentProposalModal.tsx",
  "AuditRecordPopup.tsx",
  "ContactUpdateModal.tsx",
  "DeleteConfirmDialog.tsx",
  "DocumentViewerPopup.tsx",
  "LiveEvidenceRecordPopup.tsx",
  "LiveInsightModal.tsx",
  "MemberDetailPopup.tsx",
  "MissingEvidenceModal.tsx",
  "OnboardingFlow.tsx",
  "ProposalDetail.tsx",
  "ReviewItems.tsx",
  "SecurityModals.tsx",
  "TransactionDetailPopup.tsx",
  "VendorDetailPopup.tsx",
  "detailPopup.tsx",
  "settings/figma/TeamSection.tsx",
  "../pages/RuleDetail.tsx",
  "../pages/VendorsPanel.tsx",
];

describe("modal shell — width standard", () => {
  it("every fixed, centered modal frame is 480/400/375px or a named exception", () => {
    for (const f of WIDTH_FILES) {
      const src = read(f);
      const lines = src.split("\n");
      let checked = 0;
      lines.forEach((line, i) => {
        const isCentered =
          /\bfixed\b/.test(line) &&
          /(left-\[50%\]|left-1\/2)/.test(line) &&
          /(top-\[50%\]|top-1\/2)/.test(line);
        if (!isCentered) return;

        // A width may come from an adjoining `style={{ width }}` prop
        // (e.g. BillingModals' local ModalShell) instead of a literal
        // `w-[NNpx]` class — those are numeric-prop driven and already
        // caller-verified, not this scan's concern.
        const window = [lines[i - 1] ?? "", line, lines[i + 1] ?? ""].join("\n");
        if (/style=\{\{\s*width/.test(window)) return;

        checked++;
        const m = line.match(/w-\[(\d+)px\]/);
        expect(m, `${f}: centered Content line has no w-[NNpx] class\n  ${line.trim()}`).not.toBeNull();
        const width = Number(m![1]);
        const allowed = [...ALLOWED_WIDTHS, ...(WIDTH_EXCEPTIONS[f] ?? [])];
        expect(
          allowed,
          `${f}: width ${width}px is neither a standard width nor a documented exception`,
        ).toContain(width);
      });
      expect(checked, `${f}: expected at least one fixed, centered Dialog.Content line`).toBeGreaterThan(0);
    }
  });
});
