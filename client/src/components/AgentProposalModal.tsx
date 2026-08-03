import { useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCurrency } from "@/lib/useCurrency";
import { useCardTransition } from "@/lib/cardTransition";
import {
  buildProposalDetailRows,
  buildProposalHeadline,
  buildKeyFactRows,
  keyFactsFromPresentation,
  buildFlaggedBy,
  buildDecisionButtons,
  buildConsequences,
  buildConfidence,
  buildWhySuggested,
  buildEvidenceTiles,
  buildRefDisplayMap,
  resolveProseText,
  humanizeEnumValue,
  buildProposalHeaderCopy,
  titleCaseLabel,
  buildCollectionsDraft,
  applyCurrencyToBareAmounts,
  formatSourceAmount,
  type DecisionButton,
  type EvidenceTile,
} from "@/lib/proposalCards";
import {
  ActionButton,
  ActionRow,
  CardActionDivider,
  CardBody,
  CardSection,
  CardText,
  ConfidenceMeter,
  EvidenceLinkRow,
  HeadingValue,
  InfoBox,
  KeyFactsTable,
  PagerFooter,
  StatusPill,
  ReasonList,
  OutcomeRow,
} from "./ProposalCardParts";
import { resolveDocument, openDocumentDetail } from "@/lib/openDocumentDetail";
import type { DocumentRecord } from "@/lib/documentTypes";
import { docKindLabel } from "@/lib/documentTypes";
import { DocumentViewerPopup } from "./DocumentViewerPopup";
import { TransactionDetailPopup } from "./TransactionDetailPopup";
import { AccountDetailPopup } from "./AccountDetailPopup";
import { VendorDetailPopup } from "./VendorDetailPopup";
import { BillDetailPopup, type BrainInvoiceDTO } from "./BillDetailPopup";
import { useBrainVendors, useBrainVendorDetail } from "@/lib/brainVendors";
import { LiveEvidenceRecordPopup } from "./LiveEvidenceRecordPopup";
import {
  RISK_META,
  type AgentKey,
  type AgentProposal,
  type EvidenceLine,
  type ScenarioModule,
} from "@/lib/agentProposals";
import {
  agentKeyForProposalType,
  isNeedsReview,
  useDecideProposal,
  type BrainProposal,
  type ProposalAmount,
  type ProposalDecision,
} from "@/lib/brainProposals";

/* One reusable shell for all 11 agents: header, why, evidence, confidence
   → scenario module → recommended action → next steps → risk note → footer.
   ONLY the scenario-module slot swaps per agent (see renderScenarioModule).
   Propose-mode records get Reject / Edit / Approve; notify-only records get a
   single Acknowledge; approved_automatically records get a disabled footer
   with an Undo link. */

export type AgentModalAction = "approve" | "reject" | "acknowledge" | "undo";

import type { AgentModalEditPayload } from "@/lib/agentProposals";
import { InfoIcon } from "@/components/Callout";
import { capitalCase } from "@/lib/displayLabels";
export type { AgentModalEditPayload };



/* ── LIVE mode: brain-core /v1/proposals (BrainProposal, client/src/lib/brainProposals.ts) ──
   This file used to also carry a static modal for the fabricated 11-agent
   AgentProposal shape (agentProposals.ts). Nothing rendered it, and it kept
   drawing an Edit control brain-core has no decision for, so a rule applied to
   "all cards" was never true of it. It was deleted rather than maintained.

   What remains is the honest render for the live wire shape: only sections the
   record actually carries data for are shown. No scenarioModule,
   recommendedAction or whatHappensNext is fabricated to fill a gap, and there is
   no Edit flow. Mirrors LiveInsightModal's conditional rendering for
   brainAgentSurfaces.ts's LiveInsight. */

/** Display name per agent, matching the copy already used per-record in
 *  agentProposals.ts's AGENT_PROPOSALS (client-owned presentation, not brain-core data). */
/** Agents whose approved action sends a message to someone outside the company
 *  (today: the dunning reminder Collections mails to a customer). */
const SENDS_OUTBOUND_MESSAGE = new Set<AgentKey>(["collections"]);

export const AGENT_DISPLAY_NAME: Record<AgentKey, string> = {
  vendor_risk: "Vendor Risk",
  payment: "Payment",
  collections: "Collections",
  treasury: "Treasury",
  cash_forecast: "Cash Forecasting",
  dispute: "Dispute",
  compliance: "Compliance",
  revenue_intel: "Revenue Intelligence",
  reconciliation: "Reconciliation",
  subscription: "Subscription",
  fraud_anomaly: "Fraud and Anomaly",
  bill_management: "Bill Management",
  debt_optimization: "Debt Optimization",
  financial_health: "Financial Health",
  personal_budget: "Personal Budget",
  purchase_advisor: "Purchase Advisor",
  savings: "Savings",
  tax_prep: "Tax Prep",
  travel_finance: "Travel Finance",
};

/** Footer button for one entry of `available_decisions`.
 *
 *  Colour follows the decision's TONE (approve green / reject red / neutral
 *  purple) rather than its position, so a card offering only Acknowledge gets the
 *  single full-width purple button the Invoice / Cash Agent card uses, and one
 *  offering Approve + Reject gets that pair in the same colours as before.
 *
 *  A decision id outside the documented write set renders disabled: brain-core
 *  publishes domain labels ahead of the write verbs that accept them, and a
 *  button that always errors is worse than one that says it is not available. */
export function LiveProposalModal({
  proposal,
  open,
  onOpenChange,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  pagerStep,
  position,
}: {
  proposal: BrainProposal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Queue paging. Both handlers must be supplied or the pager is not rendered —
   *  a footer with one live button reads as a broken control. */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** True when this surface was opened by a Previous/Next step rather than by
   *  the user picking a record. Skips the entrance animation — see
   *  useCardTransition. */
  pagerStep?: boolean;
  /** "3 of 12", announced to screen readers only. */
  position?: string;
}) {
  const decide = useDecideProposal();
  const { formatText } = useCurrency();
  const transition = useCardTransition(open, pagerStep);
  const [showTechnical, setShowTechnical] = useState(false);
  const [openTransactionId, setOpenTransactionId] = useState<string | null>(null);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const [openVendorId, setOpenVendorId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [fallbackEvidence, setFallbackEvidence] = useState<EvidenceTile | null>(null);
  const { vendors } = useBrainVendors();
  const vendorBase = vendors.find((vendor) => vendor.id === openVendorId) ?? null;
  const vendorDetail = useBrainVendorDetail(vendorBase);
  const { data: invoiceResponse } = useQuery<{ invoices: BrainInvoiceDTO[] }>({
    queryKey: ["/api/brain/ledger/invoices"],
    enabled: openInvoiceId !== null,
    retry: false,
  });
  const invoices = invoiceResponse?.invoices ?? [];
  const openInvoice = invoices.find((invoice) => invoice.id === openInvoiceId) ?? null;

  if (!proposal) return null;

  const agentKey = agentKeyForProposalType(proposal.type);
  const agentName = proposal.agent?.display_name || AGENT_DISPLAY_NAME[agentKey];
  const isPaymentAgent = agentKey === "payment" || /^(?:demo\s+)?payment agent$/i.test(agentName.trim());
  const normalizedAgentName = isPaymentAgent ? "Payment Agent" : agentName.trim();
  /* Card titles name the agent WITHOUT the word "Agent" — "Payment", not
     "Payment Agent". Core's display_name sometimes carries the suffix already,
     so strip it rather than assuming it is absent. */
  const agentHeaderName = normalizedAgentName.replace(/\s*\bagent\b\s*$/i, "").trim() || normalizedAgentName;
  const risk = proposal.risk_band ? RISK_META[proposal.risk_band] : null;
  const needsReview = isNeedsReview(proposal);

  /* ── Rich card fields (brain-core #384) ──────────────────────────────────────
     Each is OPTIONAL on the wire, and every section below renders only when its
     own data survived. A record from before the contract shipped still produces
     the original compact card rather than a page of empty headings. */
  const presentation = proposal.presentation ?? null;
  const policy = proposal.policy ?? presentation?.policy ?? null;
  const confidence = buildConfidence(proposal.confidence, presentation?.confidence_band);
  const flaggedBy = buildFlaggedBy(policy);
  /* "Why Brain Suggested This" — read back from the policy trace / ranked signals
     the engine recorded. Empty for a record that carries neither, which drops the
     section rather than inventing reasons. */
  const whySuggested = buildWhySuggested(policy, proposal.details);
  const decisions = buildDecisionButtons(proposal.available_decisions, presentation?.actions);
  const consequences = buildConsequences(presentation?.consequences, decisions);

  // `evidence` is defensive: this record can arrive from any cached /proposals
  // read, and the enriching route is not the only way one reaches this modal.
  const evidence = proposal.evidence ?? [];
  const subjectName = proposal.subject?.display ?? null;
  // Amounts are structured {value, currency}; formatText applies the user's
  // active display currency + FX rate. Never pre-formatted server-side.
  const money = (a: ProposalAmount) => formatText(`${a.currency} ${a.value}`);
  const headline = buildProposalHeadline(evidence);
  /* Core's own sentences: tag the bare ledger amounts it writes ("… for 50000.00")
     with the currency its evidence cites, then run the whole line through the
     active display currency. */
  const prose = (t: string) => formatText(applyCurrencyToBareAmounts(t, headline.amount?.currency ?? null));
  // "AR-MIDMARKET-001 · $42,000.00" — each half omitted when the cited records
  // don't carry it, rather than shown blank.
  const headerCopy = buildProposalHeaderCopy(
    proposal,
    agentName,
    formatText,
  );
  const allRows = buildProposalDetailRows(evidence, subjectName, money, headline.code);
  /* Every derived row is shown. These used to be capped at MAX_VISIBLE_DETAIL_ROWS
     with the remainder spilling into Technical Detail; with that section gone the
     cap would silently discard facts instead of relocating them, and a key-facts
     table that quietly drops rows is worse than a slightly longer card. */
  const visibleRows = allRows;

  /* Key facts: brain-core's own table, with ids already swapped for names by the
     BFF. `keyFactsFromPresentation` is the fallback for a record that reached this
     modal without passing through the enriching route — it applies the same
     primary/technical split, just without the id→name resolution.
     The currency cited by the proposal's own evidence backs amounts on tables
     that omit a Currency row. */
  const resolvedFacts = proposal.key_facts ?? keyFactsFromPresentation(presentation?.key_facts);
  const keyFacts = buildKeyFactRows(resolvedFacts, money, headline.amount?.currency ?? null);
  /* Evidence the card can NAME. Unresolved refs and wiki context are excluded here
     and appear only in the technical section (buildEvidenceTiles). */
  const evidenceTiles = buildEvidenceTiles(evidence);

  const openEvidenceRecord = (tile: EvidenceTile) => {
    const ref = tile.ref.replace(/^wiki:\/*/, "").split("/").pop() || tile.ref;
    const kind = tile.kind.toLowerCase();

    if (kind === "transaction" || kind === "payment") {
      setFallbackEvidence(null);
      setOpenTransactionId(ref);
      return;
    }
    if (kind === "account" || kind === "balance") {
      setFallbackEvidence(null);
      setOpenAccountId(ref);
      return;
    }
    if (kind === "counterparty" || kind === "vendor" || kind === "customer") {
      setFallbackEvidence(null);
      setOpenVendorId(ref);
      return;
    }
    if (kind === "invoice") {
      setFallbackEvidence(null);
      setOpenInvoiceId(ref);
      return;
    }
    /* Obligations/payables do not have a by-id endpoint or a dedicated popup.
       Keep the row tappable and show the facts the proposal actually carries. */
    setFallbackEvidence(tile);
  };

  const closeEvidenceRecord = () => {
    setOpenTransactionId(null);
    setOpenAccountId(null);
    setOpenVendorId(null);
    setOpenInvoiceId(null);
    setFallbackEvidence(null);
  };
  /* The structured table brain-core sends supersedes the rows we derive from
     evidence — same job, but authored upstream and type-aware. */
  const detailRows = keyFacts.primary.length > 0 ? keyFacts.primary : visibleRows;
  /* brain-core's headline names its subject by raw id ("tx_01KY… fraud anomaly
     risk is elevated"). Swap in the names we resolved; an id that resolved to
     nothing is dropped rather than shown on the card face. */
  const refDisplays = buildRefDisplayMap(resolvedFacts, evidence, proposal.resolved_refs);
  /* Core's narrative names its subject by raw id too. */
  const cardNarrative = resolveProseText(proposal.narrative, refDisplays);
  const recommendation = presentation?.recommendation?.trim()
    ? humanizeEnumValue(presentation.recommendation.trim())
    : null;

  /* Collections is the only agent whose approved action sends text to a third
     party, so it is the only one that gets a draft to preview.
     The draft quotes the amount in the RECORD's currency, not the operator's
     display currency: the customer owes what the invoice says, and an FX-converted
     figure in a chase note would be wrong. Everything else on the card stays in
     the display currency. */
  const messageDraft = SENDS_OUTBOUND_MESSAGE.has(agentKey)
    ? buildCollectionsDraft(
        buildKeyFactRows(resolvedFacts, formatSourceAmount, headline.amount?.currency ?? null).primary,
        subjectName,
        null,
      )
    : null;

  const showPager = Boolean(onPrev && onNext);

  const act = (decision: ProposalDecision) => {
    decide.mutate({ id: proposal.id, decision }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] ${transition.overlay}`}
          data-testid="live-proposal-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="live-proposal-modal"
          className={`fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none ${transition.card}`}
        >
          {/* Header — agent name centered, close right. No avatar anywhere on the
              card: the agent is named once, here. */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center px-[16px]">
            <DialogPrimitive.Title
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4] text-center whitespace-nowrap"
              data-testid="text-live-proposal-agent-name"
            >
              {agentHeaderName}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              data-testid="button-live-proposal-close"
              className="absolute right-[11px] top-[11px] size-[32px] flex items-center justify-center rounded-full bg-[#222737] hover:bg-[#2a3050] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <X size={16} className="text-[#6c779d]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col items-start w-full overflow-y-auto">
            {/* Hero — risk pill directly under the header, then the headline group. */}
            <div className="border-b border-[#1d2132] border-solid flex flex-col gap-[8px] items-start p-[24px] shrink-0 w-full">
              {risk && (
                <StatusPill
                  label={titleCaseLabel(risk.label)}
                  color={risk.color}
                  background={risk.bg}
                  border={risk.border}
                  testId="pill-live-proposal-risk"
                />
              )}
              <div className="flex flex-col gap-[8px] items-start w-full">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-[#a8b9f4] w-full"
                  data-testid="text-live-proposal-subject"
                >
                  {headerCopy.title}
                </p>
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] w-full"
                  data-testid="text-live-proposal-headline"
                >
                  {headerCopy.text}
                </p>
              </div>
            </div>

            <CardBody>
              {/* 1 — Why Brain Suggested This. The signals the engine itself
                  recorded (policy trace / ranked signals), never client-authored
                  copy; a record that recorded none drops the section. */}
              {whySuggested.length > 0 && (
                <CardSection title="Why Brain Suggested This">
                  <ReasonList reasons={whySuggested} testId="list-live-proposal-why-suggested" />
                </CardSection>
              )}

              {/* 2 — Confidence: "High · 47%". The band is brain-core's own, not
                  derived from the percentage: the two legitimately differ (a strong
                  signal the model is only moderately certain about). */}
              {confidence && (
                <CardSection
                  title="Confidence"
                  trailing={<HeadingValue testId="text-live-proposal-confidence">{confidence.text}</HeadingValue>}
                  testId="bar-live-proposal-confidence"
                >
                  <ConfidenceMeter pct={confidence.pct} />
                </CardSection>
              )}

              {/* The agent's own reasoning, then the structured facts behind it. */}
              {(cardNarrative || detailRows.length > 0) && (
                <CardSection title="Why This Needs Your Decision">
                  {cardNarrative && (
                    <CardText testId="text-live-proposal-narrative">{prose(cardNarrative)}</CardText>
                  )}
                  {detailRows.length > 0 && (
                    <KeyFactsTable rows={detailRows} testId="list-live-proposal-details" />
                  )}
                </CardSection>
              )}

              {/* Linked Evidence — Wiki-resolved records only. A ref that resolved to
                  nothing yields NO row: the only thing left to show would be the raw
                  id, which this view must not put in front of an approver. */}
              {evidenceTiles.length > 0 && (
                <CardSection title="Linked Evidence" gap={8}>
                  <div className="flex flex-col gap-[8px] items-start w-full" data-testid="list-live-proposal-evidence">
                    {evidenceTiles.map((tile, i) => (
                      <EvidenceLinkRow
                        key={`${tile.label}-${tile.display}-${i}`}
                        label={tile.display}
                        kind={tile.label}
                        onClick={() => openEvidenceRecord(tile)}
                        testId={`tile-live-proposal-evidence-${i}`}
                      />
                    ))}
                  </div>
                </CardSection>
              )}

              {/* Message Draft — agent-specific, and placed here because the frame
                  puts the draft between the evidence and the recommendation: you read
                  what will be sent, then what Brain advises doing about it.
                  Composed from this proposal's own facts so the approver can read the
                  chase note before approving. brain-core still generates the text that
                  actually goes out at execution time, which the caption says plainly. */}
              {messageDraft && (
                <CardSection title="Message Draft" testId="section-live-proposal-message-draft">
                  <div className="bg-[#0a0c10] border border-solid border-[#1d2132] rounded-[12px] p-[16px] w-full flex flex-col gap-[12px]">
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[20px] text-[#a8b9f4]"
                      data-testid="text-live-proposal-message-subject"
                    >
                      Subject: {messageDraft.subject}
                    </p>
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-pre-wrap"
                      data-testid="text-live-proposal-message-body"
                    >
                      {messageDraft.body}
                    </p>
                  </div>
                  <InfoBox testId="box-live-proposal-message-note">
                    Draft for review, composed from this proposal's facts. Brain generates the
                    final wording when the message is sent.
                  </InfoBox>
                </CardSection>
              )}

              {/* 5 — Recommended Action: brain-core's `presentation.recommendation`.
                  It sits after the evidence so the advice follows the facts that
                  justify it, and immediately before the outcomes it leads to. */}
              {recommendation && (
                <CardSection title="Recommended Action">
                  <CardText testId="text-live-proposal-recommendation">{recommendation}</CardText>
                </CardSection>
              )}

              {/* 6 — What Happens Next: brain-core's own consequence text, one row per
                  decision the card actually offers, the glyph carrying the tone.
                  Reject is a row here rather than a separate "If This Is Wrong"
                  section — the frame lists every branch together so the approver
                  compares them side by side before choosing. A decision core wrote no
                  consequence for produces no row, and a section with no rows is
                  dropped rather than filled with generic reassurance. */}
              {(consequences.next.length > 0 || consequences.ifWrong.length > 0 || flaggedBy) && (
                <CardSection title="What Happens Next">
                  {[
                    ...consequences.next.map((line) => ({
                      line,
                      testId: `text-live-proposal-next-${line.decisionId}`,
                    })),
                    ...consequences.ifWrong.map((line) => ({
                      line,
                      testId: `text-live-proposal-if-wrong-${line.decisionId}`,
                    })),
                  ].map(({ line, testId }) => (
                    <OutcomeRow
                      key={line.decisionId}
                      tone={decisions.find((d) => d.id === line.decisionId)?.tone ?? "edit"}
                      label={line.label}
                      testId={testId}
                    >
                      {prose(line.text)}
                    </OutcomeRow>
                  ))}
                  {/* Flagged by — policy_id, else the matched rule, else the policy's
                      own content. Omitted outright when the record carries no policy
                      at all, never rendered as "Flagged by —". */}
                  {flaggedBy && (
                    <CardText tone="muted" testId={`text-live-proposal-flagged-by-${flaggedBy.source}`}>
                      Flagged by <span className="text-[#a8b9f4]">{flaggedBy.text}</span>
                    </CardText>
                  )}
                </CardSection>
              )}

              {/* Decisions close the card, as in the frame. Buttons come from
                  `available_decisions`, so a compliance finding offers only
                  Acknowledge, a fraud hold only its own decision, and a treasury
                  sweep Approve / Reject — without this component knowing anything
                  about those types. Labels are brain-core's; the wire value stays
                  the documented write verb (see buildDecisionButtons). */}
              <CardActionDivider testId="divider-live-proposal-actions" />

              {needsReview && decisions.length > 0 ? (
                <ActionRow testId="group-live-proposal-decisions">
                  {decisions.map((d) => (
                    <ActionButton
                      key={d.id}
                      label={d.label}
                      tone={d.tone}
                      disabled={!d.writable || decide.isPending}
                      title={
                        d.writable
                          ? (d.meaning ?? undefined)
                          : `brain-core offers "${d.id}", which this app cannot submit yet.`
                      }
                      onClick={d.writable ? () => act(d.id as ProposalDecision) : undefined}
                      testId={`button-live-proposal-decision-${d.id}`}
                    />
                  ))}
                </ActionRow>
              ) : needsReview ? (
                /* Pending, but core offered no decision this client can write. Say so
                   rather than showing an Approve button that would 400. */
                <CardText className="text-center" testId="text-live-proposal-no-decisions">
                  No decision is available for this proposal.
                </CardText>
              ) : (
                <CardText className="text-center" testId="text-live-proposal-decided">
                  Decision recorded: {proposal.status}
                </CardText>
              )}
            </CardBody>
          </div>

          {showPager && (
            <PagerFooter
              onPrev={onPrev!}
              onNext={onNext!}
              hasPrev={hasPrev}
              hasNext={hasNext}
              position={position}
            />
          )}

          {/* Linked evidence opens the same record surfaces used elsewhere in the
              app. These are nested over the proposal card so closing the record
              returns the user to the exact review card they were reading. */}
          <TransactionDetailPopup
            txId={openTransactionId}
            onClose={closeEvidenceRecord}
            hidePager
          />
          <AccountDetailPopup
            accountId={openAccountId}
            onClose={closeEvidenceRecord}
            onOpenTransaction={(id) => {
              setOpenAccountId(null);
              setOpenTransactionId(id);
            }}
            hidePager
          />
          <VendorDetailPopup
            vendor={vendorDetail}
            open={openVendorId !== null && vendorDetail !== null}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closeEvidenceRecord();
            }}
            pagerDisabled
          />
          <BillDetailPopup
            bill={openInvoice}
            vendorName={
              vendors.find((vendor) => vendor.id === openInvoice?.counterparty_id)?.name ??
              "Unknown counterparty"
            }
            bills={invoices}
            onClose={closeEvidenceRecord}
            onSelectBill={(nextBill) => setOpenInvoiceId(nextBill.id)}
            hidePager
          />
          <LiveEvidenceRecordPopup
            evidence={fallbackEvidence}
            open={fallbackEvidence !== null}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closeEvidenceRecord();
            }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Compact row for a live proposal, matching LiveInsightRow/ProposalRow's existing
 *  styling. Works off the list SUMMARY shape (no fan-out needed just to render a row). */
export const LiveProposalRow = ({
  proposal,
  onClick,
}: {
  proposal: BrainProposal;
  onClick: () => void;
}) => {
  const risk = proposal.risk_band ? RISK_META[proposal.risk_band] : null;
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      data-testid={`row-live-proposal-${proposal.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate min-w-0">
          {AGENT_DISPLAY_NAME[agentKeyForProposalType(proposal.type)]}
        </p>
        {risk && (
          <span
            className="[font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] px-[8px] py-[2px] rounded-[100px] whitespace-nowrap shrink-0 w-fit"
            style={{ color: risk.color, background: risk.bg, border: `1px solid ${risk.border}` }}
          >
            {risk.label}
          </span>
        )}
      </div>
    </div>
  );
};
