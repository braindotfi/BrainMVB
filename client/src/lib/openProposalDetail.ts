import {
  ADOBE_SETTLED,
  AWS_SETTLED,
  COMCAST_SETTLED,
  MOCK_PROPOSALS,
  NOTION_RENEWAL_FLAGGED,
  PAYROLL_SETTLED,
  USDC_SWEEP_SETTLED,
} from "./mockProposals";
import type { Proposal } from "./proposalTypes";

/* ── Single source of truth for opening a proposal's detail sheet ─────────────
   Every PROPOSAL REFERENCE across the app (Audit Log record popup, and any other
   linked-evidence surface) resolves the same way: look the proposal up by id
   across every place a proposal can live — the pending review queue
   (MOCK_PROPOSALS) and the standalone settled/held records — then, only if it
   resolves, deep-link to the ReviewPage with `?proposal=<id>` so it auto-opens
   that exact record. Callers
   use `resolveProposal` to decide whether to render a tappable link or plain
   text; they never duplicate the lookup. An unresolved id is a bug (dangling
   reference) — we `console.warn` loudly rather than fail silently. Mirrors
   openRuleDetail / openVendorDetail / openDocumentDetail. */

/* Every source a proposal can be referenced from. Standalone settled/held
   records aren't in the queue arrays, so they're listed explicitly. Exported so
   dev guards (ruleConsistencyCheck) can assert coherence over the SAME complete
   set of proposals — otherwise standalone twins escape the lifecycle checks. */
export function allProposals(): Proposal[] {
  return [
    ...MOCK_PROPOSALS,
    ADOBE_SETTLED,
    AWS_SETTLED,
    COMCAST_SETTLED,
    PAYROLL_SETTLED,
    USDC_SWEEP_SETTLED,
    NOTION_RENEWAL_FLAGGED,
  ];
}

export function resolveProposal(
  proposalId: string | null | undefined,
): Proposal | undefined {
  if (!proposalId) return undefined;
  return allProposals().find((p) => p.id === proposalId);
}

/** Deep-link to a proposal's detail if (and only if) it resolves. Returns whether it did. */
export function openProposalDetail(
  proposalId: string | null | undefined,
  navigate: (to: string) => void,
  returnTo?: string,
): boolean {
  const proposal = resolveProposal(proposalId);
  if (!proposal) {
    console.warn(
      `openProposalDetail: no proposal found for id '${proposalId ?? ""}'`,
    );
    return false;
  }
  // `returnTo` lets a caller (e.g. the Audit Log record popup) request that
  // closing the proposal sheet returns to where it came from, mirroring the
  // stacked invoice-viewer experience. ReviewPage reads `?from=` on open.
  const suffix = returnTo ? `&from=${encodeURIComponent(returnTo)}` : "";
  navigate(`/review?proposal=${proposal.id}${suffix}`);
  return true;
}
